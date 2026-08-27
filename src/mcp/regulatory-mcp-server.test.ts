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
  it("publishes only the three bounded read-only tools", async () => {
    const result = await client?.listTools();

    expect(result?.tools.map((tool) => tool.name)).toEqual([
      "resolve_law",
      "get_law_structure",
      "get_provision",
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
    const profileError = publicApiErrorResponseSchema.parse(
      profileResult?.structuredContent,
    );
    const blockError = publicApiErrorResponseSchema.parse(
      blockResult?.structuredContent,
    );

    expect(profileResult?.isError).toBe(true);
    expect(profileError.error.code).toBe("PROFILE_NOT_AVAILABLE");
    expect(blockResult?.isError).toBe(true);
    expect(blockError.error.code).toBe("PROVISION_NOT_FOUND");
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

    for (const result of [missing, additional]) {
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
