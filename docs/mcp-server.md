# MCP server

The Phase 4 MCP adapter exposes deterministic regulatory retrieval to local MCP hosts without introducing AI generation, vector search, GraphDB, another corpus, or another business repository. It opens the same verified read-only Runtime artifact and reuses the same versioned external service outputs as Public API v1; it does not call the REST endpoint or read raw/Canonical/editorial files directly.

## Current scope

Server identity: `regulatory-knowledge-platform@0.3.0`.

| Tool | Required input | Optional input | Output boundary |
|---|---|---|---|
| `resolve_law` | `query` (1–200 characters) | deployment-fixed `profileId`; `jurisdiction`; `documentType`; `regulatoryLevel`; `measureType` | Up to ten matching laws and an exact Provision stable ID when the query contains one. |
| `get_law_structure` | `documentId` (1–180 characters) | deployment-fixed `profileId` | Document source/version identity and table of contents without legal body text. |
| `get_provision` | root Provision `entityId` (1–260 characters) | deployment-fixed `profileId` | One exact Provision, official-text block tree, source locators, and source/version identity. |
| `get_relationships` | root Provision `entityId` (1–260 characters) | deployment-fixed `profileId` | All relationship groups published for that Provision, with directed stable endpoints, provenance, evidence, builder identity, and optional score. |

All tools are declared read-only, non-destructive, idempotent, and closed-world over the loaded artifact. Every success and service error contains the same `meta.apiVersion`, external contract version, Runtime build, and Profile identity used by Public API v1. Tool results provide both a JSON text content block for broad client compatibility and equivalent `structuredContent`.

The `resolve_law` filter values match the [Public API resolve contract](public-api-v1.md#resolve-filters). They are combined with AND, narrow only the loaded Profile, and are not legal-applicability conclusions. An empty `resolve_law` result means “no match in the current artifact and filters,” not “the law does not exist.” An empty relationship group means only that no edge of that group is published for the Provision in the loaded Profile. The adapter retrieves official text, identifiers, and reviewed relationships; it does not generate legal interpretation, conclusions, or advice.

## Build and connect

Build or verify the Runtime before connecting:

```bash
npm run runtime:build
npm run runtime:verify
```

Configure a local MCP host to spawn the process from the repository root:

```json
{
  "mcpServers": {
    "regulatory-knowledge": {
      "command": "npm",
      "args": ["run", "--silent", "mcp"],
      "cwd": "/absolute/path/to/regulatory-knowledge-platform"
    }
  }
}
```

Some hosts use a different outer configuration key or do not support `cwd`; in that case use the host's equivalent working-directory setting or an absolute command/argument path. The host must launch the process—it should not connect to a separately started TCP port. `--silent` prevents npm's banner from corrupting stdout, which is reserved exclusively for MCP JSON-RPC. Diagnostics go to stderr.

The implementation follows the official MCP TypeScript SDK v2 stdio factory pattern: [`serveStdio`](https://ts.sdk.modelcontextprotocol.io/v2/servers/stdio). The same factory supports current and legacy protocol openings through the SDK's default negotiation policy.

## Executable client example

Run the copyable SDK client from the repository root:

```bash
npm run example:mcp:relationships -- "DORA Article 28"
```

The client spawns the stdio server, calls `resolve_law`, requires an exact root Provision stable ID, and passes that ID to `get_relationships`. It prints the contract/Runtime/Profile identity, deterministic resolution metadata, counts for all groups, and the selected group's complete published edges and evidence. The default group is `mandates`; pass `--group references` or another returned group name after the query to inspect a different group. It does not send the original query directly to `get_relationships` and does not add AI interpretation.

An optional `REGULATORY_EXAMPLE_PROFILE_ID=full-corpus` asserts a specific deployment-fixed Profile; a mismatch fails through the normal structured service error. The example has no API key because it uses local stdio. It is an executable integration example, not a published client library or a remote MCP deployment.

## Errors and Profile isolation

- MCP input-schema failures return an MCP tool error before the service is called.
- Stable service failures use `isError: true` and retain the Public API structured error envelope, including `INVALID_REQUEST`, `PROFILE_NOT_AVAILABLE`, `LAW_NOT_FOUND`, and `PROVISION_NOT_FOUND`.
- `profileId` may be omitted or equal the loaded deployment Profile. It cannot switch SQLite artifacts or widen corpus access.
- `get_provision` and `get_relationships` accept only a root Provision stable ID. A Body Block ID fails closed.
- `get_relationships` preserves the stored source/target direction. In particular, the query-perspective `citedBy` group does not invert its edges.
- Results do not contain raw XML, local paths, SQLite schema/path, API keys, or UI-specific Reader/Explorer fields.

## Security and deployment boundary

Local stdio relies on the launching user's operating-system and filesystem permissions. It intentionally does not require `REGULATORY_PUBLIC_API_KEYS`, because no network listener is opened and the host owns the child process and its lifetime.

This is not yet a remotely hosted MCP endpoint. Streamable HTTP, remote authentication/authorization, per-client quotas, audit logging, and Cloud Run routing require a separate reviewed Phase 4 slice. Do not expose the stdio process through an ad-hoc socket or unauthenticated proxy.

## Compatibility

- Tool names, documented input meaning, stable IDs, Profile isolation, and structured output semantics form the MCP `0.3.0` contract.
- Compatible tools or optional fields may be added during `0.x`; incompatible input/output changes require an MCP server version change and migration note.
- MCP and REST remain separate transports. Neither transport owns legal business logic or a second regulatory dataset.
