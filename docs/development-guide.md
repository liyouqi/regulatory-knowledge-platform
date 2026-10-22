# Development

Use Node.js 24 (`.nvmrc`) and npm 11+. For the first installation, follow [Getting started](getting-started.md). Python is only needed for optional source-audit scripts.

Run commands from the repository root.

## Daily work

```bash
npm ci
npm run dev
```

The predev hook builds Runtime from local Canonical data. Vite uses port 5173 and proxies `/api` to port 3000. Check the printed URL if a port is occupied. For a different API address, set `REGULATORY_API_ORIGIN` as well as the server's `PORT`.

```bash
npm run check
npm test
npm run build
```

The full suite includes corpus integration tests and can take several minutes. Parser, relationship and search changes also need their dedicated fixtures or evaluations. Review requirements are in [AGENTS.md](../AGENTS.md).

## Commands

| Command | Use |
| --- | --- |
| `npm run runtime:build` | Build Runtime with strict reviewed-input validation |
| `npm run runtime:build -- --review-mode report` | Build for local development, reporting reviewed inputs that no longer resolve |
| `npm run runtime:verify` | Check SQLite integrity, manifests, Reader and search |
| `npm run corpus:update` | Refresh selected sources and rebuild; requires an existing verified AMF snapshot |
| `npm run corpus:update -- --skip-fetch` | Rebuild from the required local snapshots |
| `npm run corpus:build -- --profile full-corpus` | Reproduce the exact manifest-pinned corpus in an isolated output |
| `npm run release:verify` | Check source snapshots, Canonical and Runtime together |
| `npm run search:benchmark` | Run fixed search cases |
| `npm run citation:benchmark` | Run citation retrieval cases |
| `npm run relationships:benchmark` | Run Related Recitals cases |
| `npm run performance:benchmark` | Build and measure local Reader/API performance |
| `npm run data:status` | Inspect local data sizes |
| `npm run data:cleanup` | Preview cleanup; `--apply` executes it |

Source-specific commands and quality checks are in the [onboarding runbook](corpus-onboarding-runbook.md). Data cleanup and transfer details are in the [migration guide](development-migration.md).

## Profiles

`full-corpus` is the default. A Profile selects documents when Runtime is built; a request cannot switch it.

```bash
REGULATORY_EDITION_PROFILE=banking-default npm run dev
```

The resulting local service uses the banking Profile. Changing an environment variable on an already running production container does not rebuild its bundled Runtime.

## Integrations

- [REST API](public-api-v1.md): authentication, OpenAPI, endpoints and filters.
- [MCP](mcp-server.md): local tools and client configuration. Use npm's `--silent` flag when stdout carries the MCP protocol.
- [RAG export](rag-snapshot-export.md): export/verify commands and the snapshot contract.
- [Citation context](citation-context.md): internal exact-text retrieval.
- [Cloud Run](cloud-run-deployment.md) and [Runtime operations](runtime-operation-runbook.md): release, verification and rollback.

Keep `.env`, raw downloads and generated artifacts out of Git. A trusted move to another computer follows the migration guide; public source distribution is tracked in the [release plan](plans/open-source.md).

## Record README demos

With the full corpus running locally, Google Chrome installed, and `ffmpeg` on your PATH:

```bash
node scripts/record-readme-demos.mjs
```

The script records real page interactions and replaces the three GIFs in `docs/media/` after all scenes pass. Frames, MP4 originals and a capture report stay under ignored `data/artifacts/readme-demos/`. Set `README_DEMO_BASE_URL` for a different local address; `README_DEMO_BROWSER_CHANNEL` defaults to `chrome`.
