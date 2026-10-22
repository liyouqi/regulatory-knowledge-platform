import { existsSync } from "node:fs";
import { resolve } from "node:path";
import addFormats from "ajv-formats";
import Ajv2020 from "ajv/dist/2020.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CitationContextService } from "../agent/citation-context-service";
import { SqliteRuntimeRepository } from "../runtime/sqlite-runtime-repository";
import { createLawSearchRecords } from "../search/law-search";
import {
  PUBLIC_API_CONTRACT_VERSION,
  publicDocumentTypeSchema,
  publicJurisdictionSchema,
  publicMeasureTypeSchema,
  publicRegulatoryLevelSchema,
  publicRelationshipProvenanceSchema,
  publicRelationshipTypeSchema,
} from "../shared/public-api";
import {
  publicApiOpenApiDocument,
  renderSwaggerUiHtml,
  swaggerUiAssetPath,
} from "./public-api-openapi";
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
  return operation.response;
}

function responseValidator(schemaName: string) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile({
    $schema: publicApiOpenApiDocument.jsonSchemaDialect,
    components: publicApiOpenApiDocument.components,
    $ref: `#/components/schemas/${schemaName}`,
  });
}

describe("Public API OpenAPI 3.1 contract", () => {
  it("documents bounded resolve filters from the shared contract", () => {
    const parameters =
      publicApiOpenApiDocument.paths["/laws/resolve"].get.parameters;
    expect(parameters.map((parameter) => parameter.name)).toEqual([
      "q",
      "profileId",
      "jurisdiction",
      "documentType",
      "regulatoryLevel",
      "measureType",
    ]);
    const filters =
      publicApiOpenApiDocument.components.schemas.LawResolveFilters;
    expect(filters.properties.jurisdiction.enum).toEqual(
      publicJurisdictionSchema.options,
    );
    expect(filters.properties.documentType.enum).toEqual(
      publicDocumentTypeSchema.options,
    );
    expect(filters.properties.regulatoryLevel.enum).toEqual(
      publicRegulatoryLevelSchema.options,
    );
    expect(filters.properties.measureType.enum).toEqual(
      publicMeasureTypeSchema.options,
    );
  });

  it("documents every current REST operation with Bearer security", () => {
    expect(publicApiOpenApiDocument.openapi).toBe("3.1.0");
    expect(publicApiOpenApiDocument.info.version).toBe(
      PUBLIC_API_CONTRACT_VERSION,
    );
    expect(publicApiOpenApiDocument.security).toEqual([{ BearerAuth: [] }]);
    expect(Object.keys(publicApiOpenApiDocument.paths)).toEqual([
      "/",
      "/laws/resolve",
      "/laws/{documentId}/structure",
      "/provisions/{entityId}",
      "/provisions/{entityId}/relationships",
    ]);

    const operations = Object.values(publicApiOpenApiDocument.paths).map(
      (path) => path.get,
    );
    expect(operations.map((operation) => operation.operationId)).toEqual([
      "discoverPublicApi",
      "resolveLaw",
      "getLawStructure",
      "getProvision",
      "getProvisionRelationships",
    ]);
    expect(
      new Set(operations.map((operation) => operation.operationId)).size,
    ).toBe(operations.length);
    for (const operation of operations) {
      expect(operation.responses).toHaveProperty("200");
      expect(operation.responses).toHaveProperty("401");
      expect(operation.responses).toHaveProperty("429");
      expect(operation.responses).toHaveProperty("503");
    }
  });

  it("keeps relationship enums and endpoint privacy aligned with the public contract", () => {
    const relationship =
      publicApiOpenApiDocument.components.schemas.Relationship;
    const endpoint =
      publicApiOpenApiDocument.components.schemas.RelationshipEndpoint;

    expect(relationship.properties.relationType.enum).toEqual(
      publicRelationshipTypeSchema.options,
    );
    expect(relationship.properties.provenance.enum).toEqual(
      publicRelationshipProvenanceSchema.options,
    );
    expect(endpoint.properties).not.toHaveProperty("path");
    expect(JSON.stringify(publicApiOpenApiDocument)).not.toContain(
      "regulatory.sqlite",
    );
    expect(JSON.stringify(publicApiOpenApiDocument)).not.toContain("data/raw");
  });

  it("documents optional German document metadata and content authority fields", () => {
    const schemas = publicApiOpenApiDocument.components.schemas;
    const document = schemas.DocumentReference;
    const sourceStatus = schemas.SourceStatus;
    const provision =
      schemas.ProvisionResponse.properties.data.properties.provision;
    const textBlock = schemas.TextBlock;

    expect(document.properties.jurisdiction.enum).toEqual([
      "EU",
      "LU",
      "DE",
      "FR",
    ]);
    expect(document.properties.language.enum).toEqual(["en", "de", "fr"]);
    expect(document.properties.sourceStatus.$ref).toBe(
      "#/components/schemas/SourceStatus",
    );
    expect(document.required).not.toContain("language");
    expect(document.required).not.toContain("sourceStatus");
    expect(sourceStatus.properties.textAuthorityStatus.enum).toEqual([
      "non-authoritative-consolidation",
      "publisher-consolidation",
    ]);
    expect(sourceStatus.properties.textAsOfBasis.enum).toEqual([
      "last-amendment-act-date",
      "publisher-version-date",
    ]);
    expect(sourceStatus.properties.authorityNote.type).toBe("string");
    expect(sourceStatus.properties.sourceNotes.items).toMatchObject({
      type: "string",
    });
    expect(provision.properties.contentRole.enum).toEqual([
      "operative-text",
      "source-note",
      "toc",
    ]);
    expect(provision.required).not.toContain("contentRole");
    expect(textBlock.properties.sourceNotes.items).toMatchObject({
      $ref: "#/components/schemas/SourceNote",
    });
  });

  it("validates representative service responses against documented JSON Schemas", () => {
    const amfArticle = repository
      ?.findDocument("fr:amf:rg")
      ?.provisions.find((provision) => provision.number === "223-2");
    if (!amfArticle) throw new Error("Missing AMF linked-text fixture");
    const cases = [
      [
        "LawResolveResponse",
        success(
          service?.resolveLaw("AMF RG article 212-19", undefined, {
            jurisdiction: "FR",
          }),
        ),
      ],
      ["LawStructureResponse", success(service?.getLawStructure("fr:amf:rg"))],
      ["ProvisionResponse", success(service?.getProvision(amfArticle.id))],
      ["DiscoveryResponse", success(service?.discover())],
      [
        "LawResolveResponse",
        success(
          service?.resolveLaw("DORA", undefined, {
            jurisdiction: "EU",
            regulatoryLevel: "level-2",
            measureType: "its",
          }),
        ),
      ],
      [
        "LawStructureResponse",
        success(service?.getLawStructure("eu:32022R2554")),
      ],
      [
        "ProvisionResponse",
        success(service?.getProvision("eu:32022R2554:article:28")),
      ],
      [
        "ProvisionRelationshipsResponse",
        success(service?.getProvisionRelationships("eu:32022R2554:article:28")),
      ],
      ["ApiError", failure(service?.getLawStructure("eu:unknown"))],
    ] as const;

    for (const [schemaName, payload] of cases) {
      const validate = responseValidator(schemaName);
      expect(validate(payload), JSON.stringify(validate.errors)).toBe(true);
    }
  });

  it("serves Swagger UI entirely from local pinned assets", () => {
    const html = renderSwaggerUiHtml();

    expect(existsSync(resolve(swaggerUiAssetPath, "swagger-ui.css"))).toBe(
      true,
    );
    expect(
      existsSync(resolve(swaggerUiAssetPath, "swagger-ui-bundle.js")),
    ).toBe(true);
    expect(html).toContain('url: "/api/v1/openapi.json"');
    expect(html).toContain("persistAuthorization: false");
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toContain("cdn");
  });
});
