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
npm run runtime:build
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
| `npm run runtime:build` | Atomically rebuild the read-only runtime SQLite from validated Canonical artifacts. |
| `npm run search:benchmark` | Run the fixed six-query relevance check and record a warm-search latency baseline with machine/runtime metadata. |
| `npm run test:e2e` | Run browser tests after they are introduced. |

## Legal Data Operations

The source pipeline resolves an EU law from its CELEX work to the English expression, the `fmx4` manifestation, and its declared legal-content stream in the Publications Office Cellar. It supports both CELEX expression aliases and the explicit language/work links used by newer Official Journal acts, and it avoids selecting legacy `.doc.xml` metadata when a manifestation exposes multiple items. After a canonical artifact is built, the Reader loads the latest validated artifact automatically. On a new machine with no DORA artifact, it falls back to a clearly labelled DORA fixture.

### List the registered laws

```bash
npm run source:list
```

The version-controlled registry is `data/source-registry.json`. It currently contains six Level 1 acts, three DORA RTS measures, and one MiCA RTS measure. Documents in the same regulatory family intentionally share a `familyId`; `regulatoryLevel` and `measureType` distinguish primary acts, RTS, ITS, and future Level 3 material.

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

1. Add one entry to `data/source-registry.json`; use the official CELEX ID, English ELI URL, the appropriate shared `familyId`, explicit `regulatoryLevel` / `measureType`, and reviewed common names in `aliases`. CELEX and aliases must be unique; family IDs are intentionally reusable. Do not add speculative or ambiguous aliases.
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
7. Rebuild the derived runtime database, then restart the development server:

   ```bash
   npm run runtime:build
   npm run dev
   ```

If discovery or a fidelity gate fails, stop. Do not substitute an unofficial mirror, fabricate Cellar identifiers, or weaken the baseline merely to make the build pass. Acts with materially different Formex structures require a targeted parser fixture before publication. Parser `1.3.0` covers both division-wrapped acts and newer acts whose Articles are direct `ENACTING.TERMS` children.

### Add or update an official Level 2 mapping

1. Ingest the RTS or ITS as a normal official document using the steps above. Give it the same `familyId` as its Level 1 act, `regulatoryLevel: "level-2"`, and the correct `measureType`.
2. Verify the adopted act and its exact legal basis in EUR-Lex. Do not map a draft technical standard as an adopted act.
3. Add one record per mandate Article to `data/official-mappings/level2.json`. Preserve the Level 1 Article/entity IDs, an exact mandate excerpt, the Level 2 CELEX/official title/document number, the adoption-basis wording, both official URLs, and `OFFICIAL_MAPPING` provenance.
4. Rebuild and run the dedicated gates:

   ```bash
   npm run runtime:build
   npx vitest run src/relationships/official-mapping.test.ts
   npm run check
   npm test
   npm run build
   ```

The builder rejects missing documents, invalid Article endpoints, an official-title mismatch, or mandate evidence that is not present in the loaded official Article. It emits `Article → MANDATES → RTS/ITS` and `RTS/ITS → ADOPTED_UNDER → Article` into the same relationship table. The UI and API never read the curated JSON directly.

### Refresh an existing law

Run `source:fetch` again with the same CELEX ID, verify the new directory, and run `canonical:build` against it. A new timestamped source snapshot and canonical artifact are created; previous artifacts remain available for comparison and rollback. Identical Formex content produces the same content hash and `snapshotId`, even though retrieval metadata has a later timestamp. Then run `npm run runtime:build` and restart the server so the API opens the new read-only runtime artifact.

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
→ explicit relationship build ✓
→ official Level 2 mapping build ✓
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

### Opened Laws

Select **Opened laws** in the same panel, or press `Tab` once from **Find laws**, to reopen recent regulations immediately. This is deliberately a local convenience, not regulatory data: the browser stores a versioned list of at most ten stable document IDs, their most recently visited Reader/Explorer path, and a timestamp in `localStorage`. It stores no legal text, requires no account, does not write to SQLite, and can be cleared from the panel.

The current document catalog hydrates those IDs at display time, so a law no longer shipped in the local corpus is simply not shown. Opening a law again moves it to the top and preserves its most recent deep link. The input filters the local list; `↑`/`↓` and `Enter` work exactly as in the other command-palette modes.

### Definitions

Open the global panel and select **Definitions**, or press `Tab` once from **Find laws**. Search supports exact normalized terms, term prefixes, and quoted term phrases. Results show the official definition text, EU/LU jurisdiction, source law, Article and point, CELEX ID, and a stable link to the defining point. The same term can appear once per source law, so cross-regulation differences remain visible.

Useful checks include:

```text
controller
personal data
"AI system"
digital operational resilience
network and information system
crypto asset
data holder
```

The endpoint is `/api/search/definitions?q=<term>&limit=<1-50>`. Definitions are derived during `npm run runtime:build`; the browser never parses legal prose into definitions. The current strict rule only accepts point records inside an Article titled `Definitions` whose official text starts with `<term> means`. On the current six-law corpus this produces 294/294 structurally matching definition points and avoids treating ordinary uses of “means” as definitions.

When a definition explicitly says `as defined in`, it is stored as `incorporated`; otherwise it is `direct`. Exact direct definitions rank before incorporated references, while every result retains its own official source text and point link. For example, `personal data` returns the direct GDPR definition first, followed by incorporated MiCA, Data Act, and AI Act definitions.

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

The artifact at `data/artifacts/runtime/regulatory.sqlite` is generated and ignored by Git. It contains a schema version, a content-derived build ID, Canonical document build IDs, materialized Reader and Explorer payloads, reviewed aliases, stable search, definition, entity, and relationship records, and separate FTS5 tables. It is never canonical legal data. `npm run dev`, `npm start`, and `npm test` rebuild it first, or rebuild it explicitly after adding or updating a Canonical law:

```bash
npm run runtime:build
npm test -- src/search/full-text-search.test.ts
npm test -- src/relationships/explicit-reference.test.ts
npm run search:benchmark
```

The builder checks that the local SQLite runtime supports FTS5, creates a temporary database, validates and optimizes it, then atomically publishes the completed file. At startup the API opens this artifact read-only and fails fast if its schema or manifest is incompatible. `/api/health` reports its `buildId` and corpus counts.

The website never reads Canonical JSON, `data/source-registry.json`, or curated mappings at runtime. `documents` holds queryable family/level/measure/source metadata, `document_views` holds schema-validated Reader and Explorer JSON read models, and `document_aliases` holds reviewed aliases. `legal_entities` provides the stable JOIN boundary for documents, provisions, and body blocks; `relationships` stores provenance-aware edges. Search, Definitions, and Relationships reuse the same artifact. Eight-document parity tests require every SQLite Reader/Explorer payload to equal its Canonical-derived DTO exactly. This deliberately avoids reconstructing recursive legal trees with many joins while keeping one runtime data source.

The benchmark fails if any fixed full-text or definition query loses its expected law. Its JSON report records the Node and SQLite versions, platform, architecture, CPU, memory, corpus build ID and counts, warm-up and sample counts, first-query timings, and warm P50/P95/max full-text latency. Treat its values as a machine-specific baseline, not as a portable guarantee.

### References and Cited By

The Reader relationship panel shows deterministic references derived at build time from official legal text. **References** opens an internal Article, Annex, or loaded law; **Cited by** is the reverse query over the same stored edge, not a duplicated or separately parsed relation. Each result retains the exact matched citation, source entity, official source URL, provenance (`LEGAL_TEXT`), resolver method/version, and a stable target ID. The same panel appears below the legal text on tablet and mobile.

The runtime endpoint is `/api/relationships/:documentId/:provisionId`. Its response keeps `references`, `citedBy`, `mandates`, `adoptedUnder`, `supplements`, `relatedDocuments`, and `relatedRecitals` separate, plus the runtime build ID. The current `explicit-reference@1.0.0` resolver conservatively publishes singular Article/Annex references within a loaded law, modern typed EU Regulation/Directive citations, and compound cross-law Article citations when the target exists in the loaded corpus. Unresolved, ambiguous, plural/range, shorthand, and unloaded external targets remain ordinary official text; they are counted in the build manifest but are not guessed into links.

In the Reader, an inline citation becomes clickable only when the builder supplied an exact `sourceEntityId` plus a validated character range whose stored evidence text still matches the rendered official text. The browser never re-parses legal prose with regex. Clicking opens Side Peek without changing the Reader URL; it requests `/api/relationship-previews/:entityId` only then, derives a short target excerpt from the existing read-only Reader payload, and provides explicit **Open full** and official-source actions. Closing Side Peek leaves the reading position untouched.

`npm run runtime:build` currently publishes 1,967 resolved explicit-reference edges plus 6 directed official-mapping edges from 3 reviewed mandate records, and reports 863 unmaterialized references across eight immutable documents. These are corpus-specific audit counts, not permanent product constants. Builder versions and the curated mapping content participate in the runtime build ID, so changing resolver semantics or evidence invalidates the artifact deterministically.

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

The Release 0.2 Explorer & Basic Discovery scope is complete locally. Release 0.3 additionally includes:

- a rebuildable, schema-versioned SQLite FTS5 artifact derived from validated `DocumentView` records;
- content-derived index build IDs, source document build metadata, stable paragraph targets, and atomic publication;
- a read-only Search Service and `/api/search/full-text` endpoint with bounded parameterized queries;
- strict AND, prefix, exact phrase, deterministic BM25 ranking, safe highlighted snippets, and optional document scope;
- a keyboard-complete **Full text** mode in the shared global panel, verified on desktop and at 390px mobile width;
- fixed service tests and a reproducible six-query relevance and latency benchmark with complete runtime, machine, corpus, and sampling metadata.
- 294 first-class definition records across all six laws, extracted only from structurally verified `Definitions` provisions;
- exact, normalized, prefix, and quoted phrase definition lookup with direct definitions ranked ahead of explicit incorporated references;
- a traceable `/api/search/definitions` contract and a keyboard-complete **Definitions** mode verified across GDPR/MiCA/Data Act/AI Act sources and at 390px mobile width;
- a fixed six-query definition evaluation set included in `npm run search:benchmark`.
- a keyboard-complete **Opened laws** mode: a versioned, bounded local-only history of stable document IDs and last Reader/Explorer paths, with clear-history control and no duplication of legal data into browser storage.

Release 0.3 is complete locally. The next planned scope is Release 0.4: structured cross-document relationships, starting only with official, traceable references.

Release 0.4 is now in progress and additionally includes:

- a versioned explicit-reference builder over stable document/provision/body-block entities;
- internal Article/Annex and resolved cross-law Regulation/Directive targets, with conservative unresolved-reference handling;
- a normalized SQLite `legal_entities` + `relationships` model with evidence, provenance, builder lineage, indexes, and integrity checks;
- reverse `CITED_BY` lookup derived from stored `REFERENCES` edges;
- a schema-validated relationship API and responsive Reader relationship panel;
- browser verification of DORA Article 1 → NIS2 Article 3 navigation, the reverse Cited By view, and AI Act Article 11 → Annex IV on a 390px viewport;
- evidence-span-only inline citations and an on-demand, URL-preserving Side Peek with an official target excerpt.

The explicit-reference portion of Release 0.4 is complete locally.

Release 0.5 is now in progress and additionally includes:

- full official ingestion, Reader, Explorer, and search coverage for DORA Delegated Regulation (EU) 2024/1774 and MiCA Delegated Regulation (EU) 2025/305;
- full official ingestion and reviewed Article 28(10) mapping for DORA Delegated Regulation (EU) 2024/1773 (ICT third-party contractual-policy RTS);
- full official ingestion and reviewed Article 18 mapping for DORA Delegated Regulation (EU) 2024/1772 (incident classification and materiality-threshold RTS);
- version-controlled, schema-validated DORA/MiCA mapping evidence;
- `official-mapping@1.0.0` paired `MANDATES` / `ADOPTED_UNDER` edges in the unified SQLite relationship store;
- separate relationship API groups and responsive Reader presentation with official-evidence links;
- direct-Article Formex support with a parser fixture and parser version `1.3.0`;
- desktop and 390px browser verification of DORA Article 15, reverse RTS legal bases, and exact MiCA RTS search.

The family-level RTS/ITS library and Level 1 summary counts are now implemented from the runtime SQLite data: `/library/dora`, `/library/mica`, and their `/rts` or `/its` filters list official measures, mandate Articles, Reader/Explorer links, and official sources without duplicating the curated mapping input. The next Release 0.5 slice is additional reviewed DORA/MiCA measures. TF-IDF Related Recitals remains optional and disabled until its benchmark passes.
