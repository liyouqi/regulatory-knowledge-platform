# Regulatory Knowledge Platform

An English regulatory knowledge reader for EU and Luxembourg law. The product keeps official legal sources, canonical data, relationships, and user-facing views separate.

## Documents

- `README.md`: setup, commands, and hands-on operational instructions. Keep this as the only runbook.
- `docs/regulatory_knowledge_platform_requirements.md`: product scope, releases, and acceptance criteria.
- `docs/regulatory_knowledge_platform_technical_architecture.md`: architectural decisions and data contracts.
- `AGENTS.md`: short, stable instructions for Codex and other coding agents.

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

From the repository root:

```bash
npm ci
npm run search:build
npm run check
npm test
npm run build
```

Use `npm ci` for a clean or new machine. Use `npm install` only when `package.json` has intentionally changed; it updates `package-lock.json`.

## Daily Development

Start the API server and web application together:

```bash
npm run dev
```

Then open `http://localhost:5173`. The Vite web app proxies `/api` calls to the Express API at `http://localhost:3000`.

Before considering a change complete, run:

```bash
npm run check
npm test
npm run build
```

| Command | When to use it |
| --- | --- |
| `npm run dev` | Develop the web app and API together. |
| `npm run check` | Run formatting, linting, and TypeScript validation. |
| `npm run check:fix` | Apply safe formatting and lint fixes. Review the diff afterwards. |
| `npm test` | Run fast unit tests. |
| `npm run build` | Verify the production web build. |
| `npm run search:build` | Atomically rebuild the local SQLite FTS5 index from validated document artifacts. |
| `npm run search:benchmark` | Run the fixed six-query relevance check and record a warm-search latency baseline with machine/runtime metadata. |
| `npm run test:e2e` | Run browser tests after they are introduced. |

## Legal Data Operations

The source pipeline resolves an EU law from its CELEX work to the English expression, the `fmx4` manifestation, and its declared legal-content stream in the Publications Office Cellar. It supports both CELEX expression aliases and the explicit language/work links used by newer Official Journal acts, and it avoids selecting legacy `.doc.xml` metadata when a manifestation exposes multiple items. After a canonical artifact is built, the Reader loads the latest validated artifact automatically. On a new machine with no DORA artifact, it falls back to a clearly labelled DORA fixture.

### List the registered laws

```bash
npm run source:list
```

The version-controlled registry is `data/source-registry.json`. It currently contains DORA, GDPR, the AI Act, MiCA, NIS2, and the Data Act.

### Download an official immutable snapshot

```bash
npm run source:fetch -- --celex 32022R2554
```

This command:

1. refuses a CELEX ID that is not in the registry;
2. downloads the official Cellar tree notice over HTTPS;
3. resolves the English Formex v4 legal-content XML or ZIP from the tree rather than guessing a file URL;
4. saves the tree notice, official Formex XML or ZIP stream, response metadata, byte counts, and SHA-256 hashes under `data/raw/eur-lex/<CELEX>/<timestamp>-<hash>/`.

`data/raw/` is intentionally ignored by Git. Each timestamped directory is an immutable source snapshot; do not edit its files.

### Verify a downloaded snapshot

Use the directory printed by `source:fetch`:

```bash
npm run source:verify -- --snapshot data/raw/eur-lex/32022R2554/<snapshot-directory>
```

Verification checks the metadata contract, byte counts, both SHA-256 hashes, and the binding between `snapshotId` and the Formex content hash. Newer package manifestations can also be checked with `unzip`; older acts such as GDPR use an official single XML stream and do not need this step:

```bash
unzip -t data/raw/eur-lex/32022R2554/<snapshot-directory>/source.fmx4.zip
```

### Build the canonical document

Use the same verified snapshot directory:

```bash
npm run canonical:build -- --snapshot data/raw/eur-lex/32022R2554/<snapshot-directory>
```

The build validates the source snapshot again, separates the ACT and any independently stored ANNEX XML files without a system `unzip` dependency, parses structural nodes and legal provisions, validates stable IDs and content hashes, then enforces the law-specific counts and text-fidelity hashes stored in `data/source-registry.json`.

The immutable result is written under `data/artifacts/canonical/<CELEX>/`. This directory is ignored by Git and can always be rebuilt. Restart `npm run dev` after the first build so the API loads the official artifact.

### Add another EU law

1. Add one entry to `data/source-registry.json`; use the official CELEX ID, English ELI URL, a unique `familyId`, and reviewed common names in `aliases`. Do not add speculative or ambiguous aliases.
2. Validate the registry and check the new row:

   ```bash
   npm run source:list
   npm test
   ```

3. Acquire and verify it:

   ```bash
   npm run source:fetch -- --celex <CELEX>
   npm run source:verify -- --snapshot data/raw/eur-lex/<CELEX>/<snapshot-directory>
   ```

4. Inspect the parser result without publishing a runtime artifact:

   ```bash
   npm run canonical:inspect -- --snapshot data/raw/eur-lex/<CELEX>/<snapshot-directory>
   ```

5. Compare the reported Article, Recital, Annex, paragraph, point, structural-node, warning, and suggested anchor-text results with the official source. Add the complete reviewed `quality` baseline to the registry.
6. Run `canonical:build`. It refuses to publish a law whose quality baseline is missing.
7. Rebuild the derived search index, then restart the development server:

   ```bash
   npm run search:build
   npm run dev
   ```

If discovery or a fidelity gate fails, stop. Do not substitute an unofficial mirror, fabricate Cellar identifiers, or weaken the baseline merely to make the build pass. The current parser is production-gated for DORA; laws with materially different Formex structures, especially annex-heavy acts, require targeted parser tests before publication.

### Refresh an existing law

Run `source:fetch` again with the same CELEX ID, verify the new directory, and run `canonical:build` against it. A new timestamped source snapshot and canonical artifact are created; previous artifacts remain available for comparison and rollback. Identical Formex content produces the same content hash and `snapshotId`, even though retrieval metadata has a later timestamp. Then run `npm run search:build` and restart the server so global full-text search opens the new read-only index.

The implemented workflow is now:

```text
official source snapshot ✓
→ Formex parser / normalizer ✓
→ canonical-data and fidelity validation ✓
→ immutable canonical artifact ✓
→ Reader API and UI ✓
→ six-law parser validation ✓
→ Universal One-page Act Explorer ✓
→ global law discovery / Find Laws ✓
→ current-document full-text ✓
→ SQLite FTS5 global search build ✓
→ relationship build
→ atomic publish or rollback
```

### Stable identity rules

- EU document: `eu:<CELEX>`, for example `eu:32022R2554`.
- Article: `eu:<CELEX>:article:<number>`.
- Nested provisions append their kind and normalized legal number.
- Repeated local numbering appends `:occurrence:<n>` only from the second occurrence.
- A source-specific version is separate: `<logical-id>@<source-version>`.

Logical IDs never contain a content hash or UI URL. Content hashes prove text integrity; they do not define the legal entity.

### Reader links and navigation

Reader URLs are stable and readable:

```text
/read/dora/articles/6
/read/dora/recitals/40
/read/dora/articles/1#paragraph-1-point-a-subpoint-iii
/read/ai-act/annexes/vii#annex-part-1
```

Refreshing or using browser Back/Forward restores the selected collection and provision. Paragraph and point markers are permalinks. The Reader's current-law field gives exact locators priority and accepts inputs such as `23`, `art 23`, `rec 40`, and `annex 2`.

The same field searches the loaded law's Article, Recital, and Annex titles and body text without another server request. Multiple unquoted terms use strict AND semantics, each term supports word-prefix matching, and quoted text is an exact normalized phrase. Results include highlighted snippets and open stable provision or paragraph anchors. For example:

```text
ICT risk manag
operational resilience
"management body"
```

The in-memory index is rebuilt deterministically from the validated `DocumentView`, carries `schemaVersion`, `documentId`, and `buildId`, and is not a second source of legal truth. Use `↑`/`↓` and `Enter` for result navigation, or `Esc` to close the result list.

### Explorer links and navigation

Each registered law has a lightweight one-page structural overview:

```text
/explore/dora
/explore/gdpr
/explore/ai-act
/explore/mica
/explore/nis2
/explore/data-act
/explore/dora#article-28
```

The Explorer API is `/api/explorer/:slug`. Its response contains document metadata, counts, and the recursive structural outline, but not legal body text. Article links open the same stable Reader provision routes, while the Reader's **Explore** action returns to the exact Article anchor. Explorer scroll position is restored within the browser session.

After `npm run dev`, manually check one legacy single-XML act and one modern package act, for example:

1. Open `http://localhost:5173/explore/dora` and select Article 28.
2. Confirm the Reader opens `/read/dora/articles/28`.
3. Select **Explore** and confirm the browser returns to `/explore/dora#article-28` with the Article visible.
4. Repeat a structural and mobile check at `http://localhost:5173/explore/ai-act`.

### Find Laws

Use `Cmd+K` on macOS or `Ctrl+K` elsewhere from either Reader or Explorer to open the global Find Laws panel. Search is live; `↑`/`↓` changes the active result, `Enter` opens its Explorer, and `Esc` closes the panel.

The deterministic server endpoint is `/api/search/laws?q=<query>`. It ranks exact legal identity ahead of lexical title matches in this order: CELEX, reviewed name/alias, structured year/number citation, exact title, title prefix, then whole-term matches. Useful checks include:

```text
DORA
DORA article 3
Digital Operational Resilience Act
32022R2554
2022/2554
Regulation (EU) 2022/2554
NIS 2
Directive 2022/2555
AI Act annex VII
```

Compound queries combine a verified law identity with `article`/`art`, `recital`/`rec`, or `annex` and a number. They open the exact stable Reader route only when that provision exists; the service does not guess missing provisions. Known aliases live only in `data/source-registry.json`. After changing them, run `npm run source:list`, `npm run check`, and `npm test`; the UI does not contain a second alias or ranking implementation.

### Global full-text search

Open the same global panel with `Cmd+K` or `Ctrl+K`, then select **Full text** or press `Tab` to switch modes. Full-text search covers the headings and legal body blocks of every loaded law. Multiple unquoted terms use strict AND and word-prefix semantics; quoted text is an exact normalized phrase. Results contain safe highlighted text segments and open stable paragraph-level Reader links.

Useful checks include:

```text
operational risk
"management body"
personal data controller
artificial intelligence system
crypto asset
data holder
```

The endpoint is `/api/search/full-text?q=<query>&limit=<1-50>`. Add `documentId=eu:<CELEX>` for exact document scope. User input is normalized into bounded parameterized FTS expressions; unsupported operator punctuation is not executed as raw FTS syntax.

The index at `data/artifacts/search/global-search.sqlite` is generated and ignored by Git. It contains a schema version, a content-derived build ID, document build IDs, stable provision records, and an FTS5 table; it is never canonical legal data. `npm run dev` and `npm start` rebuild it first, or rebuild it explicitly after adding or updating a canonical law:

```bash
npm run search:build
npm test -- src/search/full-text-search.test.ts
npm run search:benchmark
```

The builder checks that the local SQLite runtime supports FTS5, creates a temporary database, validates and optimizes it, then atomically publishes the completed file. At startup the API opens the artifact read-only, checks its schema and manifest counts, runs SQLite `integrity_check`, exercises the FTS5 query path, and reports availability plus `buildId` at `/api/health`.

The benchmark fails if any fixed query loses its expected law. Its JSON report records the Node and SQLite versions, platform, architecture, CPU, memory, corpus build ID and counts, warm-up and sample counts, first-query timings, and warm P50/P95/max latency. Treat its values as a machine-specific baseline, not as a portable guarantee.

## Current Release Status

Release 0.1 has a complete local multi-law Reader foundation:

- Node 24, npm, React/Vite, Express, TypeScript, Biome, and Vitest;
- a three-column DORA Reader and `/api/documents/:documentId` endpoint;
- a versioned Canonical Document contract with provenance, source-version IDs, structural paths, parser warnings, content hashes, and integrity validation;
- stable document/provision IDs with duplicate-number handling covered by tests;
- a validated six-law source registry and real EUR-Lex/Cellar Formex snapshot acquisition and verification;
- a DORA Formex parser producing 64 Articles, 106 Recitals, 274 Paragraph/Subparagraph records, 446 Point/Subpoint records, and 15 structural nodes with zero parser warnings;
- an AI Act Formex package parser producing 113 Articles, 180 Recitals, 13 separately stored Annexes, 581 Paragraph/Subparagraph records, 632 Point/Subpoint records, and 29 structural nodes with zero parser warnings;
- validated GDPR, MiCA, NIS2, and Data Act artifacts, bringing Release 0.1 to all six core laws and covering both legacy single-XML and modern multi-file Formex manifestations;
- hard text-fidelity hashes for selected first/last Article, Recital, and Annex anchors across all six laws, with immutable parser-versioned artifacts;
- automatic multi-law Reader loading of the latest validated official artifacts, with DORA fixture fallback only when its build does not exist;
- a recursive Adaptive TOC preserving Chapter/Section semantics and Article ranges;
- separate Articles/Recitals/Annexes collections, a law switcher, Quick Go, previous/next navigation, structural breadcrumbs, stable provision routes, and paragraph/point deep-link highlighting;
- explicit document type, publication date, source retrieval date, source version, build ID, CELEX, and official-source link in the Reader;
- desktop and 390px mobile browser smoke checks using the official DORA and AI Act artifacts;
- unit tests and a production build gate.

Release 0.2 is now in progress and additionally includes:

- a universal recursive One-page Act Explorer for all six laws;
- a separate lightweight Explorer DTO and `/api/explorer/:slug` endpoint that do not duplicate legal body text;
- stable Explorer ↔ Reader navigation, exact Article anchors, browser-history compatibility, and session scroll restoration;
- desktop DORA, MiCA structure, and 390px AI Act mobile browser smoke checks.
- a global Find Laws command panel shared by Reader and Explorer, with live server-side results and complete keyboard navigation;
- reviewed aliases in the source registry and deterministic CELEX, alias, legal citation, title-prefix, and whole-term ranking;
- verified compound locators such as `DORA article 3` and `AI Act annex VII`, resolved to stable Reader routes without returning legal body text;
- global navigation to stable Explorer routes, with desktop and 390px mobile browser checks.
- a deterministic current-document inverted index over provision headings and legal body blocks, with strict AND, phrase, prefix, snippets, highlights, and paragraph-level navigation;
- responsive current-law search integrated with Quick Go and verified against exact locators, DORA body text, phrase queries, and 390px layout.

The Release 0.2 Explorer & Basic Discovery scope is complete locally. Release 0.3 is now in progress and additionally includes:

- a rebuildable, schema-versioned SQLite FTS5 artifact derived from validated `DocumentView` records;
- content-derived index build IDs, source document build metadata, stable paragraph targets, and atomic publication;
- a read-only Search Service and `/api/search/full-text` endpoint with bounded parameterized queries;
- strict AND, prefix, exact phrase, deterministic BM25 ranking, safe highlighted snippets, and optional document scope;
- a keyboard-complete **Full text** mode in the shared global panel, verified on desktop and at 390px mobile width;
- fixed service tests and a reproducible six-query relevance and latency benchmark with complete runtime, machine, corpus, and sampling metadata.

The next Release 0.3 tasks are Definitions and Opened Laws modes. They are not represented as completed functionality yet.
