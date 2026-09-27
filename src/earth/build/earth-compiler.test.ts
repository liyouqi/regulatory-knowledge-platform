import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { acquireEarthCellarRelations } from "../acquisition/cellar-relation-source";
import { EarthRepository } from "../runtime/earth-repository";
import { compileEarthArtifact } from "./earth-compiler";
import { verifyEarthArtifact } from "./verify-earth-artifact";

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ACT>
  <TITLE><TI><P>Test-only regulation</P></TI></TITLE>
  <ENACTING.TERMS><DIVISION>
    <TITLE><TI><P>CHAPTER I</P></TI><STI><P>General provisions</P></STI></TITLE>
    <ARTICLE IDENTIFIER="001"><TI.ART>Article 1</TI.ART><STI.ART>Fixture</STI.ART><ALINEA>Test-only text.</ALINEA></ARTICLE>
  </DIVISION></ENACTING.TERMS>
</ACT>`;

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function writeSnapshot(directory: string): Promise<void> {
  const tree = new TextEncoder().encode("<NOTICE />");
  const content = new TextEncoder().encode(xml);
  const contentHash = sha256(content);
  await Promise.all([
    writeFile(join(directory, "tree-notice.xml"), tree),
    writeFile(join(directory, "source.fmx4.xml"), content),
    writeFile(
      join(directory, "snapshot.json"),
      `${JSON.stringify(
        {
          schemaVersion: "1.0.0",
          snapshotId: `earth:cellar:39999R9999:${contentHash.slice(7)}`,
          // Acquisition scope is legacy bookkeeping, not a constraint on
          // reusing an immutable official snapshot in another Universe.
          universeId: "legacy-editorial-scope",
          provenance: "official",
          sourceSystem: "cellar",
          celex: "39999R9999",
          language: "en",
          retrievedAt: "2026-09-10T12:00:00.000Z",
          treeNoticeUrl:
            "https://publications.europa.eu/resource/celex/39999R9999?language=en",
          workUri: "https://publications.europa.eu/resource/cellar/work-dora",
          expressionUri:
            "https://publications.europa.eu/resource/cellar/expression-dora",
          manifestationUri:
            "https://publications.europa.eu/resource/cellar/manifestation-dora",
          treeNotice: {
            url: "https://publications.europa.eu/resource/celex/39999R9999?language=en",
            mediaType: "application/xml",
            etag: null,
            lastModified: null,
            sha256: sha256(tree),
            bytes: tree.byteLength,
            file: "tree-notice.xml",
          },
          content: {
            url: "https://publications.europa.eu/resource/cellar/manifestation-dora/DOC_1",
            mediaType: "application/xml",
            etag: null,
            lastModified: null,
            sha256: contentHash,
            bytes: content.byteLength,
            file: "source.fmx4.xml",
            upstreamStreamName: "TEST_ENG.xml",
          },
        },
        null,
        2,
      )}\n`,
    ),
  ]);
}

const universe = {
  schemaVersion: "0.1.0" as const,
  id: "earth-test",
  version: "0.1.0",
  displayName: "Earth test",
  description: "Test-only isolated Earth universe.",
  provenance: "EDITORIAL" as const,
  language: "ENG" as const,
  expressionPolicy: "english-celex-expression" as const,
  relationshipPolicy: { includeOfficialOneHopBoundary: true },
  members: [{ celex: "39999R9999", label: "Test regulation" }],
};

const sourceMetadata = {
  "39999R9999": {
    publicationDate: "2099-01-01",
    measureType: "primary-act" as const,
    evidenceUrl: "https://publications.europa.eu/resource/celex/39999R9999",
  },
};

function relationResponse(): Response {
  const payload = {
    results: {
      bindings: [
        {
          source: {
            type: "uri",
            value: "https://publications.europa.eu/resource/cellar/work-dora",
          },
          sourceCelexUri: {
            type: "uri",
            value: "http://publications.europa.eu/resource/celex/39999R9999",
          },
          sourceTitle: { type: "literal", value: "Test-only source title" },
          predicate: {
            type: "uri",
            value:
              "http://publications.europa.eu/ontology/cdm#resource_legal_amends_resource_legal",
          },
          target: {
            type: "uri",
            value: "https://publications.europa.eu/resource/cellar/work-target",
          },
          targetCelexUri: {
            type: "uri",
            value: "http://publications.europa.eu/resource/celex/39998R9998",
          },
          targetTitle: { type: "literal", value: "Test-only target title" },
        },
      ],
    },
  };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  return {
    ok: true,
    status: 200,
    url: "https://publications.europa.eu/webapi/rdf/sparql",
    headers: new Headers({
      "content-type": "application/sparql-results+json",
      "content-length": String(bytes.byteLength),
    }),
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as unknown as Response;
}

describe("Earth artifact compiler", () => {
  it("builds and verifies a standalone SQLite artifact from a verified snapshot", async () => {
    const root = await mkdtemp(join(tmpdir(), "earth-compiler-"));
    const snapshotDirectory = join(root, "snapshot");
    const outputPath = join(root, "earth.sqlite");
    await (await import("node:fs/promises")).mkdir(snapshotDirectory);
    await writeSnapshot(snapshotDirectory);
    try {
      const result = await compileEarthArtifact({
        universe,
        snapshotDirectories: [snapshotDirectory],
        sourceMetadata,
        outputPath,
        builtAt: new Date("2026-09-10T12:00:00.000Z"),
      });
      expect(result.manifest.counts).toEqual({
        works: 1,
        boundaryWorks: 0,
        nodes: 3,
        relationships: 0,
        articlesWithReading: 1,
        readingBlocks: 1,
      });
      const repeat = await compileEarthArtifact({
        universe,
        snapshotDirectories: [snapshotDirectory],
        sourceMetadata,
        outputPath: join(root, "earth-repeat.sqlite"),
        builtAt: new Date("2026-09-11T12:00:00.000Z"),
      });
      expect(repeat.manifest.buildId).toBe(result.manifest.buildId);
      const verified = verifyEarthArtifact(outputPath);
      expect(verified).toMatchObject({
        works: 1,
        boundaryWorks: 0,
        nodes: 3,
        articles: 1,
        relationships: 0,
      });
      const database = new Database(outputPath, { readonly: true });
      try {
        expect(
          database
            .prepare(
              "SELECT parent_id FROM nodes WHERE entity_kind = 'article'",
            )
            .get(),
        ).toEqual({ parent_id: "earth:eu:39999R9999:chapter:i" });
        expect(
          database
            .prepare("SELECT text FROM nodes WHERE entity_kind = 'article'")
            .get(),
        ).toEqual({ text: "" });
      } finally {
        database.close();
      }
      const repository = new EarthRepository(outputPath);
      const articleId = "earth:eu:39999R9999:article:1";
      expect(repository.articleReading(articleId)).toMatchObject({
        articleId,
        source: {
          xmlMember: "source.fmx4.xml",
          language: "en",
          officialSourceUrl: sourceMetadata["39999R9999"].evidenceUrl,
        },
        blocks: [
          {
            kind: "subparagraph",
            content: [{ type: "text", text: "Test-only text." }],
          },
        ],
      });
      expect(
        repository.articleReading("earth:work:39999R9999"),
      ).toBeUndefined();
      const tampered = new Database(outputPath);
      tampered.prepare("UPDATE article_readings SET block_count = 2").run();
      tampered.close();
      try {
        expect(() => repository.articleReading(articleId)).toThrow(
          "Incomplete Earth Article reading",
        );
      } finally {
        repository.close();
      }
      expect(() => verifyEarthArtifact(outputPath)).toThrow(
        "Incomplete Earth Article reading",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("publishes exact CELLAR lifecycle edges and non-expandable boundary Works", async () => {
    const root = await mkdtemp(join(tmpdir(), "earth-compiler-relations-"));
    const snapshotDirectory = join(root, "snapshot");
    await (await import("node:fs/promises")).mkdir(snapshotDirectory);
    await writeSnapshot(snapshotDirectory);
    try {
      const relationSnapshot = await acquireEarthCellarRelations(universe, {
        outputRoot: join(root, "relations"),
        fetchImplementation: async () => relationResponse(),
        now: () => new Date("2026-09-10T12:00:00.000Z"),
      });
      const outputPath = join(root, "earth.sqlite");
      const result = await compileEarthArtifact({
        universe,
        snapshotDirectories: [snapshotDirectory],
        relationshipSnapshotDirectory: relationSnapshot.directory,
        sourceMetadata,
        outputPath,
        builtAt: new Date("2026-09-10T13:00:00.000Z"),
      });
      expect(result.manifest).toMatchObject({
        relationSnapshotIds: [relationSnapshot.snapshot.snapshotId],
        counts: { works: 1, boundaryWorks: 1, nodes: 4, relationships: 1 },
      });
      expect(verifyEarthArtifact(outputPath)).toMatchObject({
        works: 1,
        boundaryWorks: 1,
        nodes: 4,
        relationships: 1,
      });
      const database = new Database(outputPath, { readonly: true });
      try {
        expect(
          database.prepare("SELECT * FROM boundary_works").get(),
        ).toMatchObject({
          id: "earth:work:39998R9998",
          celex: "39998R9998",
          official_title: "Test-only target title",
        });
        expect(
          database.prepare("SELECT * FROM official_relationships").get(),
        ).toMatchObject({
          source_node_id: "earth:work:39999R9999",
          target_node_id: "earth:work:39998R9998",
          relation_type: "AMENDS",
          provenance: "CELLAR_METADATA",
        });
      } finally {
        database.close();
      }
      const tampered = new Database(outputPath);
      tampered
        .prepare(
          "UPDATE official_relationships SET id = 'relationship:tampered'",
        )
        .run();
      tampered.close();
      expect(() => verifyEarthArtifact(outputPath)).toThrow(
        "Unstable Earth relationship ID",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails closed when reviewed Earth publication metadata is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "earth-compiler-"));
    const snapshotDirectory = join(root, "snapshot");
    await (await import("node:fs/promises")).mkdir(snapshotDirectory);
    await writeSnapshot(snapshotDirectory);
    try {
      await expect(
        compileEarthArtifact({
          universe,
          snapshotDirectories: [snapshotDirectory],
          sourceMetadata: {},
          outputPath: join(root, "earth.sqlite"),
        }),
      ).rejects.toThrow("Missing reviewed Earth source metadata");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
