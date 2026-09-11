import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { EarthRepository } from "./earth-repository";

const directories: string[] = [];

async function createFixture() {
  const directory = await mkdtemp(join(tmpdir(), "earth-runtime-"));
  directories.push(directory);
  const path = join(directory, "earth.sqlite");
  const database = new Database(path);
  database.exec(`
    CREATE TABLE build_manifest (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
    CREATE TABLE source_snapshots (snapshot_id TEXT PRIMARY KEY, celex TEXT NOT NULL, content_sha256 TEXT NOT NULL, retrieved_at TEXT NOT NULL, work_uri TEXT NOT NULL, expression_uri TEXT NOT NULL, manifestation_uri TEXT NOT NULL, content_url TEXT NOT NULL, tree_notice_url TEXT NOT NULL) STRICT;
    CREATE TABLE works (id TEXT PRIMARY KEY, celex TEXT NOT NULL, work_uri TEXT NOT NULL, expression_uri TEXT NOT NULL, manifestation_uri TEXT NOT NULL, measure_type TEXT NOT NULL, metadata_source_url TEXT NOT NULL, official_title TEXT NOT NULL, snapshot_id TEXT NOT NULL REFERENCES source_snapshots(snapshot_id)) STRICT;
    CREATE TABLE boundary_works (id TEXT PRIMARY KEY, celex TEXT NOT NULL, work_uri TEXT NOT NULL, official_title TEXT NOT NULL, source_url TEXT NOT NULL) STRICT;
    CREATE TABLE nodes (id TEXT PRIMARY KEY, work_id TEXT REFERENCES works(id), boundary_work_id TEXT REFERENCES boundary_works(id), parent_id TEXT REFERENCES nodes(id), entity_kind TEXT NOT NULL, logical_id TEXT NOT NULL, label TEXT NOT NULL, title TEXT, text TEXT, content_hash TEXT, source_locator TEXT, display_order INTEGER NOT NULL) STRICT;
    CREATE TABLE official_relationships (id TEXT PRIMARY KEY, source_node_id TEXT NOT NULL REFERENCES nodes(id), target_node_id TEXT NOT NULL REFERENCES nodes(id), relation_type TEXT NOT NULL, provenance TEXT NOT NULL, evidence_text TEXT NOT NULL, evidence_locator TEXT NOT NULL, evidence_source_url TEXT NOT NULL) STRICT;
  `);
  database.prepare("INSERT INTO build_manifest VALUES (?, ?)").run(
    "manifest_json",
    JSON.stringify({
      schemaVersion: "0.1.0",
      buildId: "earth-test",
      builtAt: "2026-09-10T00:00:00.000Z",
      universeId: "eu-banking-10",
      universeVersion: "0.1.0",
      compilerVersion: "0.1.0",
      sourceSnapshotIds: ["snap-1"],
      counts: { works: 1, boundaryWorks: 1, nodes: 4, relationships: 1 },
    }),
  );
  database
    .prepare("INSERT INTO source_snapshots VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(
      "snap-1",
      "32022R2554",
      "a".repeat(64),
      "2026-09-10T00:00:00.000Z",
      "https://example.test/work",
      "https://example.test/expression",
      "https://example.test/manifestation",
      "https://example.test/content",
      "https://example.test/notice",
    );
  database
    .prepare("INSERT INTO works VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(
      "work:dora",
      "32022R2554",
      "https://example.test/work",
      "https://example.test/expression",
      "https://example.test/manifestation",
      "other",
      "https://example.test/metadata",
      "DORA",
      "snap-1",
    );
  database
    .prepare("INSERT INTO boundary_works VALUES (?, ?, ?, ?, ?)")
    .run(
      "earth:work:39998R9998",
      "39998R9998",
      "https://example.test/boundary-work",
      "Test-only boundary title",
      "https://example.test/boundary-work",
    );
  const insertNode = database.prepare(
    "INSERT INTO nodes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  insertNode.run(
    "node:dora",
    "work:dora",
    null,
    null,
    "document",
    "32022R2554",
    "DORA",
    "DORA",
    null,
    null,
    null,
    1,
  );
  insertNode.run(
    "node:article-1",
    "work:dora",
    null,
    "node:dora",
    "article",
    "Article 1",
    "Article 1",
    null,
    "Scope",
    null,
    "art_1",
    1,
  );
  insertNode.run(
    "node:article-2",
    "work:dora",
    null,
    "node:dora",
    "article",
    "Article 2",
    "Article 2",
    null,
    "Definitions",
    null,
    "art_2",
    2,
  );
  insertNode.run(
    "earth:work:39998R9998",
    null,
    "earth:work:39998R9998",
    null,
    "external-work",
    "earth:work:39998R9998",
    "CELEX 39998R9998",
    "Test-only boundary title",
    null,
    null,
    "https://example.test/boundary-work",
    0,
  );
  database
    .prepare(
      "INSERT INTO official_relationships VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      "relationship:one",
      "node:article-1",
      "earth:work:39998R9998",
      "REFERENCES",
      "LEGAL_TEXT",
      "Article 1",
      "art_1",
      "https://example.test/content",
    );
  database.close();
  return path;
}

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("EarthRepository", () => {
  it("opens only a separately supplied artifact and projects bounded graph reads", async () => {
    const repository = new EarthRepository(await createFixture());
    expect(repository.listUniverses()).toEqual([
      { id: "eu-banking-10", version: "0.1.0", displayName: "eu-banking-10" },
    ]);
    expect(repository.overview("eu-banking-10")?.works).toHaveLength(1);
    expect(repository.overview("eu-banking-10")?.boundary).toMatchObject({
      nodeCount: 1,
      matchCount: 1,
      returnedCount: 1,
      relationshipCount: 1,
      visibleRelationshipCount: 1,
      limit: 100,
      offset: 0,
      hasMore: false,
    });
    expect(repository.overview("eu-banking-10")?.aggregates[0]).toMatchObject({
      source: "work:dora",
      target: "earth:work:39998R9998",
      count: 1,
    });
    expect(repository.children("node:dora", 1).map((node) => node.id)).toEqual([
      "node:article-1",
    ]);
    expect(
      repository.neighbourhood("node:article-1", {
        depth: 1,
        nodeLimit: 2,
        edgeLimit: 1,
        direction: "out",
      })?.relationships,
    ).toHaveLength(1);
    expect(
      repository.relationshipDetail("relationship:one")?.evidence.locator,
    ).toBe("art_1");
    repository.close();
  });

  it("bounds and filters boundary Works without changing total counts", async () => {
    const repository = new EarthRepository(await createFixture());
    const missing = repository.overview("eu-banking-10", {
      boundaryLimit: 1,
      boundaryQuery: "not-present",
    });
    expect(missing).toMatchObject({
      relationshipCount: 1,
      aggregates: [],
      boundary: {
        nodes: [],
        nodeCount: 1,
        matchCount: 0,
        returnedCount: 0,
        relationshipCount: 1,
        visibleRelationshipCount: 0,
        hasMore: false,
      },
    });
    const matching = repository.overview("eu-banking-10", {
      boundaryLimit: 1,
      boundaryQuery: "boundary title",
    });
    expect(matching?.boundary.nodes).toHaveLength(1);
    expect(matching?.aggregates).toHaveLength(1);
    expect(
      repository.overview("eu-banking-10", {
        boundaryQuery: "%",
      })?.boundary.matchCount,
    ).toBe(0);
    repository.close();
  });

  it("returns an empty exact graph safely when no relationships are published", async () => {
    const path = await createFixture();
    const database = new Database(path);
    database.prepare("DELETE FROM official_relationships").run();
    database.close();
    const repository = new EarthRepository(path);
    expect(repository.overview("eu-banking-10")?.aggregates).toEqual([]);
    expect(
      repository.neighbourhood("node:article-1", {
        depth: 3,
        nodeLimit: 10,
        edgeLimit: 10,
        direction: "both",
      })?.relationships,
    ).toEqual([]);
    repository.close();
  });
});
