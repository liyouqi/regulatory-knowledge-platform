import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toExplorerView } from "../canonical/to-explorer-view";
import { loadDocumentViews } from "../data/document-repository";
import { loadSourceRegistrySync } from "../ingestion/source-registry";
import { buildRuntimeDatabase } from "../search/sqlite-search-index";
import { SqliteRuntimeRepository } from "./sqlite-runtime-repository";

const testDirectory = mkdtempSync(join(tmpdir(), "regulatory-runtime-"));
const databasePath = join(testDirectory, "regulatory.sqlite");
const documents = loadDocumentViews();
const sources = loadSourceRegistrySync();
const dora = documents.find((document) => document.slug === "dora");
if (!dora) throw new Error("DORA test document is unavailable");
let repository: SqliteRuntimeRepository | undefined;

beforeAll(() => {
  buildRuntimeDatabase(documents, sources, databasePath);
  repository = new SqliteRuntimeRepository(databasePath);
});

afterAll(() => {
  repository?.close();
  rmSync(testDirectory, { recursive: true, force: true });
});

describe("SQLite runtime repository", () => {
  it("returns a Reader payload identical to the validated DocumentView", () => {
    expect(repository?.listDocumentViews()).toEqual(documents);
    for (const document of documents) {
      expect(repository?.findDocument(document.id)).toEqual(document);
      expect(repository?.findDocumentBySlug(document.slug)).toEqual(document);
    }
  });

  it("returns an Explorer payload identical to the canonical projection", () => {
    for (const document of documents) {
      expect(repository?.findExplorerBySlug(document.slug)).toEqual(
        toExplorerView(document),
      );
    }
  });

  it("serves metadata and reviewed aliases without reading source files", () => {
    expect(repository?.listDocumentSummaries()).toHaveLength(documents.length);
    expect(repository?.listDocumentSummaries()).toContainEqual({
      id: dora.id,
      slug: "dora",
      shortName: "DORA",
      officialTitle: dora.officialTitle,
      defaultPath: dora.provisions[0].path,
      provenance: dora.provenance,
    });
    expect(repository?.listLawSearchSources()).toContainEqual({
      celex: "32022R2554",
      familyId: "family:dora",
      aliases: [
        "Digital Operational Resilience Act",
        "Digital Operational Resilience Regulation",
      ],
    });
  });

  it("returns null for unknown document and Explorer identities", () => {
    expect(repository?.findDocument("eu:unknown")).toBeNull();
    expect(repository?.findDocumentBySlug("unknown")).toBeNull();
    expect(repository?.findExplorerBySlug("unknown")).toBeNull();
  });
});
