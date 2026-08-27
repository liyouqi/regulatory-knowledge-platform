import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CitationContextService } from "../agent/citation-context-service";
import { PublicApiService } from "../public-api/public-api-service";
import { SqliteRuntimeRepository } from "../runtime/sqlite-runtime-repository";
import { createLawSearchRecords } from "../search/law-search";
import {
  publicApiErrorResponseSchema,
  publicLawResolveResponseSchema,
  publicLawStructureResponseSchema,
  publicProvisionRelationshipsResponseSchema,
  publicProvisionResponseSchema,
} from "../shared/public-api";
import { createRegulatoryMcpServer } from "./regulatory-mcp-server";

let repository: SqliteRuntimeRepository | undefined;
let server: ReturnType<typeof createRegulatoryMcpServer> | undefined;
let client: Client | undefined;

beforeAll(async () => {
  repository = new SqliteRuntimeRepository();
  const documentViews = repository.listDocumentViews();
  const service = new PublicApiService(
    repository,
    createLawSearchRecords(documentViews, repository.listLawSearchSources()),
    new CitationContextService(repository, documentViews),
  );
  server = createRegulatoryMcpServer(service);
  client = new Client({ name: "regulatory-mcp-test", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
});

afterAll(async () => {
  await client?.close();
  await server?.close();
  repository?.close();
});

describe("Regulatory MCP server", () => {
  it("publishes only the four bounded read-only tools", async () => {
    const result = await client?.listTools();

    expect(result?.tools.map((tool) => tool.name)).toEqual([
      "resolve_law",
      "get_law_structure",
      "get_provision",
      "get_relationships",
    ]);
    for (const tool of result?.tools ?? []) {
      expect(tool.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
      expect(tool.inputSchema).toMatchObject({
        type: "object",
        additionalProperties: false,
      });
    }
  });

  it("applies bounded resolve filters without widening the Profile", async () => {
    const result = await client?.callTool({
      name: "resolve_law",
      arguments: {
        query: "DORA",
        jurisdiction: "EU",
        regulatoryLevel: "level-2",
        measureType: "its",
      },
    });
    const payload = publicLawResolveResponseSchema.parse(
      result?.structuredContent,
    );

    expect(payload.data.filters).toEqual({
      jurisdiction: "EU",
      regulatoryLevel: "level-2",
      measureType: "its",
    });
    expect(payload.data.resultCount).toBeGreaterThan(0);
    for (const item of payload.data.results) {
      expect(item.document.jurisdiction).toBe("EU");
      expect(item.regulatoryLevel).toBe("level-2");
      expect(item.measureType).toBe("its");
    }
  });

  it("resolves a law through the shared deterministic service", async () => {
    const result = await client?.callTool({
      name: "resolve_law",
      arguments: { query: "DORA article 28" },
    });
    const payload = publicLawResolveResponseSchema.parse(
      result?.structuredContent,
    );

    expect(result?.isError).not.toBe(true);
    expect(payload.data.bestMatch).toMatchObject({
      document: { id: "eu:32022R2554", shortName: "DORA" },
      target: { entityId: "eu:32022R2554:article:28" },
    });
    expect(result?.content).toEqual([
      { type: "text", text: JSON.stringify(payload) },
    ]);
  });

  it("returns structure separately from one exact official Provision", async () => {
    const structureResult = await client?.callTool({
      name: "get_law_structure",
      arguments: { documentId: "eu:32022R2554" },
    });
    const provisionResult = await client?.callTool({
      name: "get_provision",
      arguments: { entityId: "eu:32022R2554:article:28" },
    });
    const structure = publicLawStructureResponseSchema.parse(
      structureResult?.structuredContent,
    );
    const provision = publicProvisionResponseSchema.parse(
      provisionResult?.structuredContent,
    );

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
    expect(provision.data.source.officialUrl).toBe(
      "https://eur-lex.europa.eu/eli/reg/2022/2554/oj/eng",
    );
    for (const result of [structureResult, provisionResult]) {
      const serialized = JSON.stringify(result?.structuredContent);
      expect(serialized).not.toContain("regulatory.sqlite");
      expect(serialized).not.toContain("data/raw");
    }
  });

  it("returns directed evidence-bearing relationships for an exact Provision", async () => {
    const result = await client?.callTool({
      name: "get_relationships",
      arguments: { entityId: "eu:32022R2554:article:28" },
    });
    const payload = publicProvisionRelationshipsResponseSchema.parse(
      result?.structuredContent,
    );

    expect(result?.isError).not.toBe(true);
    expect(payload.meta.contractVersion).toBe("1.3.0");
    expect(payload.data.groups.mandates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relationType: "MANDATES",
          provenance: "OFFICIAL_MAPPING",
          source: expect.objectContaining({
            entityId: "eu:32022R2554:article:28",
          }),
          target: expect.objectContaining({ entityId: "eu:32024R2956" }),
          evidence: expect.objectContaining({ text: expect.any(String) }),
        }),
        expect.objectContaining({
          target: expect.objectContaining({ entityId: "eu:32024R1773" }),
        }),
      ]),
    );
    expect(JSON.stringify(payload)).not.toContain('"path"');
  });

  it("keeps Profile isolation and service errors in the structured result", async () => {
    const profileResult = await client?.callTool({
      name: "resolve_law",
      arguments: {
        query: "DORA article 28",
        profileId: "banking-default",
      },
    });
    const blockResult = await client?.callTool({
      name: "get_provision",
      arguments: {
        entityId: "eu:32022R2554:article:28:paragraph:1",
      },
    });
    const relationshipBlockResult = await client?.callTool({
      name: "get_relationships",
      arguments: {
        entityId: "eu:32022R2554:article:28:paragraph:1",
      },
    });
    const profileError = publicApiErrorResponseSchema.parse(
      profileResult?.structuredContent,
    );
    const blockError = publicApiErrorResponseSchema.parse(
      blockResult?.structuredContent,
    );
    const relationshipBlockError = publicApiErrorResponseSchema.parse(
      relationshipBlockResult?.structuredContent,
    );

    expect(profileResult?.isError).toBe(true);
    expect(profileError.error.code).toBe("PROFILE_NOT_AVAILABLE");
    expect(blockResult?.isError).toBe(true);
    expect(blockError.error.code).toBe("PROVISION_NOT_FOUND");
    expect(relationshipBlockResult?.isError).toBe(true);
    expect(relationshipBlockError.error.code).toBe("PROVISION_NOT_FOUND");
  });

  it("rejects invalid MCP arguments before calling the service", async () => {
    const missing = await client?.callTool({
      name: "resolve_law",
      arguments: {},
    });
    const additional = await client?.callTool({
      name: "get_law_structure",
      arguments: { documentId: "eu:32022R2554", extra: true },
    });
    const invalidFilter = await client?.callTool({
      name: "resolve_law",
      arguments: { query: "DORA", jurisdiction: "US" },
    });

    for (const result of [missing, additional, invalidFilter]) {
      expect(result?.isError).toBe(true);
      expect(result?.content).toEqual([
        expect.objectContaining({
          type: "text",
          text: expect.stringMatching(/Input validation error/),
        }),
      ]);
      expect(result?.structuredContent).toBeUndefined();
    }
  });
});
