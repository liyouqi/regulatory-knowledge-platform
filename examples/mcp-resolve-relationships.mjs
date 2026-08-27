import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const arguments_ = process.argv.slice(2);
const groupFlagIndex = arguments_.indexOf("--group");
const relationshipGroup =
  groupFlagIndex >= 0 ? arguments_[groupFlagIndex + 1] : "mandates";
if (!relationshipGroup || relationshipGroup.startsWith("--")) {
  throw new Error("--group requires a relationship group name");
}
if (groupFlagIndex >= 0) arguments_.splice(groupFlagIndex, 2);
const query = arguments_.join(" ").trim() || "DORA Article 28";
const profileId = process.env.REGULATORY_EXAMPLE_PROFILE_ID?.trim();

function argumentsWithProfile(arguments_) {
  return profileId ? { ...arguments_, profileId } : arguments_;
}

function readToolPayload(result, toolName) {
  const payload = result.structuredContent;
  if (!payload || typeof payload !== "object") {
    throw new Error(`${toolName} returned no structured content`);
  }
  if (result.isError) {
    const error = payload.error;
    const code = error?.code ?? "UNKNOWN_ERROR";
    const message = error?.message ?? "The MCP tool failed";
    throw new Error(`${toolName} failed (${code}): ${message}`);
  }
  return payload;
}

const transport = new StdioClientTransport({
  command: process.platform === "win32" ? "npm.cmd" : "npm",
  args: ["run", "--silent", "mcp"],
  cwd: process.cwd(),
  stderr: "inherit",
});
const client = new Client({
  name: "regulatory-relationships-example",
  version: "1.0.0",
});

try {
  await client.connect(transport);

  const resolveResult = await client.callTool({
    name: "resolve_law",
    arguments: argumentsWithProfile({ query }),
  });
  const resolvePayload = readToolPayload(resolveResult, "resolve_law");
  const bestMatch = resolvePayload.data?.bestMatch;
  const entityId = bestMatch?.target?.entityId;
  if (!entityId) {
    throw new Error(
      `Query did not resolve to an exact root Provision: ${query}`,
    );
  }

  const relationshipsResult = await client.callTool({
    name: "get_relationships",
    arguments: argumentsWithProfile({ entityId }),
  });
  const relationshipsPayload = readToolPayload(
    relationshipsResult,
    "get_relationships",
  );
  const groups = relationshipsPayload.data?.groups;
  if (!groups || typeof groups !== "object") {
    throw new Error("get_relationships returned an invalid groups object");
  }

  const selectedRelationships = groups[relationshipGroup];
  if (!Array.isArray(selectedRelationships)) {
    throw new Error(
      `Unknown relationship group ${relationshipGroup}; choose one of ${Object.keys(groups).join(", ")}`,
    );
  }
  const groupCounts = Object.fromEntries(
    Object.entries(groups).map(([name, relationships]) => [
      name,
      Array.isArray(relationships) ? relationships.length : 0,
    ]),
  );
  const output = {
    meta: relationshipsPayload.meta,
    query: resolvePayload.data.query,
    normalizedQuery: resolvePayload.data.normalizedQuery,
    resolution: {
      documentId: bestMatch.document.id,
      entityId,
      matchReason: bestMatch.match.reason,
    },
    provision: relationshipsPayload.data.provision,
    relationshipCount: relationshipsPayload.data.relationshipCount,
    groupCounts,
    relationshipGroup,
    relationships: selectedRelationships,
  };

  console.log(JSON.stringify(output, null, 2));
} finally {
  await client.close();
}
