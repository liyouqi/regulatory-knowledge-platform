import {
  type CallToolResult,
  McpServer,
  fromJsonSchema,
} from "@modelcontextprotocol/server";
import {
  findMonitorUpdate,
  queryMonitorUpdates,
} from "../monitor/monitor-data";
import type {
  PublicApiOperation,
  PublicApiService,
} from "../public-api/public-api-service";
import {
  type PublicLawResolveFilters,
  publicDocumentTypeSchema,
  publicJurisdictionSchema,
  publicMeasureTypeSchema,
  publicRegulatoryLevelSchema,
} from "../shared/public-api";

export const REGULATORY_MCP_SERVER_NAME = "regulatory-knowledge-platform";
export const REGULATORY_MCP_SERVER_VERSION = "0.4.0";

type ResolveLawInput = PublicLawResolveFilters & {
  query: string;
  profileId?: string;
};

type GetLawStructureInput = {
  documentId: string;
  profileId?: string;
};

type GetProvisionInput = {
  entityId: string;
  profileId?: string;
};

type ListMonitorUpdatesInput = {
  month?: string;
  source?: string;
  topic?: string;
  query?: string;
  limit?: number;
};

type GetMonitorUpdateInput = {
  eventId: string;
};

const profileIdProperty = {
  type: "string" as const,
  minLength: 1,
  maxLength: 100,
  description:
    "Optional deployment-fixed Profile ID. It cannot switch or widen the loaded corpus.",
};

const resolveLawInputSchema = fromJsonSchema<ResolveLawInput>({
  type: "object",
  additionalProperties: false,
  required: ["query"],
  properties: {
    query: {
      type: "string",
      minLength: 1,
      maxLength: 200,
      description:
        "Law name, alias, or exact provision reference, for example DORA article 28.",
    },
    profileId: profileIdProperty,
    jurisdiction: {
      type: "string",
      enum: publicJurisdictionSchema.options,
      description: "Narrow results to one jurisdiction in the loaded Profile.",
    },
    documentType: {
      type: "string",
      enum: publicDocumentTypeSchema.options,
      description: "Narrow results to one document type in the loaded Profile.",
    },
    regulatoryLevel: {
      type: "string",
      enum: publicRegulatoryLevelSchema.options,
      description:
        "Narrow results to one regulatory level in the loaded Profile.",
    },
    measureType: {
      type: "string",
      enum: publicMeasureTypeSchema.options,
      description: "Narrow results to one measure type in the loaded Profile.",
    },
  },
});

const getLawStructureInputSchema = fromJsonSchema<GetLawStructureInput>({
  type: "object",
  additionalProperties: false,
  required: ["documentId"],
  properties: {
    documentId: {
      type: "string",
      minLength: 1,
      maxLength: 180,
      description: "Exact stable Document ID, for example eu:32022R2554.",
    },
    profileId: profileIdProperty,
  },
});

const getProvisionInputSchema = fromJsonSchema<GetProvisionInput>({
  type: "object",
  additionalProperties: false,
  required: ["entityId"],
  properties: {
    entityId: {
      type: "string",
      minLength: 1,
      maxLength: 260,
      description:
        "Exact root Provision stable ID, for example eu:32022R2554:article:28.",
    },
    profileId: profileIdProperty,
  },
});

const getRelationshipsInputSchema = fromJsonSchema<GetProvisionInput>({
  type: "object",
  additionalProperties: false,
  required: ["entityId"],
  properties: {
    entityId: {
      type: "string",
      minLength: 1,
      maxLength: 260,
      description:
        "Exact root Provision stable ID whose published relationships should be returned.",
    },
    profileId: profileIdProperty,
  },
});

const listMonitorUpdatesInputSchema = fromJsonSchema<ListMonitorUpdatesInput>({
  type: "object",
  additionalProperties: false,
  properties: {
    month: {
      type: "string",
      pattern: "^20[0-9]{2}-(0[1-9]|1[0-2])$",
      description: "Optional month within the current year, in YYYY-MM.",
    },
    source: {
      type: "string",
      minLength: 1,
      maxLength: 80,
      description: "Optional exact Monitor authority name.",
    },
    topic: {
      type: "string",
      minLength: 1,
      maxLength: 100,
      description: "Optional exact stored Monitor topic.",
    },
    query: {
      type: "string",
      minLength: 1,
      maxLength: 200,
      description: "Optional plain-text match over stored titles and briefs.",
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: 50,
      description: "Maximum number of current-year updates to return.",
    },
  },
});

const getMonitorUpdateInputSchema = fromJsonSchema<GetMonitorUpdateInput>({
  type: "object",
  additionalProperties: false,
  required: ["eventId"],
  properties: {
    eventId: {
      type: "string",
      minLength: 1,
      maxLength: 500,
      description: "Exact Monitor event ID returned by list_monitor_updates.",
    },
  },
});

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

function toolResult(operation: PublicApiOperation<unknown>): CallToolResult {
  const text = JSON.stringify(operation.response);
  const structuredContent = JSON.parse(text) as Record<string, unknown>;
  return {
    content: [{ type: "text", text }],
    structuredContent,
    isError: !operation.ok,
  };
}

function staticToolResult(value: Record<string, unknown>): CallToolResult {
  const text = JSON.stringify(value);
  return {
    content: [{ type: "text", text }],
    structuredContent: JSON.parse(text) as Record<string, unknown>,
  };
}

export function createRegulatoryMcpServer(service: PublicApiService) {
  const server = new McpServer(
    {
      name: REGULATORY_MCP_SERVER_NAME,
      version: REGULATORY_MCP_SERVER_VERSION,
    },
    {
      instructions:
        "Return only deterministic data from the loaded reviewed regulatory artifact or static current-year Monitor JSON. Do not treat an empty result as proof that a law, relationship, or update does not exist. No MCP tool calls an AI model or generates legal interpretation or advice.",
    },
  );

  server.registerTool(
    "resolve_law",
    {
      title: "Resolve law",
      description:
        "Resolve a law name, alias, or provision reference against the loaded reviewed Profile. Optional filters only narrow that Profile and are not legal-applicability conclusions. An empty result means no match in the current artifact, not that the law does not exist.",
      inputSchema: resolveLawInputSchema,
      annotations: readOnlyAnnotations,
    },
    async ({
      query,
      profileId,
      jurisdiction,
      documentType,
      regulatoryLevel,
      measureType,
    }) =>
      toolResult(
        service.resolveLaw(query, profileId, {
          jurisdiction,
          documentType,
          regulatoryLevel,
          measureType,
        }),
      ),
  );

  server.registerTool(
    "get_law_structure",
    {
      title: "Get law structure",
      description:
        "Get source/version identity and table-of-contents structure for one exact stable Document ID. This tool does not return the legal body text.",
      inputSchema: getLawStructureInputSchema,
      annotations: readOnlyAnnotations,
    },
    async ({ documentId, profileId }) =>
      toolResult(service.getLawStructure(documentId, profileId)),
  );

  server.registerTool(
    "get_provision",
    {
      title: "Get provision",
      description:
        "Get one exact root Provision, its official-text block tree, source locators, and source/version identity without loading the whole law.",
      inputSchema: getProvisionInputSchema,
      annotations: readOnlyAnnotations,
    },
    async ({ entityId, profileId }) =>
      toolResult(service.getProvision(entityId, profileId)),
  );

  server.registerTool(
    "get_relationships",
    {
      title: "Get provision relationships",
      description:
        "Get all relationship groups published for one exact root Provision. Results preserve direction, provenance, exact evidence, builder identity, and optional scored editorial similarity; empty groups mean only that no relationship of that type is published in the loaded artifact.",
      inputSchema: getRelationshipsInputSchema,
      annotations: readOnlyAnnotations,
    },
    async ({ entityId, profileId }) =>
      toolResult(service.getProvisionRelationships(entityId, profileId)),
  );

  server.registerTool(
    "list_monitor_updates",
    {
      title: "List Monitor updates",
      description:
        "Query the static current-year Regulatory Monitor JSON by month, authority, topic, or text. This tool never calls an AI model; it only returns already stored records.",
      inputSchema: listMonitorUpdatesInputSchema,
      annotations: readOnlyAnnotations,
    },
    async (filters) => staticToolResult(queryMonitorUpdates(filters)),
  );

  server.registerTool(
    "get_monitor_update",
    {
      title: "Get Monitor update",
      description:
        "Get one exact static current-year Monitor record by event ID. This tool never calls an AI model.",
      inputSchema: getMonitorUpdateInputSchema,
      annotations: readOnlyAnnotations,
    },
    async ({ eventId }) => {
      const update = findMonitorUpdate(eventId);
      return staticToolResult({
        eventId,
        found: Boolean(update),
        update: update ?? null,
      });
    },
  );

  return server;
}
