import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CitationContextService } from "../agent/citation-context-service";
import { SqliteRuntimeRepository } from "../runtime/sqlite-runtime-repository";
import { createLawSearchRecords } from "../search/law-search";
import type { PublicApiOperation } from "./public-api-service";
import { PublicApiService } from "./public-api-service";

let repository: SqliteRuntimeRepository | undefined;
let service: PublicApiService | undefined;

beforeAll(() => {
  repository = new SqliteRuntimeRepository();
  service = new PublicApiService(
    repository,
    createLawSearchRecords(
      repository.listDocumentViews(),
      repository.listLawSearchSources(),
    ),
    new CitationContextService(repository),
  );
});

afterAll(() => repository?.close());

function success<T>(operation: PublicApiOperation<T> | undefined): T {
  if (!operation?.ok) throw new Error("Expected a successful API operation");
  return operation.response;
}

function failure<T>(operation: PublicApiOperation<T> | undefined) {
  if (!operation || operation.ok) {
    throw new Error("Expected a failed API operation");
  }
  return operation;
}

describe("Public API v1 service contract", () => {
  it("discovers an explicitly versioned, deployment-fixed API", () => {
    const payload = success(service?.discover());

    expect(payload).toMatchObject({
      meta: {
        apiVersion: "v1",
        contractVersion: "1.5.0",
        profilePolicy: "deployment-fixed",
        runtime: { profileId: "full-corpus" },
      },
      data: { status: "active" },
    });
    expect(payload.data.capabilities.map((item) => item.id)).toEqual([
      "resolve-law",
      "law-structure",
      "get-provision",
      "get-relationships",
    ]);
    expect(payload.data.capabilities[0]?.pathTemplate).toContain(
      "jurisdiction,documentType,regulatoryLevel,measureType",
    );
  });

  it("resolves a law and exact provision without exposing Web payloads", () => {
    const payload = success(service?.resolveLaw("DORA article 28"));

    expect(payload.data.bestMatch).toMatchObject({
      document: { id: "eu:32022R2554", shortName: "DORA" },
      target: {
        entityId: "eu:32022R2554:article:28",
        kind: "article",
        number: "28",
      },
    });
    expect(payload.data.filters).toEqual({});
    expect(JSON.stringify(payload)).not.toContain("readerPath");
    expect(JSON.stringify(payload)).not.toContain("explorerPath");
  });

  it("narrows law resolution within the loaded Profile", () => {
    const payload = success(
      service?.resolveLaw("DORA", undefined, {
        jurisdiction: "EU",
        regulatoryLevel: "level-2",
        measureType: "its",
      }),
    );

    expect(payload.data.filters).toEqual({
      jurisdiction: "EU",
      regulatoryLevel: "level-2",
      measureType: "its",
    });
    expect(payload.data.resultCount).toBeGreaterThan(0);
    for (const result of payload.data.results) {
      expect(result.document.jurisdiction).toBe("EU");
      expect(result.regulatoryLevel).toBe("level-2");
      expect(result.measureType).toBe("its");
    }

    const noCurrentProfileMatch = success(
      service?.resolveLaw("DORA", undefined, {
        jurisdiction: "LU",
        documentType: "regulation",
      }),
    );
    expect(noCurrentProfileMatch.data).toMatchObject({
      filters: { jurisdiction: "LU", documentType: "regulation" },
      resultCount: 0,
      bestMatch: null,
      results: [],
    });
  });

  it("returns structure separately from exact provision text", () => {
    const structure = success(service?.getLawStructure("eu:32022R2554"));
    const provision = success(
      service?.getProvision("eu:32022R2554:article:28"),
    );

    expect(structure.data.document.id).toBe("eu:32022R2554");
    expect(structure.data.collections).toContainEqual(
      expect.objectContaining({ id: "articles", count: 64 }),
    );
    expect(JSON.stringify(structure)).not.toContain(
      "financial entities shall manage ICT third-party risk",
    );
    expect(provision.data.provision).toMatchObject({
      entityId: "eu:32022R2554:article:28",
      label: "Article 28",
    });
    expect(provision.data.provision.blocks.length).toBeGreaterThan(0);
    expect(provision.data.source.officialUrl).toBe(
      "https://eur-lex.europa.eu/eli/reg/2022/2554/oj/eng",
    );
    for (const payload of [structure, provision]) {
      expect(JSON.stringify(payload)).not.toContain("regulatory.sqlite");
      expect(JSON.stringify(payload)).not.toContain("data/raw");
    }
  });

  it("publishes exact directed Provision relationships without Web paths", () => {
    const payload = success(
      service?.getProvisionRelationships("eu:32022R2554:article:28"),
    );

    expect(payload.data.provision).toEqual({
      entityId: "eu:32022R2554:article:28",
      documentId: "eu:32022R2554",
      documentShortName: "DORA",
      kind: "article",
      label: "Article 28",
      title: "General principles",
    });
    expect(payload.data.relationshipCount).toBe(
      Object.values(payload.data.groups).reduce(
        (total, group) => total + group.length,
        0,
      ),
    );
    expect(payload.data.groups.mandates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relationType: "MANDATES",
          provenance: "OFFICIAL_MAPPING",
          source: expect.objectContaining({
            entityId: "eu:32022R2554:article:28",
            officialUrl: "https://eur-lex.europa.eu/eli/reg/2022/2554/oj/eng",
          }),
          target: expect.objectContaining({
            entityId: "eu:32024R2956",
            documentShortName: "DORA ITS Register of Information",
            officialUrl:
              "https://eur-lex.europa.eu/eli/reg_impl/2024/2956/2024-12-02/eng",
          }),
          evidence: expect.objectContaining({
            text: expect.any(String),
            sourceUrl: expect.stringContaining("eur-lex.europa.eu"),
          }),
          builder: { method: "official-mapping", version: "1.0.0" },
          resolutionStatus: "resolved",
        }),
        expect.objectContaining({
          target: expect.objectContaining({ entityId: "eu:32024R1773" }),
        }),
      ]),
    );
    expect(payload.data.groups.relatedRecitals).toContainEqual(
      expect.objectContaining({
        relationType: "RELATED_RECITAL",
        provenance: "TFIDF",
        score: expect.any(Number),
      }),
    );
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('"path"');
    expect(serialized).not.toContain("regulatory.sqlite");
    expect(serialized).not.toContain("data/raw");
  });

  it("uses stable error codes and rejects Profile switching", () => {
    const missingQuery = failure(service?.resolveLaw(""));
    const oversizedQuery = failure(service?.resolveLaw("x".repeat(201)));
    const invalidFilter = failure(
      service?.resolveLaw("DORA", undefined, { jurisdiction: "US" }),
    );
    const profile = failure(service?.discover("banking-default"));
    const block = failure(
      service?.getProvision("eu:32022R2554:article:28:paragraph:1"),
    );
    const relationshipBlock = failure(
      service?.getProvisionRelationships(
        "eu:32022R2554:article:28:paragraph:1",
      ),
    );
    const relationshipProfile = failure(
      service?.getProvisionRelationships(
        "eu:32022R2554:article:28",
        "banking-default",
      ),
    );
    const law = failure(service?.getLawStructure("eu:unknown"));
    const internal = failure(service?.internalError());
    const unconfigured = failure(service?.serviceNotConfigured());
    const authentication = failure(service?.authenticationRequired());
    const rateLimit = failure(service?.rateLimitExceeded());

    expect(missingQuery).toMatchObject({
      status: 400,
      response: { error: { code: "INVALID_REQUEST", parameter: "q" } },
    });
    expect(oversizedQuery).toMatchObject({
      status: 400,
      response: { error: { code: "INVALID_REQUEST", parameter: "q" } },
    });
    expect(invalidFilter).toMatchObject({
      status: 400,
      response: {
        error: { code: "INVALID_REQUEST", parameter: "jurisdiction" },
      },
    });
    expect(profile).toMatchObject({
      status: 403,
      response: { error: { code: "PROFILE_NOT_AVAILABLE" } },
    });
    expect(block).toMatchObject({
      status: 404,
      response: { error: { code: "PROVISION_NOT_FOUND" } },
    });
    expect(relationshipBlock).toMatchObject({
      status: 404,
      response: { error: { code: "PROVISION_NOT_FOUND" } },
    });
    expect(relationshipProfile).toMatchObject({
      status: 403,
      response: { error: { code: "PROFILE_NOT_AVAILABLE" } },
    });
    expect(law).toMatchObject({
      status: 404,
      response: { error: { code: "LAW_NOT_FOUND" } },
    });
    expect(internal).toMatchObject({
      status: 500,
      response: { error: { code: "INTERNAL_ERROR" } },
    });
    expect(unconfigured).toMatchObject({
      status: 503,
      response: { error: { code: "SERVICE_NOT_CONFIGURED" } },
    });
    expect(authentication).toMatchObject({
      status: 401,
      response: { error: { code: "AUTHENTICATION_REQUIRED" } },
    });
    expect(rateLimit).toMatchObject({
      status: 429,
      response: { error: { code: "RATE_LIMIT_EXCEEDED" } },
    });
  });
});

describe("AMF published source integration", () => {
  it("resolves separate source articles and exposes explicit unknown publication dates", () => {
    const ids: string[] = [];
    for (const number of ["212-19", "212-19-bis"]) {
      const payload = success(
        service?.resolveLaw(`AMF RG article ${number}`, undefined, {
          jurisdiction: "FR",
        }),
      );
      expect(payload.data.bestMatch?.document).toMatchObject({
        id: "fr:amf:rg",
        language: "fr",
        publicationDate: null,
        publicationDateBasis: "aggregate-with-multiple-component-publications",
      });
      const target = payload.data.bestMatch?.target;
      if (!target) throw new Error("Expected exact AMF article");
      ids.push(target.entityId);
      expect(target.number).toBe(number);
      const exact = success(service?.getProvision(target.entityId));
      expect(exact.data.document.publicationDate).toBeNull();
      expect(exact.data.provision.officialSourceUrl).toContain(
        "/article/212-19/",
      );
    }
    expect(new Set(ids).size).toBe(2);
    const structure = success(service?.getLawStructure("fr:amf:rg"));
    expect(structure.data.document.publicationDate).toBeNull();
    expect(structure.data.scopedSourceNotes).toHaveLength(64);
    expect(structure.data.scopedSourceNotes?.[0]).toMatchObject({
      scope: "document",
      ownerId: "fr:amf:rg",
      position: 2,
    });
    expect(
      structure.data.collections.find(
        (collection) => collection.id === "articles",
      )?.count,
    ).toBe(1821);
  });

  it("keeps scoped publisher context outside citation entities", () => {
    if (!repository) throw new Error("Missing runtime repository");
    const document = repository
      .listDocumentViews()
      .find((entry) => entry.id === "fr:amf:rg");
    if (!document) throw new Error("Missing published AMF document");
    expect(document.provisions).toHaveLength(1821);
    expect(document.scopedSourceNotes).toHaveLength(64);
    const citation = new CitationContextService(repository, [document]);
    for (const note of document.scopedSourceNotes ?? [])
      expect(citation.findByEntityId(note.block.id)).toBeNull();
    const article = document.provisions.find(
      (entry) => entry.number === "212-48",
    );
    if (!article) throw new Error("Missing AMF article");
    const context = citation.findByEntityId(article.id);
    expect(context?.document).toMatchObject({
      jurisdiction: "FR",
      language: "fr",
      sourceStatus: { textAsOfBasis: "publisher-version-date" },
    });
    expect(
      context?.textSegments.every(
        (segment) => segment.contentRole === "operative-text",
      ),
    ).toBe(true);
    expect(context?.textSegments.map((segment) => segment.text).join("")).toBe(
      article.blocks
        .flatMap((block) => block.orderedContent)
        .filter(
          (run) => run.type === "text" && run.contentRole === "operative-text",
        )
        .map((run) => (run.type === "text" ? run.text : ""))
        .join(""),
    );
  });
});
