# Getting started

[Project overview](../README.md) · [中文首页](../README.zh-CN.md) · [Documentation index](README.md)

The application builds a read-only Runtime from local Canonical legal data. Git contains the application and reviewed configuration; it does not contain raw downloads, Canonical output, Runtime SQLite, or local credentials.

## Requirements

- Node.js 24, as pinned by `.nvmrc`, and npm 11 or newer.
- A supported native build environment if `better-sqlite3` or `sharp` cannot use a prebuilt binary on your platform.
- Network access to official publishers for first-time source acquisition.

From the repository root, install dependencies:

```bash
nvm install
nvm use
npm ci
```

If you do not use nvm, install Node.js 24 directly, then run `npm ci`. Reading and search do not need Python or an LLM provider.

## First-time data preparation

Start by loading **DORA**. The remaining documents can be prepared later.

```bash
npm run source:fetch -- --celex 32022R2554
```

The command prints `Saved immutable source snapshot:` followed by a directory. Copy that exact path into the next command, replacing the quoted placeholder:

```bash
npm run canonical:build -- --snapshot "PASTE_SNAPSHOT_DIRECTORY_HERE"
npm run dev
```

Do not add `--allow-drift` to work around a failed quality check. If the publisher is unavailable or source bytes no longer pass the reviewed baseline, retain the error and consult the [onboarding runbook](corpus-onboarding-runbook.md).

After both servers are ready, open **http://localhost:5173/read/dora/articles/1**. Vite prints the actual web port if 5173 is occupied; the default API health endpoint is **http://localhost:3000/api/health**.

`npm run dev` rebuilds Runtime from local Canonical data. With only DORA loaded, it reports and omits reviewed inputs for absent laws. Pages that need other laws or optional datasets may be empty or unavailable. `/api/health` shows how many documents are loaded locally.

Starting without legal data currently fails with `Benchmark Article is not loaded: eu:32022R2554:article:5`. Download and build DORA using the steps above before running the app.

## Existing installation

If validated Canonical artifacts already exist under `data/artifacts/canonical/`:

```bash
npm ci
npm run dev
```

This is the normal daily workflow. It rebuilds Runtime but does not redownload source files. An installation with all reviewed data can show 121 documents; the banking Profile selects 99 from those prepared inputs.

## Prepare the full corpus

Two workflows serve different purposes:

| Workflow | Inputs and result |
| --- | --- |
| Current-source refresh | `npm run corpus:update` fetches selected EUR-Lex/CSSF/EBA/German sources, retains verified AMF snapshots, builds Canonical data, and reports source drift or invalid reviewed endpoints in experimental Runtime. |
| Exact reviewed reproduction | `npm run corpus:build -- --profile full-corpus` requires every snapshot ID/checksum in `data/corpus-build-manifest.json`; it builds an isolated verified Runtime and report. Fresh current downloads are not automatically the pinned historical snapshots. |

**The full rebuild needs a verified AMF snapshot.** French AMF data uses a separately imported official HTML capture. `corpus:update` does not download it, so a clean checkout cannot complete this rebuild without the snapshot. See the [AMF source review](reviews/amf-20261021.md) and [release preparation](plans/open-source.md).

If all required raw snapshots, including AMF, are already available, `npm run corpus:update -- --skip-fetch` rebuilds from local sources. Existing Canonical data is sufficient for normal UI work without copying raw downloads. For continuing an existing trusted development installation, follow the [migration guide](development-migration.md); do not publicly share `.env` files or unreviewed source archives.

A complete source bundle has not been published. The strict archive check also remains pending until remote snapshot locations are recorded and reviewed.

## Check an installation

```bash
npm run check
npm test
npm run build
npm run runtime:verify
```

The full suite and strict verification need the full dataset. `npm test` rebuilds Runtime and includes integration tests, so it can take several minutes. With only DORA installed, complete-corpus checks will not pass; prepare the missing data before running them.

Public REST data operations require API keys; web reading does not. See [API authentication](public-api-v1.md) and [MCP setup](mcp-server.md). Optional features have separate guides: [Copilot](copilot/contextual-regulatory-copilot.md), [Monitor](monitor/regulatory-monitor.md), and [Earth](earth/earth.md).

## Common setup problems

| Symptom | Check |
| --- | --- |
| Fixture benchmark Article is missing | Prepare official DORA data using the first-time steps above. |
| Missing AMF snapshot during refresh | Provide the reviewed AMF input through its existing verification/import workflow; a maintenance HTML page is not legal text. |
| Web page loads but API requests fail | Wait for the API startup line, check `/api/health`, and verify `REGULATORY_API_ORIGIN` if using a non-default API port. |
| Full corpus counts differ | Check the loaded Canonical artifacts and build-time Profile. A registry entry or country link alone does not create local legal text. |
| Publisher returns 403/429 or changed bytes | Preserve the failure and follow source-specific review; do not replace it with an invented or unverified text. |

## Tested setup

Tested on macOS with Node.js 24.11 and npm 11.6 on 22 October 2026, using `f985434` without local environment or legal data. Downloading and building official DORA allowed `npm run dev` to start; API and Reader checks passed. Installed dependencies were reused, so a fresh dependency install and other operating systems have not been tested.
