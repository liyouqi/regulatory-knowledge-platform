# Regulatory Knowledge Platform

An English European financial regulatory knowledge platform for EU and Luxembourg law. The first usable corpus focuses on digital, ICT, cyber, and data regulation; the same canonical pipeline is intended to support banking, payments, funds, insurance, and digital-assets editions without separate codebases.

## Corpus at a glance

Open [Reader Corpus Status](docs/corpus-status.md) for the generated **Published / Queued / Planned** view. It is refreshed from the source registries by the existing `npm run corpus:update` command and is not maintained by hand.

## Documentation

Start with the [documentation index](docs/README.md) for product design, feature specifications, operating guides, integrations, generated inventories and historical records.

Common tasks:

- [Move development to another computer](docs/development-migration.md).
- [Refresh or onboard official legal sources](docs/corpus-onboarding-runbook.md).
- [Inspect documented phase status and coverage backlog](docs/coverage-backlog.md).
- [Deploy and verify a Cloud Run release](docs/cloud-run-deployment.md).
- [Read the contribution instructions](AGENTS.md).

## Development Environment

The production application is a Node.js/TypeScript project. It does not use Python or Conda in Phase 1.

| Concern | Tool / file | Purpose |
| --- | --- | --- |
| Node runtime | `.nvmrc` | Pins Node.js 24 for local development. |
| Package manager | npm | Installs and runs the project tools. |
| Dependency manifest | `package.json` | Declares direct dependencies and available commands. |
| Reproducible dependency tree | `package-lock.json` | Pins the exact installed package versions. Commit this file. |
| Optional Python utilities | separate future `tools/` utility only | Never part of the Phase 1 web runtime or canonical contract. |

If you use `nvm`, its workflow is the closest equivalent to selecting a Conda environment:

```bash
nvm install
nvm use
node --version
npm ci
```

If `nvm` is not installed, install a current Node.js 24 LTS release, confirm `node --version` starts with `v24`, then run `npm ci`.

## First Setup

For moving an existing full development environment, follow [Moving Development to Another Computer](docs/development-migration.md). It is the authoritative list of Git-managed and local-only files.

The project has two deliberately different data layers:

- Official legal source files and generated Canonical/Runtime artifacts are reproducible, potentially large, and excluded from Git under `data/raw/` and `data/artifacts/`.
- Small reviewed relationships, topics, applicability rules, authority metadata, registries, and Edition Profiles are maintained in Git under `data/official-mappings/`, `data/official-metadata/`, `data/editorial/`, and the registry JSON files.

On a new computer, clone/pull the code and run the single current-corpus maintenance command. It downloads every selected public source declared by the EUR-Lex, CSSF, and EBA registries, audits consolidated-expression candidates from the verified official CELLAR tree notices, builds Canonical documents, validates the Git-managed reviewed data against them, and builds and verifies Runtime SQLite:

```bash
npm ci
npm run corpus:update
npm run check
npm test
npm run build
npm run dev
```

Open `http://localhost:5173` after the development server starts.

`corpus:update` is the normal experimental workflow and the only maintenance entry point users need. It reports a newer effective consolidated expression as `review-required` but does not change the selected expression, registry, exact-snapshot manifest, release-pinned Runtime, or RAG export automatically. A changed selected source is parsed; count/hash differences from its reviewed baseline are written to `data/artifacts/refresh/build-report.json` instead of blocking the whole update. If a Git-managed relationship points to an endpoint that disappeared, that reviewed record is omitted from this experimental Runtime and listed in the same report. It is never silently redirected to another Article or provision. The older `corpus:refresh` command remains a compatibility alias for existing local scripts.

If `data/raw/` already contains snapshots, use `npm run corpus:update -- --skip-fetch` to rebuild from the newest local snapshot for every registered source without network acquisition. Its version audit reuses the selected snapshots' verified CELLAR tree notices and reports that it is not a fresh official check. Copying raw files from another computer is optional and only necessary when reproducing exact historical bytes. Use `npm ci` for a clean/new machine; use `npm install` only when `package.json` intentionally changed.

After an update reports source drift, review the official change and update any affected Git-managed relationship and quality baseline in a normal commit. For a release or exact reproduction of a reviewed corpus, use the manifest-pinned strict workflow:

```bash
npm run corpus:build -- --profile full-corpus
```

This strict command intentionally requires snapshots matching the IDs and SHA-256 hashes in `data/corpus-build-manifest.json`; it is not required for ordinary experimental setup.

## Daily Development

Start the API server and web application together:

```bash
npm run dev
```

Then open `http://localhost:5173`. The Vite web app proxies `/api` calls to the Express API at `http://localhost:3000`.

### Main Product Pages

Vite normally uses port `5173`; if that port is occupied, use the port printed by `npm run dev` (for example `5175`) in the same paths below.

For a first product tour, open these pages in order: **Regulatory Topics** → **Regulatory Path** → **Applicability Navigator** → **Implementation Timeline** → **Supervisory Decisions** → **Global Network**. The Reader, Explorer, and Library are the primary document-level views reached from those product surfaces.

| Product surface | Example URL | Purpose |
| --- | --- | --- |
| Regulatory Monitor | `http://localhost:5173/monitor` | Browse regulatory publications and open a monthly report; refreshed Monitor data is separate from the Reader corpus. |
| Galaxy | `http://localhost:5173/earth` | Explore the installed official metadata graph; graph coverage does not imply Reader full-text coverage. |
| EBA Q&A Library | `http://localhost:5173/qa` | Browse the complete imported Final Q&A catalogue by legal act or topic; 25 DORA records include full internal answer views. |
| Regulatory Dossiers | `http://localhost:5173/dossiers` | Open reviewed, source-backed issue files that combine exact legal provisions with official EBA answers. |
| Regulatory Topics | `http://localhost:5173/topics` | Main cross-file entry: browse reviewed subjects spanning primary law, RTS/ITS, authority guidance, and national material. |
| Topic Detail | `http://localhost:5173/topics/major-ict-incident-reporting` | Follow one reviewed Topic to exact provisions and existing evidence-bearing official mappings. |
| Regulatory Path | `http://localhost:5173/domains/banking-governance-internal-control` | Follow the reviewed CRD → EBA → CSSF path with explicit direction and exact relationship evidence. |
| Applicability Navigator | `http://localhost:5173/applicability/dora` | Review DORA Article 2 scope evidence for a credit institution, retain all loaded qualifications, then continue to related RTS/ITS mappings. |
| Implementation Timeline | `http://localhost:5173/timelines/ai-act` | Review AI Act publication, entry-into-force, and phased-application milestones with exact Article 113 evidence. |
| Supervisory Decisions | `http://localhost:5173/decisions/gdpr` | Review provision-level CNPD findings with the exact official operative text and source PDF. |
| Global Network | `http://localhost:5173/relationships` | View loaded regulations in one connected space; optionally reveal CJEU cases and external CELLAR Works. |
| Reader | `http://localhost:5173/read/dora/articles/1` | Read an exact provision with stable navigation and relationship context. |
| EBA Guideline | `http://localhost:5173/read/eba-gl-2021-05/provisions/5` | Read the EBA internal-governance subject-matter paragraph and its reviewed CRD relationship. |
| Act Explorer | `http://localhost:5173/explore/dora` | Browse the complete structure of one legal act. |
| RTS/ITS Library | `http://localhost:5173/library/dora` | Browse a regulatory family's reviewed Level 2 measures; append `/rts` or `/its` to filter. |
| Document Graph | `http://localhost:5173/relationships/gdpr` | Explore Act-level relationships, including the reviewed GDPR CJEU Case nodes. |
| Article Graph | `http://localhost:5173/relationships/dora/articles/20` | Explore relationships scoped to one exact provision. |

Press `Cmd+K` on macOS or `Ctrl+K` elsewhere from any product page to open global law, full-text, definition, and opened-law search.

Use the **Light/Dark** control in the top bar to switch the shared Reader, Explorer, and Level 2 Library chrome. Dark is the default; the browser stores the selected theme locally, without storing legal text or changing the runtime artifact.

Before considering a change complete, run:

```bash
npm run check
npm test
npm run build
```

## Reference and Integrations

- [Reader and legal data reference](docs/reader-and-data-reference.md): full command list, navigation, search, source diagnostics and relationship operations.
- [Public API v1](docs/public-api-v1.md): endpoint contracts, local configuration, authentication and usage boundaries.
- [Local MCP server](docs/mcp-server.md): client configuration, deterministic tools and executable examples.
- [Platform → RAG snapshot](docs/rag-snapshot-export.md): offline export and receiver contract.

## Deployment and Status

Follow the numbered [Google Cloud Run deployment runbook](docs/cloud-run-deployment.md) for configuration, release verification, immutable image publication and rollback.

The [coverage backlog](docs/coverage-backlog.md) records documented phase completion and remaining work. [Reader corpus status](docs/corpus-status.md) is generated from the source registries. [Reader release history](docs/history/reader-releases.md) preserves earlier implementation checkpoints; it does not establish the currently deployed revision.
