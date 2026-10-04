import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SearchService } from "./full-text-search";
import { RUNTIME_DATABASE_SCHEMA_VERSION } from "./sqlite-search-index";

const directory = mkdtempSync(join(tmpdir(), "search-ranking-"));
const path = join(directory, "fixture.sqlite");
let search: SearchService;

beforeAll(() => {
  const database = new Database(path);
  try {
    database.exec(`
      CREATE TABLE build_manifest (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE documents (
        id TEXT PRIMARY KEY, slug TEXT, short_name TEXT, celex TEXT, local_id TEXT
      );
      CREATE TABLE search_records (
        rowid INTEGER PRIMARY KEY, record_id TEXT, document_id TEXT,
        provision_id TEXT, kind TEXT, label TEXT, title TEXT, marker TEXT,
        path TEXT, heading TEXT, body TEXT
      );
      CREATE VIRTUAL TABLE search_records_fts USING fts5(
        heading, body, content='search_records', content_rowid='rowid',
        tokenize='unicode61 remove_diacritics 2', prefix='2 3 4'
      );
      CREATE TABLE definitions (definition_type TEXT);
    `);
    const manifest = database.prepare(
      "INSERT INTO build_manifest VALUES (?, ?)",
    );
    for (const [key, value] of Object.entries({
      schemaVersion: RUNTIME_DATABASE_SCHEMA_VERSION,
      buildId: "fixture-ranking",
      profileId: "fixture",
      profileHash: "fixture-hash",
      documentCount: "3",
      recordCount: "36",
      definitionCount: "0",
    })) {
      manifest.run(key, value);
    }
    const document = database.prepare(
      "INSERT INTO documents VALUES (?, ?, ?, NULL, NULL)",
    );
    const record = database.prepare(`
      INSERT INTO search_records (
        record_id, document_id, provision_id, kind, label, title, marker,
        path, heading, body
      ) VALUES (?, ?, ?, 'paragraph', ?, NULL, ?, ?, 'Shared risk', 'Synthetic audit fixture.')
    `);
    // Identical matches: thirty records from A would crowd out B and C under plain BM25.
    for (const [name, count] of [
      ["a", 30],
      ["b", 3],
      ["c", 3],
    ] as const) {
      const id = `fixture:${name}`;
      document.run(id, `fixture-${name}`, `Fixture ${name}`);
      for (let index = 1; index <= count; index += 1) {
        record.run(
          `${id}:${index}`,
          id,
          `${id}:article:1`,
          "Article 1",
          `(${index})`,
          `/read/fixture-${name}/articles/1#paragraph-${index}`,
        );
      }
    }
    database.exec(
      "INSERT INTO search_records_fts(search_records_fts) VALUES ('rebuild')",
    );
  } finally {
    database.close();
  }
  search = new SearchService(path);
});

afterAll(() => {
  search.close();
  rmSync(directory, { recursive: true, force: true });
});

describe("global full-text coverage", () => {
  it("shows each law's best match before additional matches and preserves stable ties", () => {
    const response = search.search("shared risk", { limit: 6 });
    expect(response.results.map((result) => result.id)).toEqual([
      "fixture:a:1",
      "fixture:b:1",
      "fixture:c:1",
      "fixture:a:2",
      "fixture:b:2",
      "fixture:c:2",
    ]);
    expect(search.search("shared risk", { limit: 6 })).toEqual(response);
    expect(new Set(response.results.map((result) => result.id)).size).toBe(6);
  });

  it("retains all matching records and the existing bounded limit", () => {
    expect(search.search("shared risk", { limit: 50 }).results).toHaveLength(
      36,
    );
    expect(search.search("shared risk", { limit: 2 }).results).toHaveLength(2);
    expect(search.search("shared risk", { limit: 0 }).results).toHaveLength(1);
  });

  it("keeps document scope, strict AND, phrases, and safe highlighted anchors", () => {
    expect(
      search
        .search("shared risk", { documentId: "fixture:a", limit: 3 })
        .results.map((result) => result.id),
    ).toEqual(["fixture:a:1", "fixture:a:2", "fixture:a:3"]);
    expect(search.search("shared absent").results).toEqual([]);
    expect(
      search.search("shared risk", { documentId: "fixture:missing" }).results,
    ).toEqual([]);
    for (const result of search.search('"shared risk"', { limit: 3 }).results) {
      expect(
        result.snippet.some(
          (segment) => segment.highlighted && segment.text === "Shared risk",
        ),
      ).toBe(true);
      expect(result.path).toContain("#paragraph-1");
      expect(JSON.stringify(result.snippet)).not.toContain("\\u0001");
    }
  });
});
