import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadDocumentViews } from "../data/document-repository";
import { loadCssfSourceRegistrySync } from "../ingestion/cssf-source-registry";
import { loadSourceRegistrySync } from "../ingestion/source-registry";
import { toGlobalRelationshipGraph } from "../relationships/relationship-graph";
import { SearchService } from "../search/full-text-search";
import { createLawSearchRecords, searchLaws } from "../search/law-search";
import { buildRuntimeDatabase } from "../search/sqlite-search-index";
import {
  findEditionProfile,
  loadEditionProfileRegistrySync,
} from "./edition-profile";
import { SqliteRuntimeRepository } from "./sqlite-runtime-repository";

const testDirectory = mkdtempSync(join(tmpdir(), "regulatory-profile-"));
const databasePath = join(testDirectory, "banking.sqlite");
let repository: SqliteRuntimeRepository | undefined;
let search: SearchService | undefined;

beforeAll(() => {
  const profile = findEditionProfile(
    "banking-default",
    loadEditionProfileRegistrySync(),
  );
  buildRuntimeDatabase(
    loadDocumentViews(),
    [...loadSourceRegistrySync(), ...loadCssfSourceRegistrySync()],
    databasePath,
    profile,
  );
  repository = new SqliteRuntimeRepository(databasePath);
  search = new SearchService(databasePath);
});

afterAll(() => {
  repository?.close();
  search?.close();
  rmSync(testDirectory, { recursive: true, force: true });
});

describe("banking-default runtime isolation", () => {
  it("reports one Profile identity across Reader and Search services", () => {
    expect(repository).toMatchObject({
      profileId: "banking-default",
      profileVersion: "1.0.0",
    });
    expect(search).toMatchObject({
      profileId: "banking-default",
      profileHash: repository?.profileHash,
      documentCount: 14,
    });
  });

  it("makes excluded Reader, Explorer, Library, and relationship lookups unavailable", () => {
    expect(repository?.findDocument("eu:32023R1114")).toBeNull();
    expect(repository?.findDocumentBySlug("mica")).toBeNull();
    expect(repository?.findExplorerBySlug("mica")).toBeNull();
    expect(repository?.findFamilyLevel2("family:mica")).toBeNull();
    expect(
      repository?.findProvisionRelationships(
        "eu:32023R1114",
        "eu:32023R1114:article:62",
      ),
    ).toBeNull();
    expect(
      repository?.findRelationshipPreview("eu:32023R1114:article:62"),
    ).toBeNull();
    expect(search?.listDocumentDefinitions("eu:32023R1114")).toBeNull();
  });

  it("does not leak excluded documents through search or graph projections", () => {
    const lawSearch = repository
      ? searchLaws(
          createLawSearchRecords(
            repository.listDocumentViews(),
            repository.listLawSearchSources(),
          ),
          "MiCA",
        )
      : null;
    const fullText = search?.search("crypto-assets");
    const definitions = search?.searchDefinitions("crypto-asset");
    const graph = repository
      ? toGlobalRelationshipGraph(
          repository.listDocumentViews(),
          repository.listCrossDocumentRelationships(),
          repository.listLifecycleRelationships(),
          repository.listCaseLawRelationships(),
          repository.buildId,
        )
      : null;

    for (const payload of [lawSearch, fullText, definitions, graph]) {
      expect(JSON.stringify(payload)).not.toContain("eu:32023R1114");
      expect(JSON.stringify(payload)).not.toContain("eu:32025R0305");
    }
    expect(JSON.stringify(graph)).not.toContain("CELEX 32023R1114");
    expect(JSON.stringify(graph)).not.toContain("CELEX 32025R0305");
  });
});
