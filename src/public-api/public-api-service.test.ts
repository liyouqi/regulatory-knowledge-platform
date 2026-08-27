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
        contractVersion: "1.0.0",
        profilePolicy: "deployment-fixed",
        runtime: { profileId: "full-corpus" },
      },
      data: { status: "active" },
    });
    expect(payload.data.capabilities.map((item) => item.id)).toEqual([
      "resolve-law",
      "law-structure",
      "get-provision",
    ]);
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
    expect(JSON.stringify(payload)).not.toContain("readerPath");
    expect(JSON.stringify(payload)).not.toContain("explorerPath");
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

  it("uses stable error codes and rejects Profile switching", () => {
    const missingQuery = failure(service?.resolveLaw(""));
    const oversizedQuery = failure(service?.resolveLaw("x".repeat(201)));
    const profile = failure(service?.discover("banking-default"));
    const block = failure(
      service?.getProvision("eu:32022R2554:article:28:paragraph:1"),
    );
    const law = failure(service?.getLawStructure("eu:unknown"));
    const internal = failure(service?.internalError());

    expect(missingQuery).toMatchObject({
      status: 400,
      response: { error: { code: "INVALID_REQUEST", parameter: "q" } },
    });
    expect(oversizedQuery).toMatchObject({
      status: 400,
      response: { error: { code: "INVALID_REQUEST", parameter: "q" } },
    });
    expect(profile).toMatchObject({
      status: 403,
      response: { error: { code: "PROFILE_NOT_AVAILABLE" } },
    });
    expect(block).toMatchObject({
      status: 404,
      response: { error: { code: "PROVISION_NOT_FOUND" } },
    });
    expect(law).toMatchObject({
      status: 404,
      response: { error: { code: "LAW_NOT_FOUND" } },
    });
    expect(internal).toMatchObject({
      status: 500,
      response: { error: { code: "INTERNAL_ERROR" } },
    });
  });
});
