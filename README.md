# Regulatory Knowledge Platform

A project for reading and searching European financial regulation. It keeps the official text, source links and references together, and makes the same data available through REST, MCP and offline RAG exports.

[中文](README.zh-CN.md) · [Getting started](docs/getting-started.md) · [Documentation](docs/README.md) · [Corpus](docs/corpus-status.md)

## Features

- Read a law by Article or browse the whole document.
- Search law names, full text and definitions, then open the matching provision.
- Follow explicit references and reviewed RTS/ITS mappings. Metadata and similarity links are labelled separately.
- Browse national material through a directory of 32 countries.
- Use the read-only REST API, four local MCP tools or an offline RAG snapshot.

Reading and search do not require an LLM. Copilot, Monitor and Earth use separate configuration and data.

## Coverage

As of **22 October 2026**:

| Source | Documents | Language |
| --- | ---: | --- |
| EUR-Lex / CELLAR | 112 | English |
| CSSF | 3 | English |
| EBA Guidelines | 1 | English |
| Germany: GwG, WpIG, KWG, KAGB | 4 | German |
| France: AMF General Regulation | 1 | French |
| **Total** | **121** | **en / de / fr** |

The banking Profile selects 99 documents at build time. Country entries do not imply complete national-law coverage. The 12 Luxembourg core laws collected so far and the French core codes are still candidates.

[Corpus status](docs/corpus-status.md) lists published documents. The [coverage plan](docs/plans/coverage.md) lists the remaining work. Check each document's source and version date before using it.

## Run locally

Use **Node.js 24** and **npm 11+**. Legal downloads and generated data are not included in Git.

For a first installation, download DORA:

```bash
npm ci
npm run source:fetch -- --celex 32022R2554
```

Copy the snapshot directory printed by the command into the placeholder below:

```bash
npm run canonical:build -- --snapshot "PASTE_SNAPSHOT_DIRECTORY_HERE"
npm run dev
```

This loads one law. If Canonical data is already prepared, run `npm ci` and `npm run dev` directly.

Open **http://localhost:5173**. The API uses **http://localhost:3000**. If Vite prints another port, use that address.

The [startup guide](docs/getting-started.md) covers data preparation and common errors. A complete 121-document rebuild needs the verified AMF snapshot as well; `npm run dev` does not download it.

| Page | Path |
| --- | --- |
| DORA Reader | `/read/dora/articles/1` |
| Countries | `/countries` |
| Regulatory Topics | `/topics` |
| French AMF | `/read/amf-rg/articles/211-1` |
| Relationships | `/relationships` |

These pages show the documents loaded locally. Use `Cmd+K` / `Ctrl+K` to search.

## Development

Source files are downloaded and parsed before startup. Canonical data is compiled into a read-only SQLite Runtime, which serves the web app, API, MCP and exports. Publisher notes and editorial notes stay separate from legal text.

```bash
npm run check
npm test
npm run build
```

Tests rebuild Runtime and include integration checks, so the full run can take several minutes.

See the [development guide](docs/development-guide.md), [source onboarding](docs/corpus-onboarding-runbook.md), [REST API](docs/public-api-v1.md), [MCP](docs/mcp-server.md) and [RAG export](docs/rag-snapshot-export.md).

## Status and license

The project is under development. Coverage varies by country and legal family, and cross-language semantic search has not been evaluated. It is intended for reading and research; applicability still needs to be checked against official sources.

Project software uses the [MIT License](LICENSE). Legal source materials and third-party components retain their own terms. See [Contributing](CONTRIBUTING.md), [Security](SECURITY.md) and [remaining release work](docs/plans/open-source.md).
