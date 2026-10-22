# Internal citation context

These internal endpoints return text and evidence from the compiled Runtime:

```text
GET /api/internal/citation-context/:entityId
GET /api/internal/citation-retrieval?q=<query>&limit=<1-10>&documentId=<optional>
```

Pass a stable Provision or Body Block ID returned by full-text search. CitationContext schema/method **1.1.0** returns exact Reader text runs in `orderedContent` order with stable IDs, original `contentIndex`, anchors and locators; source/snapshot/version/build identity; root-Provision relationships; and regulatory context. One entity can have multiple runs: never deduplicate by entity ID. `contentIndex` is scoped to the same source/Runtime, not a new stable ID. `textProjection` declares text-only order, no marker insertion and the number of omitted formula occurrences; empty/formula-only targets may have no text segments. See the [migration contract](reviews/citations-20261017.md). CitationRetrieval's outer schema is **1.1.0**, while its FTS algorithm remains **1.0.0**. Exact match/rank/score are deterministic metadata, not legal confidence. Unknown/Profile-excluded IDs return `404`; corrupt loaded evidence throws, never silently falls back.

After `npm run dev`, for example:

```bash
curl 'http://localhost:3000/api/internal/citation-context/lu%3Acssf%3Acircular-12-552%3Aprovision%3Aintroduction%3Ablock%3A7'
curl --get 'http://localhost:3000/api/internal/citation-retrieval' \
  --data-urlencode 'q=EBA shall issue guidelines arrangements processes mechanisms' \
  --data-urlencode 'limit=3'
```

The retrieval route runs the existing SQLite FTS5 search and resolves each result to its exact citation bundle. It preserves both final `rank` and original `searchRank`; an unresolved body record may fall back only to its own root Provision, never to another law. Empty lexical matches return an identity-bearing response with no results. The reviewed CRD/CSSF/EBA 0→1 gate can be rerun with `npm run citation:benchmark`; all three cases must hit the expected entity at Top 1.

These routes use the internal contract. External clients should use the versioned [REST API](public-api-v1.md) or [MCP tools](mcp-server.md).

