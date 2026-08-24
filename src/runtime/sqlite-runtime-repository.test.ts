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
      familyId: "family:dora",
      regulatoryLevel: "level-1",
      measureType: "primary-act",
    });
    expect(repository?.listLawSearchSources()).toContainEqual({
      celex: "32022R2554",
      familyId: "family:dora",
      regulatoryLevel: "level-1",
      measureType: "primary-act",
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

  it("returns a bounded, normalized version chain only for reviewed status", () => {
    const chain = repository?.findDocumentVersionChain("eu:32024R2956");

    expect(chain).toMatchObject({
      documentId: "eu:32024R2956",
      buildId: repository?.buildId,
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
          sourceUrl: "https://eur-lex.europa.eu/eli/reg_impl/2024/2956",
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
    expect(repository?.findDocumentVersionChain(dora.id)).toBeNull();
    expect(repository?.findDocumentVersionChain("eu:unknown")).toBeNull();
    expect(repository?.versionNodeCount).toBe(chain?.nodes.length);
    expect(repository?.versionEdgeCount).toBe(chain?.edges.length);
  });

  it("returns explicit references and derives cited-by without duplicate edges", () => {
    const doraArticleOne = repository?.findProvisionRelationships(
      "eu:32022R2554",
      "eu:32022R2554:article:1",
    );
    expect(doraArticleOne?.references).toContainEqual(
      expect.objectContaining({
        relationType: "REFERENCES",
        provenance: "LEGAL_TEXT",
        source: expect.objectContaining({
          provisionId: "eu:32022R2554:article:1",
        }),
        target: expect.objectContaining({
          entityId: "eu:32022L2555:article:3",
          path: "/read/nis2/articles/3",
        }),
        evidence: expect.objectContaining({
          text: "Article 3 of Directive (EU) 2022/2555",
        }),
      }),
    );

    const nisArticleThree = repository?.findProvisionRelationships(
      "eu:32022L2555",
      "eu:32022L2555:article:3",
    );
    expect(nisArticleThree?.citedBy).toContainEqual(
      expect.objectContaining({
        relationType: "CITED_BY",
        source: expect.objectContaining({
          documentShortName: "DORA",
          provisionId: "eu:32022R2554:article:1",
        }),
      }),
    );
    expect(repository?.relationshipCount).toBeGreaterThan(1_000);
    expect(repository?.cellarRelationshipCount).toBe(12);
    expect(repository?.unresolvedReferenceCount).toBeGreaterThan(0);
  });

  it("returns null when a relationship query uses an unknown provision", () => {
    expect(
      repository?.findProvisionRelationships(
        "eu:32022R2554",
        "eu:32022R2554:article:999",
      ),
    ).toBeNull();
  });

  it("keeps reviewed lifecycle edges separate from loaded legal entities", () => {
    const doraLifecycle =
      repository?.findDocumentLifecycleRelationships("eu:32022R2554");

    expect(doraLifecycle?.relationships).toHaveLength(14);
    expect(doraLifecycle?.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relationType: "AMENDS",
          provenance: "OFFICIAL_METADATA",
          source: expect.objectContaining({
            entityId: "eu:32022R2554",
            kind: "document",
            availability: "loaded",
            path: "/read/dora/articles/1",
          }),
          target: expect.objectContaining({
            entityId: "eu:32009R1060",
            celex: "32009R1060",
            kind: "external-work",
            availability: "external",
          }),
          builder: { method: "cellar-lifecycle", version: "1.0.0" },
          resolutionStatus: "external",
        }),
        expect.objectContaining({
          relationType: "CORRECTS",
          target: expect.objectContaining({
            entityId: "eu:32022R2554",
            kind: "document",
          }),
          source: expect.objectContaining({
            kind: "external-work",
            title: null,
          }),
        }),
      ]),
    );
    expect(
      doraLifecycle?.relationships.every(
        (relationship) =>
          relationship.source.documentId === "eu:32022R2554" ||
          relationship.target.documentId === "eu:32022R2554",
      ),
    ).toBe(true);
    expect(repository?.lifecycleRelationshipCount).toBe(65);
    expect(repository?.externalWorkCount).toBe(64);
    expect(
      repository?.findDocumentLifecycleRelationships("eu:unknown"),
    ).toBeNull();
  });

  it("returns benchmark-gated TF-IDF related recitals with similarity scores", () => {
    const doraArticleTwenty = repository?.findProvisionRelationships(
      "eu:32022R2554",
      "eu:32022R2554:article:20",
    );

    expect(doraArticleTwenty?.relatedRecitals).toContainEqual(
      expect.objectContaining({
        relationType: "RELATED_RECITAL",
        provenance: "TFIDF",
        target: expect.objectContaining({
          entityId: "eu:32022R2554:recital:53",
        }),
        builder: {
          method: "tfidf-related-recital",
          version: "1.0.0",
        },
        score: expect.any(Number),
      }),
    );
    expect(repository?.relatedRecitalCount).toBeGreaterThan(1_000);
  });

  it("returns reviewed Level 2 mappings in both legal directions", () => {
    const doraMandate = repository?.findProvisionRelationships(
      "eu:32022R2554",
      "eu:32022R2554:article:15",
    );
    expect(doraMandate?.mandates).toContainEqual(
      expect.objectContaining({
        relationType: "MANDATES",
        provenance: "OFFICIAL_MAPPING",
        target: expect.objectContaining({
          entityId: "eu:32024R1774",
          documentShortName: "DORA RTS ICT Risk Management",
        }),
      }),
    );

    const doraRts = repository?.findProvisionRelationships(
      "eu:32024R1774",
      "eu:32024R1774:article:1",
    );
    expect(doraRts?.adoptedUnder).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relationType: "ADOPTED_UNDER",
          provenance: "OFFICIAL_MAPPING",
          target: expect.objectContaining({
            entityId: "eu:32022R2554:article:15",
          }),
        }),
        expect.objectContaining({
          target: expect.objectContaining({
            entityId: "eu:32022R2554:article:16",
          }),
        }),
      ]),
    );
    expect(doraRts?.adoptedUnder).toContainEqual(
      expect.objectContaining({
        relationType: "ADOPTED_UNDER",
        provenance: "OFFICIAL_METADATA",
        target: expect.objectContaining({
          entityId: "eu:32022R2554",
        }),
        evidence: expect.objectContaining({
          text: "Legal resource is based on legal resource",
        }),
        builder: {
          method: "cellar-focused-relations",
          version: "1.0.0",
        },
      }),
    );
    expect(doraRts?.supplements).toContainEqual(
      expect.objectContaining({
        relationType: "SUPPLEMENTS",
        provenance: "OFFICIAL_METADATA",
        target: expect.objectContaining({
          entityId: "eu:32022R2554",
        }),
      }),
    );

    const micaMandate = repository?.findProvisionRelationships(
      "eu:32023R1114",
      "eu:32023R1114:article:62",
    );
    expect(micaMandate?.mandates).toContainEqual(
      expect.objectContaining({
        target: expect.objectContaining({ entityId: "eu:32025R0305" }),
      }),
    );

    const incidentReportingMandates = repository?.findProvisionRelationships(
      "eu:32022R2554",
      "eu:32022R2554:article:20",
    );
    expect(incidentReportingMandates?.mandates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: expect.objectContaining({ entityId: "eu:32025R0301" }),
        }),
        expect.objectContaining({
          target: expect.objectContaining({ entityId: "eu:32025R0302" }),
        }),
      ]),
    );
    expect(
      repository?.findProvisionRelationships(
        "eu:32025R0302",
        "eu:32025R0302:article:1",
      )?.adoptedUnder,
    ).toContainEqual(
      expect.objectContaining({
        target: expect.objectContaining({
          entityId: "eu:32022R2554:article:20",
        }),
      }),
    );
  });

  it("lists Level 2 measures from SQLite with counts and mandate Articles", () => {
    expect(repository?.findDocument("eu:32024R2956")).toMatchObject({
      buildId: expect.stringContaining("status-"),
      sourceStatus: {
        basis: "original-oj",
        textAsOf: "2024-12-02",
        checkedAt: "2026-08-23T23:37:57.439Z",
        currentVersionUrl: "https://eur-lex.europa.eu/eli/reg_impl/2024/2956",
        corrections: [expect.objectContaining({ date: "2025-09-19" })],
      },
    });
    const dora = repository?.findFamilyLevel2("family:dora");
    expect(dora).toMatchObject({
      familyId: "family:dora",
      familyShortName: "DORA",
      counts: { rts: 4, its: 2, guidelines: 0 },
    });
    expect(dora?.measures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "eu:32024R1774",
          measureType: "rts",
          celex: "32024R1774",
          mandates: expect.arrayContaining([
            expect.objectContaining({
              articleEntityId: "eu:32022R2554:article:15",
              path: "/read/dora/articles/15",
            }),
            expect.objectContaining({
              articleEntityId: "eu:32022R2554:article:16",
            }),
          ]),
        }),
        expect.objectContaining({
          id: "eu:32024R1773",
          mandates: [
            expect.objectContaining({
              articleEntityId: "eu:32022R2554:article:28",
              path: "/read/dora/articles/28",
            }),
          ],
        }),
        expect.objectContaining({
          id: "eu:32024R1772",
          mandates: [
            expect.objectContaining({
              articleEntityId: "eu:32022R2554:article:18",
              path: "/read/dora/articles/18",
            }),
          ],
        }),
        expect.objectContaining({
          id: "eu:32024R2956",
          measureType: "its",
          sourceStatus: expect.objectContaining({
            basis: "original-oj",
            corrections: [expect.objectContaining({ date: "2025-09-19" })],
          }),
          mandates: [
            expect.objectContaining({
              articleEntityId: "eu:32022R2554:article:28",
            }),
          ],
        }),
        expect.objectContaining({
          id: "eu:32025R0301",
          measureType: "rts",
          mandates: [
            expect.objectContaining({
              articleEntityId: "eu:32022R2554:article:20",
            }),
          ],
        }),
        expect.objectContaining({
          id: "eu:32025R0302",
          measureType: "its",
          mandates: [
            expect.objectContaining({
              articleEntityId: "eu:32022R2554:article:20",
            }),
          ],
        }),
      ]),
    );
    expect(repository?.findFamilyLevel2("family:mica", "rts")).toMatchObject({
      counts: { rts: 1, its: 0, guidelines: 0 },
      measures: [
        expect.objectContaining({
          id: "eu:32025R0305",
          mandates: [
            expect.objectContaining({
              articleEntityId: "eu:32023R1114:article:62",
            }),
          ],
        }),
      ],
    });
    expect(repository?.findFamilyLevel2("family:gdpr")).toMatchObject({
      measures: [],
    });
    expect(repository?.findFamilyLevel2("family:unknown")).toBeNull();
  });

  it("returns a short on-demand preview without adding legal text to relation rows", () => {
    expect(
      repository?.findRelationshipPreview("eu:32022L2555:article:3"),
    ).toMatchObject({
      entityId: "eu:32022L2555:article:3",
      documentShortName: "NIS2",
      label: "Article 3",
      path: "/read/nis2/articles/3",
      excerpt: expect.any(String),
    });
    expect(repository?.findRelationshipPreview("eu:unknown")).toBeNull();
  });
});
