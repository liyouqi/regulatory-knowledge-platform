# Public API v1

The Phase 4 Public API is a versioned delivery adapter over the same read-only Runtime and services used by the Web product. It does not read raw source files, Canonical JSON, curated mappings, or SQLite tables directly.

## Current scope

The first `v1` slice provides three bounded capabilities:

| Capability | Endpoint | Result boundary |
|---|---|---|
| Resolve law | `GET /api/v1/laws/resolve?q=<query>` | Up to 10 matching laws and, when supplied in the query, one exact Provision stable ID. |
| Law structure | `GET /api/v1/laws/:documentId/structure` | Document source/version identity and table-of-contents structure without legal body text. |
| Get Provision | `GET /api/v1/provisions/:entityId` | One exact root Provision, its official-text block tree, source locators, and source/version identity. |

`GET /api/v1` returns capability discovery. Relationships, Topics, timelines, decisions, applicability, regulatory paths, authentication, rate limiting, MCP, and SDK examples remain later Phase 4 slices. Existing `/api/*` endpoints are internal Web transports and do not inherit the Public API compatibility commitment.

## Start locally

```bash
npm run dev
```

The API normally listens at `http://localhost:3000`. Resolve a structured citation:

```bash
curl --get http://localhost:3000/api/v1/laws/resolve \
  --data-urlencode "q=DORA article 28"
```

Read structure or one exact Provision by stable ID:

```bash
curl http://localhost:3000/api/v1/laws/eu%3A32022R2554/structure
curl http://localhost:3000/api/v1/provisions/eu%3A32022R2554%3Aarticle%3A28
```

## Response identity

Every response contains:

```json
{
  "meta": {
    "apiVersion": "v1",
    "contractVersion": "1.0.0",
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

The HTTP response also includes `X-API-Version`, `X-API-Contract-Version`, and `X-Runtime-Build-Id` headers.

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
| `403` | `PROFILE_NOT_AVAILABLE` | The requested Profile is not served by this deployment. |
| `404` | `LAW_NOT_FOUND` | The stable Document ID is unavailable in the current Profile. |
| `404` | `PROVISION_NOT_FOUND` | The root Provision stable ID is unavailable; Body Block IDs are not accepted by this endpoint. |
| `500` | `INTERNAL_ERROR` | The adapter failed without exposing implementation details. |

A valid resolve query with no corpus match returns `200` with `bestMatch: null` and an empty `results` array. This means “not published in the current artifact,” not “the law does not exist.”

## Compatibility boundary

- The `/api/v1` path and documented field semantics form the Public API compatibility boundary.
- Existing fields are not renamed or removed within `v1`; compatible optional fields or new endpoints may be added.
- A future breaking contract uses a new major path such as `/api/v2` and a documented migration period.
- Official text is returned only from the loaded verified artifact and is never generated, summarized, or silently corrected by the adapter.
- Responses do not expose raw XML, local filesystem paths, SQLite schema, or UI-specific Reader/Explorer payload fields.

Authentication and rate limiting are not enabled in this first local/controlled slice. Do not expose the service as an unrestricted production developer API until those Phase 4 controls and operational monitoring are configured.
