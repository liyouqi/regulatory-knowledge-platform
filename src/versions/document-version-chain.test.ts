import { describe, expect, it } from "vitest";
import type { DocumentView } from "../shared/legal";
import { buildDocumentVersionChain } from "./document-version-chain";

function documentWithStatus(): DocumentView {
  return {
    id: "eu:32024R2956",
    jurisdiction: "EU",
    slug: "dora-its-register-of-information",
    celex: "32024R2956",
    shortName: "DORA ITS Register of Information",
    officialTitle: "Test title",
    documentType: "regulation",
    sourceUrl: "https://eur-lex.europa.eu/eli/reg_impl/2024/2956/oj/eng",
    asOf: "2024-12-02",
    lastChecked: "2026-08-23T23:37:57.439Z",
    sourceVersion: "test-source",
    sourceStatus: {
      basis: "original-oj",
      textAsOf: "2024-12-02",
      checkedAt: "2026-08-23T23:37:57.439Z",
      currentVersionUrl: "https://eur-lex.europa.eu/eli/reg_impl/2024/2956",
      corrections: [
        {
          date: "2025-09-19",
          url: "https://eur-lex.europa.eu/eli/reg_impl/2024/2956/corrigendum/2025-09-19/oj/eng",
        },
      ],
    },
    buildId: "canonical-status-test",
    provenance: "official",
    collections: [{ id: "articles", label: "Articles", count: 0, roots: [] }],
    provisions: [],
  };
}

describe("document version chain builder", () => {
  it("projects verified source status without claiming external text is loaded", () => {
    const chain = buildDocumentVersionChain(documentWithStatus());

    expect(chain).toMatchObject({
      documentId: "eu:32024R2956",
      buildId: "canonical-status-test",
      coverage: "source-status-only",
      checkedAt: "2026-08-23T23:37:57.439Z",
      loadedVersionId: "version:eu:32024R2956:original-oj:2024-12-02",
    });
    expect(chain?.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "original-oj-snapshot",
          date: "2024-12-02",
          availability: "loaded",
        }),
        expect.objectContaining({
          kind: "current-version-link",
          availability: "external",
        }),
        expect.objectContaining({
          kind: "corrigendum",
          date: "2025-09-19",
          availability: "external",
        }),
      ]),
    );
    expect(chain?.edges.map((edge) => edge.relationType)).toEqual([
      "CURRENT_VERSION_LINK",
      "HAS_CORRIGENDUM",
    ]);
    expect(JSON.stringify(chain)).not.toContain("AMENDED_BY");
  });

  it("does not publish a chain when reviewed source status is absent", () => {
    const document = documentWithStatus();
    document.sourceStatus = undefined;

    expect(buildDocumentVersionChain(document)).toBeNull();
  });
});
