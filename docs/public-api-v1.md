# Public API v1

The Phase 4 Public API is a versioned delivery adapter over the same read-only Runtime and services used by the Web product. It does not read raw source files, Canonical JSON, curated mappings, or SQLite tables directly.

## Current scope

The current `v1` capability slice provides four bounded capabilities:

| Capability | Endpoint | Result boundary |
|---|---|---|
| Resolve law | `GET /api/v1/laws/resolve?q=<query>` | Up to 10 matching laws after optional bounded filters and, when supplied in the query, one exact Provision stable ID. |
| Law structure | `GET /api/v1/laws/:documentId/structure` | Document source/version identity and table-of-contents structure without legal body text. |
| Get Provision | `GET /api/v1/provisions/:entityId` | One exact root Provision, its official-text block tree, source locators, and source/version identity. |
| Get relationships | `GET /api/v1/provisions/:entityId/relationships` | All reviewed relationship groups published for one exact root Provision, preserving direction, provenance, evidence, and builder identity. |

`GET /api/v1` returns capability discovery. Bearer API-key authentication, process-scoped fixed-window rate limiting, aggregate operational counters, an OpenAPI 3.1 contract, and a local-asset Swagger UI are part of the delivery boundary. Broader relationship search, Topics, timelines, decisions, applicability, regulatory paths, and a published SDK remain later REST slices. The [local stdio MCP adapter](mcp-server.md) is documented separately and does not inherit this REST compatibility boundary. Other existing `/api/*` endpoints are internal Web transports and do not inherit the Public API compatibility commitment.

## Start locally

```bash
REGULATORY_PUBLIC_API_KEYS=local-development-key-2026 npm run dev
```

The example key is for local development only. The API normally listens at `http://localhost:3000`. Resolve a structured citation:

```bash
curl --get http://localhost:3000/api/v1/laws/resolve \
  --header "Authorization: Bearer local-development-key-2026" \
  --data-urlencode "q=DORA article 28"
```

### Resolve filters

`resolve` accepts four optional exact-value filters. The response always returns the filters that were applied in `data.filters`.

| Parameter | Values |
|---|---|
| `jurisdiction` | `EU`, `LU` |
| `documentType` | `regulation`, `directive`, `law`, `circular`, `guidance`, `other` |
| `regulatoryLevel` | `level-1`, `level-2`, `level-3` |
| `measureType` | `primary-act`, `rts`, `its`, `guideline`, `qa`, `other` |

Filters are combined with AND and applied before ranking. They only narrow records already compiled into the loaded Profile; they cannot switch or widen the Profile. They are retrieval controls, not a legal-applicability conclusion. An unsupported value returns `400 INVALID_REQUEST`; a valid combination with no match returns `200` with empty results.

For example, resolve only DORA Level 2 ITS documents:

```bash
curl --get http://localhost:3000/api/v1/laws/resolve \
  --header "Authorization: Bearer local-development-key-2026" \
  --data-urlencode "q=DORA" \
  --data-urlencode "jurisdiction=EU" \
  --data-urlencode "regulatoryLevel=level-2" \
  --data-urlencode "measureType=its"
```

Read structure or one exact Provision by stable ID:

```bash
curl --header "Authorization: Bearer local-development-key-2026" \
  http://localhost:3000/api/v1/laws/eu%3A32022R2554/structure
curl --header "Authorization: Bearer local-development-key-2026" \
  http://localhost:3000/api/v1/provisions/eu%3A32022R2554%3Aarticle%3A28
curl --header "Authorization: Bearer local-development-key-2026" \
  http://localhost:3000/api/v1/provisions/eu%3A32022R2554%3Aarticle%3A28/relationships
```

## OpenAPI and Swagger UI

- OpenAPI 3.1 JSON: `GET /api/v1/openapi.json`
- Interactive Swagger UI: `GET /api/docs`

Both documentation routes are intentionally readable without an API key so a developer can discover and generate a client before receiving data access. They contain only the public contract and locally served Swagger assets—no legal corpus payload, configured key, raw/Canonical path, SQLite detail, or client identity. Regulatory operations remain protected: select **Authorize** in Swagger UI and enter a configured Bearer API key before using **Try it out**. When no key is configured, the documentation still loads while regulatory operations return `503 SERVICE_NOT_CONFIGURED`.

The OpenAPI `info.version` equals the response `contractVersion`. Its response schemas are release-tested with AJV against representative live service outputs for discovery, resolve, structure, exact Provision, relationships, and errors. Swagger UI is pinned through `swagger-ui-dist` and does not fetch a CDN at runtime. The OpenAPI document is a compatibility artifact, not another business schema or data source; implementation DTO validation remains in the existing Public API service boundary.

## Relationship boundary

The relationship response contains `references`, `citedBy`, `mandates`, `adoptedUnder`, `supplements`, `implements`, `relatedDocuments`, and `relatedRecitals`. Every edge retains its stable relationship ID, original source/target direction, provenance, exact evidence and locator, builder method/version, and any published score. Endpoint objects contain stable legal IDs and official URLs, not Web routes.

`citedBy` is a query-perspective group; its edge still retains the original citing source and cited target. Empty groups mean only that the loaded Profile contains no published relationship of that group for this Provision. They do not establish that no legal relationship exists. The endpoint does not parse a question, infer a relationship, or dynamically read curated mappings.

## Access configuration

| Environment variable | Default | Boundary |
|---|---:|---|
| `REGULATORY_PUBLIC_API_KEYS` | none | Comma-separated unique API keys, each 16–256 printable non-whitespace ASCII characters. No configured key means regulatory operations under `/api/v1` return `503`; documentation and other Web/API routes are unaffected. |
| `REGULATORY_PUBLIC_API_RATE_LIMIT` | `60` | Requests allowed per identity and window; integer `1–100000`. |
| `REGULATORY_PUBLIC_API_RATE_WINDOW_MS` | `60000` | Fixed-window duration; integer `1000–3600000` milliseconds. |

Clients send `Authorization: Bearer <key>`. Key comparison uses fixed-length SHA-256 digests and constant-time comparison; keys and digests are not returned by health output. Multiple comma-separated keys support bounded rotation without adding account or tenant semantics.

The limiter is intentionally process-scoped. Valid keys have independent buckets; missing or invalid credentials are limited by client address. Responses include `RateLimit-Limit`, `RateLimit-Remaining`, and Unix-seconds `RateLimit-Reset`; `429` also includes `Retry-After`. A Cloud Run deployment with more than one instance does not have a global quota—distributed account quotas remain a later infrastructure slice.

For production, store the key value outside Git and the image. Cloud Run can inject a pinned Secret Manager version into `REGULATORY_PUBLIC_API_KEYS` using `gcloud run deploy ... --update-secrets REGULATORY_PUBLIC_API_KEYS=<secret>:<version>`; see the [official Cloud Run secret configuration](https://docs.cloud.google.com/run/docs/configuring/services/secrets).

## Response identity

Every regulatory operation response contains:

```json
{
  "meta": {
    "apiVersion": "v1",
    "contractVersion": "1.3.0",
    "profilePolicy": "deployment-fixed",
    "runtime": {
      "buildId": "runtime-...",
      "profileId": "full-corpus",
      "profileVersion": "1.0.0",
      "profileDisplayName": "Full Regulatory Corpus",
      "profileHash": "sha256:..."
    }
  },
  "data": {}
}
```

The HTTP response also includes `X-API-Version`, `X-API-Contract-Version`, and `X-Runtime-Build-Id` headers. `GET /api/health` exposes only aggregate Public API configuration and request/error counters; counters reset when the process restarts and contain no key identity.

## Profile policy

Each deployed service opens one precompiled Runtime artifact. Clients may omit `profileId` or pass the current deployment's exact `profileId`; another value returns `403 PROFILE_NOT_AVAILABLE`. The parameter validates deployment policy—it does not switch artifacts, widen the corpus, or create an institution-specific legal conclusion.

To serve another Edition, build and deploy that reviewed Profile as a separate artifact/service:

```bash
npm run runtime:build -- --profile banking-default
```

## Error model

Errors retain the same `meta` identity and replace `data` with a stable error object:

```json
{
  "meta": {},
  "error": {
    "code": "PROVISION_NOT_FOUND",
    "message": "Provision ... was not found in the current Profile",
    "parameter": "entityId"
  }
}
```

Current codes:

| HTTP status | Code | Meaning |
|---|---|---|
| `400` | `INVALID_REQUEST` | A required or bounded input is invalid. |
| `401` | `AUTHENTICATION_REQUIRED` | The Bearer credential is missing, malformed, or invalid. |
| `403` | `PROFILE_NOT_AVAILABLE` | The requested Profile is not served by this deployment. |
| `404` | `LAW_NOT_FOUND` | The stable Document ID is unavailable in the current Profile. |
| `404` | `PROVISION_NOT_FOUND` | The root Provision stable ID is unavailable; Body Block IDs are not accepted by Provision or relationship endpoints. |
| `429` | `RATE_LIMIT_EXCEEDED` | The current key or unauthorized client bucket exceeded its process-local window. |
| `500` | `INTERNAL_ERROR` | The adapter failed without exposing implementation details. |
| `503` | `SERVICE_NOT_CONFIGURED` | No Public API key is configured for this deployment. |

A valid resolve query with no corpus match returns `200` with `bestMatch: null` and an empty `results` array. This means “not published in the current artifact,” not “the law does not exist.”

## Compatibility boundary

- The `/api/v1` path and documented field semantics form the Public API compatibility boundary.
- Existing fields are not renamed or removed within `v1`; compatible optional fields or new endpoints may be added.
- A future breaking contract uses a new major path such as `/api/v2` and a documented migration period.
- Official text is returned only from the loaded verified artifact and is never generated, summarized, or silently corrected by the adapter.
- Responses do not expose raw XML, local filesystem paths, SQLite schema, or UI-specific Reader/Explorer payload fields.
- `GET /api/v1/openapi.json` documents this boundary and is validated against representative service payloads; `GET /api/docs` is only its interactive renderer.

Authentication and bounded single-process protection are implemented, but this is not yet an account, billing, distributed-quota, audit-log, or abuse-management system. Keep Cloud Run at one instance when relying on this limiter as the deployment quota, or add an external gateway/distributed limiter in a later operational slice. MCP remains outside this REST compatibility boundary.
