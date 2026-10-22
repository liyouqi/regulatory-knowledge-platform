import { createRequire } from "node:module";
import { contentRoleSchema, layoutNameSchema } from "../shared/content-unit";
import {
  PUBLIC_API_CONTRACT_VERSION,
  PUBLIC_API_VERSION,
  publicDocumentTypeSchema,
  publicJurisdictionSchema,
  publicMeasureTypeSchema,
  publicRegulatoryLevelSchema,
  publicRelationshipProvenanceSchema,
  publicRelationshipTypeSchema,
} from "../shared/public-api";

type SchemaProperties = Record<string, object>;

function closedObject<const Properties extends SchemaProperties>(
  properties: Properties,
  required: string[] = Object.keys(properties),
) {
  return {
    type: "object",
    additionalProperties: false,
    properties,
    required,
  };
}

function arrayOf(items: object, maximum?: number) {
  return {
    type: "array",
    items,
    ...(maximum === undefined ? {} : { maxItems: maximum }),
  };
}

function reference(name: string) {
  return { $ref: `#/components/schemas/${name}` };
}

const nonEmptyString = { type: "string", minLength: 1 };
const nullableString = { type: ["string", "null"] };
const documentReferenceProperties = {
  id: nonEmptyString,
  jurisdiction: { type: "string", enum: publicJurisdictionSchema.options },
  slug: { type: "string", pattern: "^[a-z0-9-]+$" },
  shortName: nonEmptyString,
  officialTitle: nonEmptyString,
  language: { type: "string", enum: ["en", "de", "fr"] },
  documentType: {
    type: "string",
    enum: publicDocumentTypeSchema.options,
  },
  celex: nonEmptyString,
  localId: nonEmptyString,
  sourceUrl: { type: "string", format: "uri" },
  sourceStatus: reference("SourceStatus"),
  asOf: { type: "string", format: "date" },
  publicationDate: {
    type: ["string", "null"],
    format: "date",
    description:
      "Null only for FR aggregate publications with no single publication date.",
  },
  publicationDateBasis: {
    type: "string",
    const: "aggregate-with-multiple-component-publications",
  },
  provenance: { type: "string", const: "official" },
};
const documentReferenceRequired = [
  "id",
  "jurisdiction",
  "slug",
  "shortName",
  "officialTitle",
  "documentType",
  "sourceUrl",
  "asOf",
  "provenance",
];

const schemas = {
  RuntimeIdentity: closedObject({
    buildId: nonEmptyString,
    profileId: nonEmptyString,
    profileVersion: nonEmptyString,
    profileDisplayName: nonEmptyString,
    profileHash: {
      type: "string",
      pattern: "^sha256:[a-f0-9]{64}$",
    },
  }),
  Meta: closedObject({
    apiVersion: { type: "string", const: PUBLIC_API_VERSION },
    contractVersion: {
      type: "string",
      const: PUBLIC_API_CONTRACT_VERSION,
    },
    profilePolicy: { type: "string", const: "deployment-fixed" },
    runtime: reference("RuntimeIdentity"),
  }),
  ApiError: closedObject({
    meta: reference("Meta"),
    error: closedObject(
      {
        code: {
          type: "string",
          enum: [
            "SERVICE_NOT_CONFIGURED",
            "AUTHENTICATION_REQUIRED",
            "RATE_LIMIT_EXCEEDED",
            "INVALID_REQUEST",
            "PROFILE_NOT_AVAILABLE",
            "LAW_NOT_FOUND",
            "PROVISION_NOT_FOUND",
            "INTERNAL_ERROR",
          ],
        },
        message: nonEmptyString,
        parameter: nonEmptyString,
      },
      ["code", "message"],
    ),
  }),
  DiscoveryResponse: closedObject({
    meta: reference("Meta"),
    data: closedObject({
      name: {
        type: "string",
        const: "Regulatory Knowledge Platform Public API",
      },
      status: { type: "string", const: "active" },
      capabilities: arrayOf(
        closedObject({
          id: {
            type: "string",
            enum: [
              "resolve-law",
              "law-structure",
              "get-provision",
              "get-relationships",
            ],
          },
          method: { type: "string", const: "GET" },
          pathTemplate: { type: "string", pattern: "^/api/v1/" },
        }),
      ),
    }),
  }),
  DocumentReference: {
    ...closedObject(documentReferenceProperties, documentReferenceRequired),
    oneOf: [
      {
        properties: {
          jurisdiction: { const: "FR" },
          publicationDate: { type: "null" },
          publicationDateBasis: {
            const: "aggregate-with-multiple-component-publications",
          },
        },
        required: ["jurisdiction", "publicationDate", "publicationDateBasis"],
      },
      {
        properties: {
          jurisdiction: { not: { const: "FR" } },
          publicationDate: { type: "string", format: "date" },
        },
        required: ["jurisdiction"],
        not: { required: ["publicationDateBasis"] },
      },
    ],
  },
  LawTarget: closedObject({
    entityId: nonEmptyString,
    kind: {
      type: "string",
      enum: ["article", "recital", "annex", "other"],
    },
    number: nonEmptyString,
    label: nonEmptyString,
    title: nullableString,
  }),
  LawResult: closedObject({
    document: reference("DocumentReference"),
    familyId: { type: "string", pattern: "^family:" },
    regulatoryLevel: {
      type: "string",
      enum: publicRegulatoryLevelSchema.options,
    },
    measureType: {
      type: "string",
      enum: publicMeasureTypeSchema.options,
    },
    aliases: arrayOf(nonEmptyString),
    match: closedObject({
      reason: {
        type: "string",
        enum: [
          "catalog",
          "exact-celex",
          "exact-local-id",
          "exact-alias",
          "typo-alias",
          "exact-citation",
          "exact-title",
          "title-prefix",
          "title-terms",
          "law-anchor",
        ],
      },
      score: { type: "number", minimum: 0 },
    }),
    target: { oneOf: [reference("LawTarget"), { type: "null" }] },
  }),
  LawResolveFilters: closedObject(
    {
      jurisdiction: { type: "string", enum: publicJurisdictionSchema.options },
      documentType: { type: "string", enum: publicDocumentTypeSchema.options },
      regulatoryLevel: {
        type: "string",
        enum: publicRegulatoryLevelSchema.options,
      },
      measureType: { type: "string", enum: publicMeasureTypeSchema.options },
    },
    [],
  ),
  LawResolveResponse: closedObject({
    meta: reference("Meta"),
    data: closedObject({
      query: nonEmptyString,
      normalizedQuery: nonEmptyString,
      filters: reference("LawResolveFilters"),
      resultCount: { type: "integer", minimum: 0 },
      bestMatch: { oneOf: [reference("LawResult"), { type: "null" }] },
      results: arrayOf(reference("LawResult"), 10),
    }),
  }),
  StructureNode: closedObject(
    {
      id: nonEmptyString,
      kind: nonEmptyString,
      label: nonEmptyString,
      title: nonEmptyString,
      range: nonEmptyString,
      provisionId: nonEmptyString,
      children: arrayOf(reference("StructureNode")),
    },
    ["id", "kind", "label", "children"],
  ),
  StructureDocumentReference: {
    ...closedObject(
      {
        ...documentReferenceProperties,
        sourceSnapshotId: nonEmptyString,
        sourceVersion: nonEmptyString,
        lastChecked: { type: "string", format: "date-time" },
        canonicalBuildId: nonEmptyString,
      },
      [
        ...documentReferenceRequired,
        "sourceSnapshotId",
        "sourceVersion",
        "lastChecked",
        "canonicalBuildId",
      ],
    ),
    oneOf: [
      {
        properties: {
          jurisdiction: { const: "FR" },
          publicationDate: { type: "null" },
          publicationDateBasis: {
            const: "aggregate-with-multiple-component-publications",
          },
        },
        required: ["jurisdiction", "publicationDate", "publicationDateBasis"],
      },
      {
        properties: {
          jurisdiction: { not: { const: "FR" } },
          publicationDate: { type: "string", format: "date" },
        },
        required: ["jurisdiction"],
        not: { required: ["publicationDateBasis"] },
      },
    ],
  },
  LawStructureResponse: closedObject({
    meta: reference("Meta"),
    data: closedObject(
      {
        document: reference("StructureDocumentReference"),
        scopedSourceNotes: arrayOf(reference("ScopedSourceNote")),
        collections: arrayOf(
          closedObject({
            id: {
              type: "string",
              enum: ["articles", "recitals", "annexes", "provisions"],
            },
            label: nonEmptyString,
            count: { type: "integer", minimum: 0 },
            roots: arrayOf(reference("StructureNode")),
          }),
        ),
      },
      ["document", "collections"],
    ),
  }),
  SourceLocator: closedObject({
    kind: {
      type: "string",
      enum: ["xml-id", "xpath", "css-selector", "pdf-page", "fixture"],
    },
    value: nonEmptyString,
  }),
  ContentLayout: closedObject(
    {
      name: { type: "string", enum: [...layoutNameSchema.options, "run"] },
      contentRole: { type: "string", enum: contentRoleSchema.options },
      sourceLocator: reference("SourceLocator"),
      contentIndex: { type: "integer", minimum: 0 },
      columnCount: { type: "integer", minimum: 1 },
      columnStart: { type: "integer", minimum: 1 },
      columnSpan: { type: "integer", minimum: 1 },
      href: { type: "string", format: "uri" },
      listStyle: { type: "string", enum: ["ordered", "unordered"] },
      children: arrayOf(reference("ContentLayout")),
    },
    ["name", "contentRole", "sourceLocator", "children"],
  ),
  ContentRun: closedObject(
    {
      type: { const: "text" },
      text: nonEmptyString,
      contentRole: { type: "string", enum: contentRoleSchema.options },
      sourceLocator: reference("SourceLocator"),
    },
    ["type", "text"],
  ),
  BodyBlock: closedObject(
    {
      id: nonEmptyString,
      kind: {
        type: "string",
        enum: [
          "paragraph",
          "subparagraph",
          "point",
          "subpoint",
          "recital",
          "annex",
          "annex-part",
          "other",
        ],
      },
      contentRole: { type: "string", enum: contentRoleSchema.options },
      contentLayout: arrayOf(reference("ContentLayout")),
      marker: { type: "string" },
      text: { type: "string" },
      anchor: nonEmptyString,
      sourceLocator: reference("SourceLocator"),
      orderedContent: arrayOf({
        oneOf: [
          reference("ContentRun"),
          closedObject({ type: { const: "child" }, childId: nonEmptyString }),
          closedObject({
            type: { const: "resource" },
            resource: closedObject({
              id: nonEmptyString,
              kind: { const: "formula" },
              mediaType: { const: "image/png" },
              dataUrl: { type: "string", pattern: "^data:image/png;base64," },
              sourceFileName: nonEmptyString,
              sourceSha256: {
                type: "string",
                pattern: "^sha256:[a-f0-9]{64}$",
              },
              renditionSha256: {
                type: "string",
                pattern: "^sha256:[a-f0-9]{64}$",
              },
            }),
          }),
        ],
      }),
      children: arrayOf(reference("BodyBlock")),
    },
    [
      "id",
      "kind",
      "text",
      "anchor",
      "sourceLocator",
      "orderedContent",
      "children",
    ],
  ),
  ScopedSourceNote: closedObject({
    scope: { type: "string", enum: ["document", "structure"] },
    ownerId: nonEmptyString,
    ownerSourceUrl: { type: "string", format: "uri" },
    ownerLabel: nonEmptyString,
    position: { type: "integer", minimum: 0 },
    contentHash: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
    block: reference("BodyBlock"),
  }),
  SourceStatus: closedObject(
    {
      basis: { type: "string", enum: ["original-oj", "consolidated"] },
      textAsOf: { type: "string", format: "date" },
      checkedAt: { type: "string", format: "date-time" },
      currentVersionUrl: { type: "string", format: "uri" },
      corrections: arrayOf(
        closedObject({
          date: { type: "string", format: "date" },
          url: { type: "string", format: "uri" },
        }),
      ),
      textAuthorityStatus: {
        type: "string",
        enum: ["non-authoritative-consolidation", "publisher-consolidation"],
      },
      textAsOfBasis: {
        type: "string",
        enum: ["last-amendment-act-date", "publisher-version-date"],
      },
      authorityNote: { type: "string" },
      sourceNotes: arrayOf({ type: "string" }),
    },
    ["basis", "textAsOf", "currentVersionUrl", "corrections"],
  ),
  SourceNote: closedObject({
    contentRole: { type: "string", const: "source-note" },
    contentIndex: { type: "integer", minimum: 0 },
    text: { type: "string" },
    sourceLocator: reference("SourceLocator"),
  }),
  TextBlock: closedObject(
    {
      entityId: nonEmptyString,
      kind: {
        type: "string",
        enum: [
          "paragraph",
          "subparagraph",
          "point",
          "subpoint",
          "recital",
          "annex",
          "annex-part",
          "other",
        ],
      },
      marker: nonEmptyString,
      text: { type: "string" },
      sourceLocator: reference("SourceLocator"),
      contentRole: { type: "string", enum: contentRoleSchema.options },
      sourceNotes: arrayOf(reference("SourceNote")),
      contentLayout: arrayOf(reference("ContentLayout")),
      orderedContent: arrayOf(reference("ContentRun")),
      children: arrayOf(reference("TextBlock")),
    },
    ["entityId", "kind", "text", "sourceLocator", "children"],
  ),
  ProvisionResponse: closedObject({
    meta: reference("Meta"),
    data: closedObject({
      document: reference("DocumentReference"),
      provision: closedObject(
        {
          entityId: nonEmptyString,
          kind: {
            type: "string",
            enum: ["article", "recital", "annex", "other"],
          },
          contentRole: { type: "string", enum: contentRoleSchema.options },
          collectionId: {
            type: "string",
            enum: ["articles", "recitals", "annexes", "provisions"],
          },
          number: nonEmptyString,
          label: nonEmptyString,
          title: nullableString,
          breadcrumbs: arrayOf(
            closedObject(
              {
                id: nonEmptyString,
                kind: nonEmptyString,
                label: nonEmptyString,
                title: nonEmptyString,
              },
              ["id", "kind", "label"],
            ),
          ),
          previousEntityId: nullableString,
          nextEntityId: nullableString,
          sourceLocator: reference("SourceLocator"),
          officialSourceUrl: { type: "string", format: "uri" },
          blocks: arrayOf(reference("TextBlock")),
        },
        [
          "entityId",
          "kind",
          "collectionId",
          "number",
          "label",
          "title",
          "breadcrumbs",
          "previousEntityId",
          "nextEntityId",
          "sourceLocator",
          "blocks",
        ],
      ),
      source: closedObject({
        officialUrl: { type: "string", format: "uri" },
        sourceSnapshotId: nonEmptyString,
        sourceVersion: nonEmptyString,
        asOf: { type: "string", format: "date" },
        lastChecked: { type: "string", format: "date-time" },
        canonicalBuildId: nonEmptyString,
      }),
    }),
  }),
  RelationshipEndpoint: closedObject(
    {
      entityId: nonEmptyString,
      documentId: nonEmptyString,
      documentShortName: nonEmptyString,
      provisionId: nonEmptyString,
      kind: nonEmptyString,
      label: nonEmptyString,
      title: nullableString,
      officialUrl: { type: "string", format: "uri" },
    },
    [
      "entityId",
      "documentId",
      "documentShortName",
      "kind",
      "label",
      "title",
      "officialUrl",
    ],
  ),
  Relationship: closedObject(
    {
      id: { type: "string", pattern: "^relationship:" },
      relationType: {
        type: "string",
        enum: publicRelationshipTypeSchema.options,
      },
      provenance: {
        type: "string",
        enum: publicRelationshipProvenanceSchema.options,
      },
      source: reference("RelationshipEndpoint"),
      target: reference("RelationshipEndpoint"),
      evidence: closedObject({
        text: nonEmptyString,
        locator: nonEmptyString,
        sourceUrl: { type: "string", format: "uri" },
      }),
      builder: closedObject({
        method: nonEmptyString,
        version: nonEmptyString,
      }),
      score: { type: "number", minimum: 0 },
      resolutionStatus: { type: "string", const: "resolved" },
    },
    [
      "id",
      "relationType",
      "provenance",
      "source",
      "target",
      "evidence",
      "builder",
      "resolutionStatus",
    ],
  ),
  RelationshipGroups: closedObject({
    references: arrayOf(reference("Relationship")),
    citedBy: arrayOf(reference("Relationship")),
    mandates: arrayOf(reference("Relationship")),
    adoptedUnder: arrayOf(reference("Relationship")),
    supplements: arrayOf(reference("Relationship")),
    implements: arrayOf(reference("Relationship")),
    relatedDocuments: arrayOf(reference("Relationship")),
    relatedRecitals: arrayOf(reference("Relationship")),
  }),
  ProvisionRelationshipsResponse: closedObject({
    meta: reference("Meta"),
    data: closedObject({
      provision: closedObject(
        {
          entityId: nonEmptyString,
          documentId: nonEmptyString,
          documentShortName: nonEmptyString,
          kind: nonEmptyString,
          contentRole: { type: "string", enum: contentRoleSchema.options },
          label: nonEmptyString,
          title: nullableString,
        },
        [
          "entityId",
          "documentId",
          "documentShortName",
          "kind",
          "label",
          "title",
        ],
      ),
      relationshipCount: { type: "integer", minimum: 0 },
      groups: reference("RelationshipGroups"),
    }),
  }),
};

const standardHeaders = {
  "X-API-Version": {
    description: "Public API major version.",
    schema: { type: "string", const: PUBLIC_API_VERSION },
  },
  "X-API-Contract-Version": {
    description: "Public response contract version.",
    schema: { type: "string", const: PUBLIC_API_CONTRACT_VERSION },
  },
  "X-Runtime-Build-Id": {
    description: "Loaded read-only Runtime artifact build ID.",
    schema: nonEmptyString,
  },
  "RateLimit-Limit": {
    description: "Process-scoped request limit for the current window.",
    schema: { type: "integer", minimum: 1 },
  },
  "RateLimit-Remaining": {
    description: "Requests remaining in the current process-local window.",
    schema: { type: "integer", minimum: 0 },
  },
  "RateLimit-Reset": {
    description: "Current window reset time as Unix seconds.",
    schema: { type: "integer", minimum: 0 },
  },
};

function jsonResponse(description: string, schemaName: keyof typeof schemas) {
  return {
    description,
    headers: standardHeaders,
    content: {
      "application/json": { schema: reference(schemaName) },
    },
  };
}

const errors = {
  "400": jsonResponse("Invalid bounded request.", "ApiError"),
  "401": jsonResponse("Bearer API key is missing or invalid.", "ApiError"),
  "403": jsonResponse(
    "Requested Profile is not served by this deployment.",
    "ApiError",
  ),
  "404": jsonResponse("Entity is not published in this Profile.", "ApiError"),
  "429": jsonResponse("Process-scoped request limit exceeded.", "ApiError"),
  "500": jsonResponse("Internal adapter failure.", "ApiError"),
  "503": jsonResponse("Public API key is not configured.", "ApiError"),
};

const profileParameter = {
  name: "profileId",
  in: "query",
  required: false,
  description:
    "Optional assertion of the deployment-fixed Profile. It does not switch artifacts.",
  schema: nonEmptyString,
};

function resolveFilterParameter(
  name: string,
  values: readonly string[],
  description: string,
) {
  return {
    name,
    in: "query",
    required: false,
    description,
    schema: { type: "string", enum: values },
  };
}

export const publicApiOpenApiDocument = {
  openapi: "3.1.0",
  jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
  info: {
    title: "Regulatory Knowledge Platform Public API",
    version: PUBLIC_API_CONTRACT_VERSION,
    description:
      "Deterministic, read-only access to reviewed regulatory documents, exact official text, and evidence-bearing relationships. Empty results describe only the loaded deployment Profile and are not legal conclusions.",
  },
  servers: [{ url: "/api/v1", description: "Current deployment" }],
  security: [{ BearerAuth: [] }],
  tags: [
    { name: "Discovery" },
    { name: "Laws" },
    { name: "Provisions" },
    { name: "Relationships" },
  ],
  paths: {
    "/": {
      get: {
        operationId: "discoverPublicApi",
        summary: "Discover Public API capabilities",
        tags: ["Discovery"],
        parameters: [profileParameter],
        responses: {
          "200": jsonResponse("Active capabilities.", "DiscoveryResponse"),
          "401": errors["401"],
          "403": errors["403"],
          "429": errors["429"],
          "500": errors["500"],
          "503": errors["503"],
        },
      },
    },
    "/laws/resolve": {
      get: {
        operationId: "resolveLaw",
        summary: "Resolve a law and optional exact Provision",
        description:
          "Returns at most ten deterministic matches. No match is an empty current-Profile result, not a statement that the law does not exist.",
        tags: ["Laws"],
        parameters: [
          {
            name: "q",
            in: "query",
            required: true,
            schema: { type: "string", minLength: 1, maxLength: 200 },
          },
          profileParameter,
          resolveFilterParameter(
            "jurisdiction",
            publicJurisdictionSchema.options,
            "Narrow results to one jurisdiction in the loaded Profile.",
          ),
          resolveFilterParameter(
            "documentType",
            publicDocumentTypeSchema.options,
            "Narrow results to one document type in the loaded Profile.",
          ),
          resolveFilterParameter(
            "regulatoryLevel",
            publicRegulatoryLevelSchema.options,
            "Narrow results to one regulatory level in the loaded Profile.",
          ),
          resolveFilterParameter(
            "measureType",
            publicMeasureTypeSchema.options,
            "Narrow results to one measure type in the loaded Profile.",
          ),
        ],
        responses: {
          "200": jsonResponse(
            "Deterministic law matches.",
            "LawResolveResponse",
          ),
          "400": errors["400"],
          "401": errors["401"],
          "403": errors["403"],
          "429": errors["429"],
          "500": errors["500"],
          "503": errors["503"],
        },
      },
    },
    "/laws/{documentId}/structure": {
      get: {
        operationId: "getLawStructure",
        summary: "Get one law's structure",
        tags: ["Laws"],
        parameters: [
          {
            name: "documentId",
            in: "path",
            required: true,
            description: "Exact stable Document ID, URL-encoded in the path.",
            schema: { type: "string", minLength: 1, maxLength: 180 },
          },
          profileParameter,
        ],
        responses: {
          "200": jsonResponse(
            "Source/version identity and table of contents without legal body text.",
            "LawStructureResponse",
          ),
          "400": errors["400"],
          "401": errors["401"],
          "403": errors["403"],
          "404": errors["404"],
          "429": errors["429"],
          "500": errors["500"],
          "503": errors["503"],
        },
      },
    },
    "/provisions/{entityId}": {
      get: {
        operationId: "getProvision",
        summary: "Get one exact root Provision",
        tags: ["Provisions"],
        parameters: [
          {
            name: "entityId",
            in: "path",
            required: true,
            description:
              "Exact root Provision stable ID, URL-encoded in the path.",
            schema: { type: "string", minLength: 1, maxLength: 260 },
          },
          profileParameter,
        ],
        responses: {
          "200": jsonResponse(
            "Exact official-text block tree and source identity.",
            "ProvisionResponse",
          ),
          "400": errors["400"],
          "401": errors["401"],
          "403": errors["403"],
          "404": errors["404"],
          "429": errors["429"],
          "500": errors["500"],
          "503": errors["503"],
        },
      },
    },
    "/provisions/{entityId}/relationships": {
      get: {
        operationId: "getProvisionRelationships",
        summary: "Get one exact Provision's published relationships",
        description:
          "Preserves stored direction, provenance, exact evidence, builder identity, and optional score. Empty groups mean only that no relationship of that group is published in the loaded Profile.",
        tags: ["Relationships"],
        parameters: [
          {
            name: "entityId",
            in: "path",
            required: true,
            description:
              "Exact root Provision stable ID, URL-encoded in the path.",
            schema: { type: "string", minLength: 1, maxLength: 260 },
          },
          profileParameter,
        ],
        responses: {
          "200": jsonResponse(
            "All eight published relationship groups.",
            "ProvisionRelationshipsResponse",
          ),
          "400": errors["400"],
          "401": errors["401"],
          "403": errors["403"],
          "404": errors["404"],
          "429": errors["429"],
          "500": errors["500"],
          "503": errors["503"],
        },
      },
    },
  },
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "API key",
        description:
          "Enter one configured REGULATORY_PUBLIC_API_KEYS value. The key is never returned by the API.",
      },
    },
    schemas,
  },
} as const;

const require = createRequire(import.meta.url);
const swaggerUiDistribution = require("swagger-ui-dist") as {
  getAbsoluteFSPath(): string;
};

export const swaggerUiAssetPath = swaggerUiDistribution.getAbsoluteFSPath();

export function renderSwaggerUiHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Regulatory Knowledge Platform API</title>
    <link rel="stylesheet" href="/api/docs/assets/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="/api/docs/assets/swagger-ui-bundle.js"></script>
    <script src="/api/docs/assets/swagger-ui-standalone-preset.js"></script>
    <script>
      window.addEventListener("load", () => {
        window.ui = SwaggerUIBundle({
          url: "/api/v1/openapi.json",
          dom_id: "#swagger-ui",
          deepLinking: true,
          displayRequestDuration: true,
          persistAuthorization: false,
          presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
          layout: "StandaloneLayout"
        });
      });
    </script>
  </body>
</html>`;
}
