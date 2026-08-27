import {
  type CallToolResult,
  McpServer,
  fromJsonSchema,
} from "@modelcontextprotocol/server";
import type {
  PublicApiOperation,
  PublicApiService,
} from "../public-api/public-api-service";

export const REGULATORY_MCP_SERVER_NAME = "regulatory-knowledge-platform";
export const REGULATORY_MCP_SERVER_VERSION = "0.2.0";

type ResolveLawInput = {
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

export function createRegulatoryMcpServer(service: PublicApiService) {
  const server = new McpServer(
    {
      name: REGULATORY_MCP_SERVER_NAME,
      version: REGULATORY_MCP_SERVER_VERSION,
    },
    {
      instructions:
        "Return only deterministic data from the loaded reviewed regulatory artifact. Do not treat an empty result as proof that a law or relationship does not exist. These tools retrieve official text and identifiers; they do not generate legal interpretation or advice.",
    },
  );

  server.registerTool(
    "resolve_law",
    {
      title: "Resolve law",
      description:
        "Resolve a law name, alias, or provision reference against the loaded reviewed Profile. An empty result means no match in the current artifact, not that the law does not exist.",
      inputSchema: resolveLawInputSchema,
      annotations: readOnlyAnnotations,
    },
    async ({ query, profileId }) =>
      toolResult(service.resolveLaw(query, profileId)),
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

  return server;
}
