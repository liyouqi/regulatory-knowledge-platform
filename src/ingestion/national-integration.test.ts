import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CitationContextService } from "../agent/citation-context-service";
import { toDocumentView } from "../canonical/to-document-view";
import { validateCanonicalDocument } from "../canonical/validate";
import { exportRagSnapshot, verifyRagSnapshot } from "../export/rag-snapshot";
import { PublicApiService } from "../public-api/public-api-service";
import { SqliteRuntimeRepository } from "../runtime/sqlite-runtime-repository";
import { createLawSearchRecords, searchLaws } from "../search/law-search";
import { buildRuntimeDatabase } from "../search/sqlite-search-index";
import type { DocumentView } from "../shared/legal";
import { readVerifiedNationalSourceSnapshot } from "./national-snapshot";
import { loadNationalSourceCatalogSync } from "./national-source-registry";
import { parseNationalXml } from "./national-xml-parser";

const snapshotsByLocalId: Record<string, string> = {
  "de-gwg-2017":
    "data/raw/national/de-gwg-2017/20261021T065833065Z-e6c3dda080da",
  "de-wpig": "data/raw/national/de-wpig/20261021T065833613Z-5401a3133af8",
  "de-kagb": "data/raw/national/de-kagb/20261021T074101863Z-34e8b51e7eb7",
  "de-kwg": "data/raw/national/de-kwg/20261021T074102916Z-0128447811ca",
};
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("German national source integration", () => {
  it("runs four pinned XML sources through Reader, search, API, citation, and RAG", async () => {
    const sources = loadNationalSourceCatalogSync().filter((source) =>
      Object.hasOwn(snapshotsByLocalId, source.localId),
    );
    expect(sources.map((source) => source.localId).sort()).toEqual([
      "de-gwg-2017",
      "de-kagb",
      "de-kwg",
      "de-wpig",
    ]);

    const views: DocumentView[] = [];
    for (const source of sources) {
      const relativeSnapshotPath = snapshotsByLocalId[source.localId];
      if (!relativeSnapshotPath)
        throw new Error(`No pinned snapshot path for ${source.localId}`);
      const snapshotPath = resolve(relativeSnapshotPath);
      const { snapshot, contentBytes } =
        await readVerifiedNationalSourceSnapshot(snapshotPath);
      const parsed = parseNationalXml(contentBytes, snapshot, source);
      const canonical = validateCanonicalDocument(parsed.document);
      const view = toDocumentView(canonical, "national-integration-test");
      expect(view).toMatchObject({
        id: source.documentId,
        jurisdiction: "DE",
        language: "de",
        sourceStatus: {
          textAuthorityStatus: "non-authoritative-consolidation",
          textAsOfBasis: "last-amendment-act-date",
        },
      });
      expect(
        view.provisions.some((provision) => provision.contentRole === "toc"),
      ).toBe(true);
      expect(
        view.provisions.some(
          (provision) => provision.contentRole === "source-note",
        ),
      ).toBe(true);
      views.push(view);
    }

    const temporaryDirectory = mkdtempSync(joinTmp("national-integration-"));
    temporaryDirectories.push(temporaryDirectory);
    const databasePath = resolve(temporaryDirectory, "runtime.sqlite");
    const snapshotPath = resolve(temporaryDirectory, "rag-snapshot");
    buildRuntimeDatabase(views, [], databasePath);

    const repository = new SqliteRuntimeRepository(databasePath);
    try {
      const repositoryViews = repository.listDocumentViews();
      const searchRecords = createLawSearchRecords(
        repositoryViews,
        repository.listLawSearchSources(),
      );
      const citation = new CitationContextService(repository);
      const service = new PublicApiService(repository, searchRecords, citation);

      for (const source of sources) {
        const directSearch = searchLaws(searchRecords, source.shortName);
        expect(directSearch.results[0]?.id).toBe(source.documentId);
        const numberedSearch = searchLaws(
          searchRecords,
          `${source.shortName} § 1`,
        );
        expect(numberedSearch.results[0]).toMatchObject({
          id: source.documentId,
          target: { kind: "article", number: "1", label: "§ 1" },
        });

        const resolved = service.resolveLaw(source.shortName, undefined, {
          jurisdiction: "DE",
        });
        if (!resolved.ok) throw new Error("Expected German law resolution");
        expect(resolved.response.data.bestMatch?.document).toMatchObject({
          id: source.documentId,
          jurisdiction: "DE",
          language: "de",
        });

        const document = repositoryViews.find(
          (candidate) => candidate.id === source.documentId,
        );
        const article = document?.provisions.find(
          (provision) =>
            provision.kind === "article" &&
            provision.contentRole === "operative-text",
        );
        if (!article)
          throw new Error(`No operative article in ${source.localId}`);
        const provision = service.getProvision(article.id);
        if (!provision.ok) throw new Error("Expected exact Provision response");
        expect(provision.response.data.document.language).toBe("de");
        expect(provision.response.data.provision.contentRole).toBe(
          "operative-text",
        );

        const context = citation.findByEntityId(article.id);
        expect(context).toMatchObject({
          document: { id: source.documentId, language: "de" },
          target: { entityId: article.id, contentRole: "operative-text" },
        });
      }

      const ragManifest = exportRagSnapshot({
        databasePath,
        outputPath: snapshotPath,
        snapshotId: "germany-four-laws-test",
        asOfDate: "2026-10-21",
        createdAt: "2026-10-21T12:00:00.000Z",
      });
      expect(verifyRagSnapshot(snapshotPath)).toMatchObject({
        schema_version: "1.3.0",
        document_count: 4,
        languages: ["de"],
      });
      expect(ragManifest.languages).toEqual(["de"]);
    } finally {
      repository.close();
    }
  }, 60_000);
});

function joinTmp(prefix: string): string {
  return join(tmpdir(), `${prefix}-`);
}
