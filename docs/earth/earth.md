# Official EU Regulatory Galaxy — v0.4

> Status: approved product and implementation requirements
> Scope: an official-source, exploratory regulation graph for a bounded EU regulatory universe
> This document is intentionally independent of the existing Platform Runtime data path.

The user-facing product name is **Galaxy**. Existing `/earth` routes, APIs,
stable IDs, source directories and implementation names remain unchanged to
preserve compatibility; they are internal boundaries, not displayed branding.

## Current direction and installed collection — 2026-09-27

This section supersedes the older Banking-10-first expansion restriction, SQLite-only presentation and two-color-only display policy below. Galaxy is a simple relationship-first visualization, not a legal reference or applicability engine. The target is 100% of a declared English financial-document scope, not an arbitrary 100-law cap. `/earth` now opens the metadata graph; the separate, existing 10-law Article explorer remains available at `/earth?view=reading` (806 audited Articles and 7,016 reading blocks). Full-text acquisition is not a prerequisite for adding graph nodes.

### Simple filters and colors

- `Sector` offers Banking, Insurance, Securities, Funds, Payments and Crypto. `Regs` selects a regulatory family. The two filters intersect; a Work may have several sectors. Search accepts an English title, display label or CELEX and offers direct focus buttons.
- Filters grey nonmatching included nodes and their relationships without recreating the WebGL canvas. Family selection also reveals tagged boundary files; selecting a node reveals its supported one-hop neighbourhood. Reset restores the loaded overview. Structured view uses the same tags and greying, with paginated cards.
- Each family has a main color, with small shade differences for related files. Untagged Works remain in context, grey under an active filter; no family is guessed from a title or an amendment edge.
- `data/earth/display-tags.json` is the one small editorial configuration for sectors, families, palette and CELEX assignments. Tags support exploration, not applicability. Cross-sector laws are included as context for each sector; inclusion does not assert that every provision applies to every entity in that sector. Families are currently editorial assignments, not official metadata claims.
- Twelve institutions are installed as stellar anchors, including EBA, ESMA and ECB. Institution identity is the exact official authority URI; English names come from official `skos:prefLabel`. Edges retain `work_created_by_agent`, displayed as **Created by · metadata**, not relabelled as supervision, drafting or adoption. EIOPA and national authorities are not present in this source result; no placeholder institution or inferred role is added.
- The overview shows key relationship bundles, including named-anchor citations and creator links, not every citation at once. Clicking a node smoothly focuses the camera at the full graph's spatial scale and displays all its supported citations and creator links. The data is complete within the configured extraction rules even when the visual overview is selective. Family colors are editorial; related families are propagated only along supported `based_on` / `completes` edges, never from citations or amendment edges.
- Family focus includes already tagged companion files even when their collection membership is `boundary`. Small family satellites prefer an existing official legal-basis/completion parent for display placement; coordinates add no edges or legal hierarchy. Focused/filtered family labels become candidates for zoom-dependent collision-aware placement, with short `RTS / ITS / Delegated / Implementing · year/number` labels. RTS/ITS abbreviations require those terms in the official title; they are not assumed from every delegated/implementing act. Official titles, identities, predicates and collection membership stay unchanged.
- The family inspector and Structured view include visible related family files, and filter counts include these visible boundary Works. In the installed snapshot, DORA focus exposes 14 family files: the two primary labelled files and 12 companions (eight title-labelled RTS, two ITS and two other delegated acts). This is installed family visibility, not a completeness claim. No re-acquisition was needed for this display correction.

Family-visibility correction check: local Chrome showed all eight RTS and both ITS labels after DORA focus; selecting a companion reused the same canvas, the DORA filter produced 14 matching Structured cards, and the 390px layout had no horizontal overflow. Camera buttons sit outside the open inspector on desktop and above it on narrow screens. `npm run check` and build passed; the ordinary suite reports 328 passed and the unchanged 28-vs-98 raw-snapshot assertion failure. One focused satellite-placement assertion was added to the existing layout tests; graph acquisition, membership, identities and relationship semantics were not changed.

### Repeatable data flow

Keep one Node application; no graph server, queue, model calls or new service is needed. A small read-only metadata JSON sits alongside the existing Earth Article SQLite artifact; neither replaces nor consumes Platform Runtime data.

```sh
# One command: census -> official family closure -> graph -> inventories/reports.
# No model calls and no full-text download.
npm run earth:refresh

# After an acquisition failure, use the printed NEW snapshot path.
# Replays frozen inputs and validated cached pages; no new census.
npm run earth:refresh -- --resume data/raw/earth/graph/<snapshot-directory>
```

`data/earth/source-scope.json` currently lists the official insurance (`06.20.20.10`), banking (`06.20.20.20`) and securities-market (`06.20.20.25`) directories. The discovery query uses CELEX sector 3, English Expressions, and does not exclude historical acts. It paginates to exhaustion, saves raw queries/results under ignored `data/raw/earth/census/`, and writes completed candidates to ignored `data/artifacts/earth/census.json`. A failed run retains its raw pages and does not publish a completed replacement. Rerunning starts a new discovery snapshot; this first command is a full refresh, not incremental or resumable.

`earth:refresh` orchestrates the existing census, graph and inventory stages. The graph stage resolves every configured CELEX root to an official Work URI, scans the directory collection, then repeatedly scans unvisited family Works until no family frontier remains. Family reachability uses only raw-direction `based_on` / `completes`; citation-only neighbours are never recursively expanded. Each family Work is scanned for genuine incoming and outgoing metadata relations, retaining its immediate references too. No transitive legal edge is manufactured. Multiple inferred families are retained; explicit configuration wins. Future members of configured families need no individual config or model calls. A new family needs one evidenced root/palette entry, not individual RTS/ITS entries.

Each raw run freezes the exact census and editorial/source configuration in `inputs.json`, records content hashes, and retains a pre-run graph baseline. Work URI/CELEX conflicts stop publication. Cached queries/results are byte-checked on resume; incomplete pages are fetched again. Identity traversal does not require English: an unpublished intermediary can still lead to English descendants. Only English titled Works enter the graph; absent English expressions and absent titles are reported as a combined unavailable-English-title exclusion. Sector inheritance follows each Work's exact raw legal-basis/completion paths, never a family-wide union of sibling-root sectors. The final empty frontier and acquisition interval are recorded in an atomic completion manifest before publishing ignored `graph.json`. A failed acquisition preserves the installed graph. `/api/earth/graph` still reads only the local artifact.

`--resume` reconstructs closure from frozen inputs and cached pages, preserving the original baseline for change reporting. It rejects changed configuration/query-policy versions and legacy snapshots without frozen inputs; start one fresh run for the new format. Resume is not a current-source refresh or incremental monitoring. A fresh `earth:refresh` rediscovers the scope and queries current metadata. There is no scheduler, queue or LLM.

Generated outputs: `earth-inventory.md` lists directory/seed files; [earth-families.md](earth-families.md) lists configured family counts, related family files, unclassified standards and multi-family assignments. Ignored `family-coverage.json` and `refresh-report.json` record exclusions, acquisition status and added/removed file/relationship and family-assignment changes. This is closure under recorded metadata predicates and configured roots over a live acquisition interval, **not proof of complete European financial law**. Unclassified context is not necessarily a data defect; unknown membership is not guessed.

Automation verification: a fresh official acquisition and subsequent `earth:refresh -- --resume` completed. Disabling network access still rebuilt the same snapshot from cached queries. Changed configuration, corrupt cache and incomplete-page/network-failure checks left the installed graph unchanged. All published identities, endpoints and edge hashes matched exact raw-direction triples; the DORA pair retained its two citation edges. Required read-only relationship review approved the path-specific inheritance. Four focused closure/identity regressions were added; the dedicated relation/layout checks pass (11 total). `npm run check` and production build pass. The ordinary suite has 332 passed and one unchanged release snapshot-count failure (28 expected, 98 found); its gate was not weakened. Local Chrome on port 3000 checked DORA, MiCA, CRR/CRD and Solvency family counts, canvas reuse, Structured view and 390px overflow, without page errors.

Directory coverage is **not all European financial law**. Dedicated EBA/ESMA/EIOPA publications, national sources and wider directory coverage remain pending. The installed base uses CELEX sector 3; case law, consolidated Expressions, treaties and preparatory documents are not expanded as graph files. One-hop files outside the configured collection are context, not an assertion of full family coverage. Official directory tags can be reused; a securities-market category is not automatically relabelled Funds. Institutions are not expected to exhaust every regulator merely because creator metadata was fetched.

### Installed snapshot and relationship boundary

The recursive-family refresh contains **1,129 included Works, 1,757 related English Works, 12 institutions and 11,822 supported metadata edges**, in **4,746,172 bytes**. Acquisition snapshot: `data/raw/earth/graph/2026-09-27T15-02-44-889Z/`. Compared with the initial directory-based graph, it adds 34 related files, two institutions and 516 relations without removing existing nodes or edges. Two expansion waves finished with an empty family frontier after scanning 1,268 Works. The generated family report is the current count source; DORA remains 14, MiCA 39, MiFID/MiFIR 111, and CRR/CRD is now 245. These counts include historical acts.

The earlier census returned 1,120 Works, but its explicit-seed UNION omitted eight cross-sector seeds. The graph build resolved those eight separately, yielding 1,128; the census query now resolves seeds through official `owl:sameAs` identities. The old 1,120 figure was directory discovery, not a completed seed-inclusive collection.

The corrected seed-inclusive census was rerun at `data/raw/earth/census/2026-09-27T10-59-29-843Z/`: **1,129 distinct Works / CELEX identifiers**, 2,115 metadata rows, no missing English titles. The extra file beyond the first 1,128-work installation is the explicitly tagged BRRD root (`32014L0059`), promoted from one-hop context into the included collection. The graph refresh reused matching cached queries and acquired the newly required pages before publication.

Seven Work predicates are published with their raw source direction and URI: `work_cites_work`, `resource_legal_based_on_resource_legal`, `resource_legal_completes_resource_legal`, `resource_legal_amends_resource_legal`, `resource_legal_corrects_resource_legal`, `resource_legal_repeals_resource_legal`, `resource_legal_implements_resource_legal`. Creator edges are separate `work_created_by_agent` metadata. Unsupported predicates are retained in raw acquisition and counted in the report, not renamed into supported relationships: 342 raw triples were excluded this way. Another 754 supported triples lack an English titled endpoint and are omitted from the published graph. No reverse-direction or inferred legal edges are invented.

DORA (`32022R2554`) and its amending directive (`32022L2556`) have **two official `work_cites_work` triples, one in each direction**. Their direct bundle is included in the overview and when either file is selected. This is not an `AMENDS` edge between the two files.

A required read-only Sol High review approved this separate metadata-artifact approach conditionally on these identity, direction, boundary and creator-role restrictions. Existing Article contracts, legal parsers and release gates were not changed for this expansion.

Initial directory-graph implementation check (before recursive-family automation): the real artifact was checked for unique stable identities, valid endpoints, raw triple direction/identity correspondence and the DORA pair. Local Chrome walkthroughs checked DORA connections, EBA, unchanged canvas during selection, filters and 390px overflow with no page errors; the production build on port 3000 also passed focus and Structured greying/layout checks. An instrumented WebGL check recorded zero draws while settled, 456 during interaction, then zero again after settling: the scene does not continuously redraw when idle. This is not a guarantee of performance on every computer. No new test files were added for that expansion. `npm run check` and build passed; seven existing layout/motion/projection checks also passed. That ordinary unit suite reported 327 passed and the existing release snapshot-count failure (28 expected, 98 found), which remains outside this change.

### Actual included laws

Run `earth:inventory` after installing an Earth artifact. The complete table is generated from installed `graph.json` when present; `--artifact <sqlite-path>` selects the original Article inventory mode. It is not generated from a proposed scope or a discovery count.

### Another-computer handoff — 2026-09-27

Use the same code commit and Node 24 (`.nvmrc`). Copy these files to the same relative paths inside the destination checkout, using a new checkout or backing up existing destination files first:

| Required file | Purpose | Approximate size |
| --- | --- | --- |
| `data/artifacts/runtime/regulatory.sqlite` | Shared Platform API/Reader runtime; required even when opening only Earth | 46 MiB |
| `data/artifacts/earth/graph.json` | Installed regulatory nebula and metadata relationships | 4.5 MiB |
| `data/artifacts/earth/earth.sqlite` | Existing ten-law Article explorer and audited evidence reading | 8.9 MiB |

No raw files or model credentials are needed to display these installed artifacts. Do not copy `node_modules`, `dist`, old SQLite backups or `*.tmp` files. Graph source paths are provenance references; ordinary display does not reopen the raw acquisition snapshot.

```bash
nvm install
nvm use
npm ci
```

After restoring the three data files, use two terminals at the destination repository root:

```bash
# Terminal 1: read the transferred runtime without rebuilding it
npm run dev:server
```

```bash
# Terminal 2
npm run dev:web
```

Open the Vite URL printed by Terminal 2, normally `http://localhost:5173/earth`; Article reading is `/earth?view=reading`. Check `http://localhost:3000/api/health` and `/api/earth/graph` if startup fails. These commands intentionally bypass the `predev`/`prestart` Runtime rebuild: plain `npm run dev` or `npm start` is not the minimal three-file handoff workflow.

Optional transfers:

- `data/artifacts/earth/census.json`, `family-coverage.json` and `refresh-report.json` preserve discovery/change reports, but are not required by the UI. The family inventory documents and small Earth configuration travel through Git.
- `data/raw/earth/graph/2026-09-27T15-02-44-889Z/` (about 23 MiB) preserves this run's queries, frozen census/configuration, baseline and completion manifest. Copy the entire snapshot folder only if offline reconstruction, provenance inspection or `earth:refresh -- --resume` is needed. The corresponding census is already frozen in `inputs.json`. A new `npm run earth:refresh` can fetch current official metadata without this old folder or model credentials.
- `data/artifacts/canonical/` is needed to rebuild the Platform Runtime from its current canonical documents, not to display the copied runtime. Full source/parser reproduction may additionally require the relevant `data/raw/` and other build inputs; follow the corpus onboarding runbook rather than treating the three runtime files as source inputs.
- `.env` is optional for Earth itself. Transfer credentials securely only if Copilot/Monitor or other configured integrations are needed, and update any machine-specific paths. Existing Monitor data under `data/monitor/` is optional and separate from Earth.

Git commits contain the code/configuration and inventories, not these ignored databases, graph JSON, raw snapshots or credentials. A local commit must be pushed explicitly before a different computer can obtain it from the remote.

<!-- earth-inventory:start -->

Installed metadata graph: **1129 included files**, **1757 related files outside directory scope**, **12 institutions**, **11822 displayed-category metadata relations**. Full text remains separate.

[Complete included-file table](earth-inventory.md). [Family coverage and related files](earth-families.md).

| CELEX / English source | Display label | Editorial family | Editorial sectors |
| --- | --- | --- | --- |
| [32009L0065](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32009L0065) | UCITS | UCITS | funds, securities |
| [32009L0138](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32009L0138) | Solvency II | Solvency II | insurance |
| [32011L0061](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32011L0061) | AIFMD | AIFMD | funds, securities |
| [32012R0648](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32012R0648) | EMIR | EMIR | banking, funds, securities |
| [32013L0036](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32013L0036) | CRD IV | CRR / CRD | banking |
| [32013R0575](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32013R0575) | CRR | CRR / CRD | banking |
| [32014L0059](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32014L0059) | BRRD | BRRD | banking |
| [32014L0065](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32014L0065) | MiFID II | MiFID / MiFIR | banking, securities |
| [32014R0600](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32014R0600) | MiFIR | MiFID / MiFIR | banking, securities |
| [32015L0849](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32015L0849) | AMLD IV | AML | banking, crypto, funds, insurance, payments |
| [32015L2366](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32015L2366) | PSD2 | PSD | banking, payments |
| [32016R0679](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679) | GDPR | GDPR | banking, crypto, funds, insurance, payments |
| [32022L2555](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022L2555) | NIS2 | NIS2 | banking, crypto, funds, insurance, payments |
| [32022L2556](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022L2556) | DORA Amending Directive | DORA | banking, funds, insurance, payments |
| [32022R2554](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022R2554) | DORA | DORA | banking, crypto, funds, insurance, payments |
| [32023R1113](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R1113) | Transfer of Funds Regulation | AML | banking, crypto, payments |
| [32023R1114](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R1114) | MiCA | MiCA | banking, crypto |
| [32023R2854](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R2854) | Data Act | Data Act | banking, crypto, funds, insurance, payments |
| [32024R1689](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689) | AI Act | AI Act | banking, crypto, funds, insurance, payments |

<!-- earth-inventory:end -->

## 1. Decision summary

Earth is a feature in the same TypeScript/Node application and deployment as the Regulatory Knowledge Platform, but it is **not** a view over that Platform's `DocumentView`, `RuntimeRepository`, or runtime SQLite artifact.

Earth is also a visually independent product surface. It may share the application entry point and restrained brand cues, but it must not reuse the Reader's multi-column page composition, dense panels, or ordinary catalogue layout. `/earth` is a full-viewport, three-dimensional European legal nebula: laws form star clusters connected by official relationships. The visual direction confirmed on 2026-09-26 supersedes the earlier literal-globe requirement. Preserve the accepted deep-blue space, warm-gold included laws, and pale-blue boundary laws.

Earth has its own directory boundary, source manifest, build pipeline, read model, read-only artifact, repository, and HTTP routes. At build time it acquires official material from EUR-Lex/CELLAR/Formex; at runtime it reads only its verified Earth artifact. The browser and Earth API never fetch official sources live.

This separation permits `EU Banking 10` to grow to 100, 200, or 400 laws without coupling its coverage, release cadence, schema evolution, or failure modes to the Platform Runtime. It does not create a second service, database server, deployment, GraphDB, or frontend application.

Existing tested acquisition and Formex parsing code may be reused as a library dependency. Earth must not consume a prebuilt Platform `DocumentView`, Platform canonical artifact, Platform relationship repository, or Platform Runtime SQLite file.

## 2. Product boundary

Earth presents a navigable regulatory world:

- the primary view is a rotatable, spatial starfield of law clusters; there is no solid planet, spherical surface, or geographic map;
- a law is a Work-level cluster;
- a selected official Expression supplies the visible hierarchy (Title, Chapter, Section, Article);
- exact official relations are retained as evidence-bearing facts;
- projections can show law-to-law aggregates, bounded bundles, or a loaded exact neighbourhood;
- official one-hop Works outside the selected Universe appear as non-expandable boundary nodes.

Earth is an exploration interface, not legal advice, an applicability engine, or an inferred knowledge graph. Its base layer excludes generated relations, semantic similarity, LLM output, guessed mappings, and private enterprise mappings. Such material may only be added later as separately labelled overlays; it must not change the official base graph.

## 3. Architecture and ownership

```text
EUR-Lex / CELLAR / Official Journal / Formex
                    |
                    v
       Earth acquisition and snapshot verification
                    |
                    v
       Earth normalization and graph compilation
                    |
                    v
   verified Earth read-only artifact (SQLite + manifest)
                    |
                    v
 Earth repository -> Earth service -> /api/earth/* -> Earth web
                                             |
                                             v
                                  projection -> renderer
```

The existing Platform keeps its own pipeline and Runtime untouched:

```text
Platform source/build/artifact/runtime       Earth source/build/artifact/runtime
--------------------------------------       -----------------------------------
existing source registries                   Earth Universe source manifest
existing Canonical / Runtime SQLite          Earth graph SQLite
DocumentView / RuntimeRepository             EarthRepository
existing /api/* contracts                    /api/earth/* contracts
```

The two sides may share only deliberately reusable low-level code, notably official download, snapshot verification, Formex package handling, XML parsing primitives, stable-ID helpers, and test fixtures. A shared helper must not import either side's repository, service, DTO, artifact schema, or UI.

### 3.1 Required directory boundary

New Earth code and data configuration live under an Earth-owned root; Platform directories remain unchanged except for the minimal application route registration needed to mount Earth.

```text
src/earth/
├── contract/          # Earth-only schema, IDs and API DTOs
├── acquisition/       # official-source adapters and snapshot policy
├── build/             # normalization, hierarchy/relation compiler, artifact verifier
├── runtime/           # read-only EarthRepository and EarthService
├── api/               # bounded Express router
└── web/               # Earth page, domain, projection, renderer adapters and UI

data/earth/
├── universes/         # reviewed editorial Universe manifests (Git-managed)
└── reviewed/          # reviewed relation inputs / policy data (Git-managed)

data/raw/earth/        # ignored official snapshots
data/artifacts/earth/  # ignored generated Earth artifacts and build reports
```

No file under `src/earth/` may import `src/data/document-repository`, `src/runtime/sqlite-runtime-repository`, Platform `DocumentView` conversion, or a Platform runtime artifact path. `src/web/` Platform pages do not import Earth acquisition/build/runtime internals; Earth web code owns its UI under `src/earth/web/`.

### 3.2 One application and one deployment

The production process remains one Node service serving one React build. It opens the Platform artifact and the Earth artifact read-only through separate repositories. Artifact generation and official fetching happen before deployment, never on startup or request handling. Each artifact has its own build ID, schema version, manifest hash, build timestamp, and source snapshot references.

## 4. Official source and build policy

Earth's primary sources are EUR-Lex, CELLAR, Official Journal material, and English Formex where available. A Universe manifest lists the intended Works and source selection policy; a build records the exact URI, retrieval metadata, byte hash, parser/compiler version, and selected Expression for every included Work.

The build is deterministic from its reviewed manifest and verified snapshots:

1. resolve the official Work and snapshot the required metadata/content;
2. choose the published Expression according to the manifest (normally English and an explicit version/as-of policy);
3. parse the expression hierarchy without modifying legal text;
4. collect only supported official relation records and their evidence;
5. compile and verify an Earth-specific SQLite artifact in a staging path;
6. write the verified local Earth artifact for runtime use.

Build failure, a changed hash, an unresolved Work/Expression, or a failed parser/relationship quality gate must fail the Earth build rather than silently substituting Platform data or a different official version. Raw snapshots and generated artifacts are not committed to Git.

CELLAR and EUR-Lex metadata are suitable build inputs, not runtime dependencies. A temporary source outage therefore affects refreshes but not the deployed Earth experience.

## 5. Identity, hierarchy, and relation contract

### 5.1 Work and Expression are distinct

A law cluster represents an official legal **Work**. Its visual hierarchy comes from one explicitly selected **Expression**. The selection must be visible in API metadata and artifact provenance; an update cannot silently move nodes to a different consolidated or language version.

```ts
type EarthWork = {
  id: string                    // stable Earth Work ID, derived from official identity
  celex?: string
  workUri: string
  officialTitle: string
  shortName?: string             // editorial display label, never identity
  expression: {
    id: string
    uri: string
    language: 'en'
    versionLabel?: string
    asOf?: string
    sourceLocator: string
  }
}
```

`EarthNode` has a stable ID, node type, `workId`, optional `parentId`, official label/locator, and `included | boundary` status. A hierarchy node is derived from the selected Expression, not from a display-only client tree. Article is the first release's lowest graph hierarchy level; the detail panel can link to an exact official locator but no paragraph/point nodes are required.

### 5.2 Exact relations remain first-class

Every published edge carries its precise endpoint identity and reproducible official evidence. Aggregate and bundle edges are projections and must retain the exact edge IDs/counts from which they were produced.

```ts
type EarthEdge = {
  id: string
  source: string
  target: string
  relationType: EarthRelationshipType
  provenance: 'LEGAL_TEXT' | 'CELLAR_METADATA' | 'EUR_LEX_METADATA'
  evidence: {
    text: string
    locator: string
    sourceUrl: string
  }
  attributes?: Record<string, unknown>
}
```

`relationType` is a reviewed, versioned Earth enum. The compiler must not change direction, invent a relation from proximity, or relabel a metadata relation as an Article-text relation. The evidence locator identifies the text, metadata predicate, or official record that supports the edge. Empty results mean only that no matching edge is published in this Earth artifact.

## 6. Universe and boundary policy

A Universe is an editorially maintained scope for exploration, for example `eu-banking-10`. It is neither a legal applicability conclusion nor a claim that the Universe is complete.

```json
{
  "schemaVersion": "0.1.0",
  "id": "eu-banking-10",
  "version": "0.1.0",
  "displayName": "EU Banking 10",
  "provenance": "EDITORIAL",
  "language": "ENG",
  "expressionPolicy": "english-celex-expression",
  "relationshipPolicy": { "includeOfficialOneHopBoundary": true },
  "members": [{ "celex": "32022R2554", "label": "DORA" }]
}
```

An included Work has full selected-expression hierarchy subject to progressive loading. A direct official relation to a Work outside the Universe may create a metadata-only boundary node with stable Work identity, official title/CELEX, edge evidence, and a link to the official source. Boundary nodes never recursively expand. When an editorial review later adds that Work to the Universe, its identity remains stable and the node becomes included after a new build.

## 7. Runtime API and progressive loading

The API is read-only, artifact-scoped, bounded, and intentionally does not expose a graph query language. A first contract should provide:

```text
GET /api/earth/universes
GET /api/earth/universes/:universeId/overview
GET /api/earth/nodes/:nodeId
GET /api/earth/nodes/:nodeId/children
GET /api/earth/nodes/:nodeId/neighbourhood
GET /api/earth/relationships/:edgeId
GET /api/earth/articles/:articleId/reading
```

`overview` returns only Universe-level law clusters, aggregate inter-law relations, boundary summaries, and build metadata. `children` loads one hierarchy level with an explicit limit. `neighbourhood` is bounded by documented depth, node count, edge count, direction, relation types, and boundary policy. It returns exact relations only for the requested loaded scope.

`reading` returns one complete, audited Article body from the selected English Expression, with a maximum of 500 reading blocks and 512 KiB serialized JSON. Paragraphs/points use separate `earth-reading:` identities and never become graph nodes or relationship endpoints. Content is an ordered sequence of exact normalized text and child references: text before a list, nested items, and text after a list are rendered once, in source order. Each source location is an absolute, unique XPath within the recorded ACT XML member of the verified source snapshot. `parserLocator` is retained only as a historical navigation hint, not as a unique XPath. The response includes Work/Expression/Manifestation identity, source URL, snapshot hash, and retrieval time. Retrieval time is not an effective date, and selected CELEX expression is not a latest-consolidated-version claim. Formex `NOTE` and original formatting are not reproduced; recitals/annexes are not published by this Article endpoint. Unknown/non-Article IDs return 404; incomplete or invalid readings fail with 503 instead of returning partial bodies. Missing, corrupt, or incompatible Earth artifacts disable only Earth with 503, not the rest of Platform.

Boundary projection in `overview` is explicitly bounded:

```text
?boundaryLimit=100       # default 100, maximum 200
&boundaryOffset=0        # maximum 100000
&boundaryQuery=2554R     # optional CELEX or official-title filter, maximum 80 characters
```

The response distinguishes total exact relationships from relationships whose endpoints are present in the current boundary page. It reports total boundary count, matching count, returned count, offset, limit, and `hasMore`; aggregate edges never reference an omitted boundary node.

There is no global `Reveal All`. The UI may offer **Show exact relations in this loaded neighbourhood** after an explicit user action and a server-enforced budget. This keeps a 400-law Universe navigable, prevents accidental hairballs, and makes cost/scale predictable. Aggregate is the initial view; bundling is a later projection mode, not a reason to omit exact source facts.

## 8. Web, projection, renderer, and accessibility

The web layer is data- and renderer-independent:

```text
Earth API DTO -> Earth domain state -> projection -> controlled renderer
```

Projection owns hierarchy collapse/expansion, relation aggregation/bundling/exact selection, display labels, and visual tokens. It may choose color, size, opacity, layout hints, and focus state; none are persisted as legal data. It must preserve a mapping back to original Earth node/edge IDs and evidence.

Renderers are controlled React adapters. They receive an `EarthRenderModel` plus current focus/selection and event callbacks; they do not fetch data, own domain state, import source adapters, or create relationship semantics.

```ts
type EarthRendererProps = {
  model: EarthRenderModel
  selection: EarthSelection
  onSelectNode(id: string): void
  onSelectEdge(id: string): void
  onRequestExpand(id: string): void
  onRequestFocus(id: string): void
}

type EarthRenderer = React.ComponentType<EarthRendererProps>
```

The existing **Reagraph spike**, isolated under `src/earth/web/renderers/reagraph/`, proved that the real artifact, selection, focus, progressive hierarchy, and bounded exact-neighbourhood model work in WebGL. Its `concentric2d` presentation is not the Earth product and must not remain the default renderer.

The production renderer presents a three-dimensional nebula of laws on a deep-blue space background. Included laws are warm-gold main stars; official boundary Works are smaller pale-blue stars near their connected laws, and official relationships form restrained curved links. Positions are deterministic presentation coordinates; proximity, cluster placement, and decorative glow do not establish legal meaning. Background stars and soft glow are non-interactive decoration and never appear as legal entities or evidence. The renderer stays behind the existing pure `EarthRenderModel` boundary so this visual change does not reopen the API or legal-data model.

Selecting an included law progressively loads its official hierarchy from the existing children endpoint. The current parent and its loaded children appear as a focused constellation. Thin dashed structural stems represent only those returned parent/child entries, remain visually distinct from official cross-law relations, and are not added to relationship arrays or counts. Returning to a parent replaces the loaded structural branch; it does not recursively reveal all Articles.

The renderer now reuses one WebGL context while the graph/loaded branch changes. Legal points and glow are instanced, official curves are batched with segment-to-edge ID mappings, and structural stems remain a separate batch. Camera changes, focus animation, data changes, resize, and label changes request frames; a settled or hidden view does not keep rendering. Label dimensions are cached and updated by `ResizeObserver`, with batched measurements and transform-only positioning. The drawing buffer is capped at a 1.25 pixel ratio and two million physical pixels; DOM labels retain normal text resolution. Unmount cancels scheduled work, disconnects observers, disposes graphics resources, and explicitly releases the WebGL context.

The visual surface is deliberately simple:

- one full-viewport nebula of law clusters;
- a small title/navigation control rather than the existing site header and page chrome;
- drag to rotate, wheel/pinch to zoom, click or keyboard action to select;
- selected and connected laws remain bright while unrelated nodes recede;
- official relations appear as clear, restrained curves; loaded legal structure uses distinct dashed stems;
- one lightweight floating detail card for identity, relation evidence, and source links;
- no dashboard grid, permanent multi-column rail, dense filter panel, or developer-facing graph controls in the default view.

Earth must have an accessible non-WebGL fallback from the same render model: keyboard-operable law/relationship list or 2D structured view, focus/selection announcements, text alternatives for relation counts and evidence, visible focus, and no interaction that relies only on color, drag, or hover. Failure to initialize WebGL selects the fallback without losing navigation or official provenance.

## 9. Interaction model

The initial Universe view shows law clusters and aggregate cross-law relations in a three-dimensional starfield, not every Article. The starfield fills the available viewport and starts at a readable overview angle. Dragging rotates the space, zooming changes exploration scale, and selecting a law brings its constellation into focus without disorienting camera jumps. Connected stars remain legible, unrelated stars recede, and a compact floating card shows official identity and source/version information. Expanding a law requests its hierarchy incrementally and exposes only the current loaded branch. Selecting a relation highlights its curve and shows its type, provenance, exact evidence locator, and source link.

Visual guidance is restrained: a Work has one color family, hierarchy depth changes visual weight, boundary nodes are distinct but not deceptive, and exact-mode density is an intentional user-selected exploration state. The product should feel calm and spatial rather than like a generic network-analysis tool. It avoids neon “sci-fi” decoration, geographic claims from presentation coordinates, saved user graph edits, VR/AR, complex custom shaders, and generated explanations in the initial release.

## 10. Delivery phases and acceptance gates

| Phase | Deliverable | Acceptance gate |
|---|---|---|
| 0 — contracts | Earth-only directory skeleton, Universe manifest schema, Work/Expression/edge contracts, artifact schema and tests | No Earth import of Platform runtime/view paths; stable IDs and relation semantics receive high-intensity review. |
| 1 — official vertical slice | A small reviewed EU Banking Universe is acquired from official snapshots, parsed, compiled, and opened through EarthRepository | Build records hashes and Expression identity; raw/derived outputs remain ignored; artifact verification and source/parser fixtures pass. |
| 2 — bounded explorer | Read-only Earth API, overview, detail, hierarchy children, boundary nodes, aggregate projection and accessible fallback | No request triggers official fetch or parsing; API responses preserve provenance/evidence; keyboard fallback completes the same basic navigation. |
| 3 — renderer spike | Isolated Reagraph adapter using the Phase 2 render model | The spike proves the render-model boundary and interactions; its 2D presentation is explicitly evaluated rather than adopted by default. |
| 4 — immersive nebula | Full-viewport 3D law clusters, rotation/zoom/select, relationship curves, loaded hierarchy constellations, floating evidence card, and structured fallback | The result is visually independent from the Reader, keeps interactions obvious, preserves bounded loading, and passes focused desktop/mobile visual checks. |
| 5 — measured expansion | Expand only after the Banking 10 nebula is simple, attractive, and usable | Representative measurements cover initial load, focus, selection, relation display, and fallback; broader official coverage remains an editorial decision. |

Every parser, identity, relation-semantic, and artifact-schema change requires targeted fixtures/evaluations plus `npm run check` and `npm test`. Canonical contracts, stable IDs, relationship direction/provenance, and release gates require Sol-high review before merge, as required by repository policy.

### Current implementation status — 2026-09-26

- Phase 0 is complete: Earth contracts and directories are isolated from the existing Platform data and runtime paths.
- Phase 1 is complete for the reviewed Banking 10 Article vertical slice: ten official English CELLAR contents are stored as immutable, verified source snapshots; hierarchy and audited, normalized Article bodies are compiled into the standalone Earth 0.3 artifact. This does not imply complete official formatting, notes, recitals, annexes, or broader legal coverage.
- Phase 2 is complete for the Banking 10 Article explorer: the read-only API, progressive hierarchy, aggregate relations, non-recursive boundary Works, exact relationship evidence panel, Article reading/locators, and keyboard-operable structured view run entirely from the artifact.
- Official relationship acquisition currently publishes 103 reviewed one-hop lifecycle facts: 48 `AMENDS` facts and 55 `CORRECTS` facts. The verified artifact contains ten included Works, 95 boundary Works, 1,108 nodes, and 806 Articles. A boundary title remains absent when CELLAR supplies no English title; Earth does not manufacture one.
- Phase 3 technical validation is complete: the Reagraph spike proved graph focus, selection, progressive hierarchy, structured fallback, and synthetic scale, but its `concentric2d` result was visually rejected as the product renderer. It is retained as a historical adapter, not loaded by the default Earth page.
- Phase 4 is being refined as the user-confirmed European legal nebula. The default renderer is `web/renderers/nebula/EarthNebulaRenderer.tsx`; it replaces the literal globe with spatial law clusters, soft star glow, and official relationship curves. It retains the accepted palette and adds the current loaded parent/children constellation. The renderer neither fetches data nor changes graph facts.
- Users can rotate with drag/touch or arrow keys, zoom with wheel/pinch or buttons, reset the camera, select labelled laws, and inspect official relations in a floating card. Selection brings a law into focus and dims unrelated nodes/arcs. The card preserves progressive hierarchy and bounded exact neighbourhoods; relation lists and boundary search are collapsed in the default overview.
- Desktop and 390px phone views have been checked against the installed Banking 10 artifact. A WebGL initialization failure or lost context switches automatically to the keyboard-operable Structured view. Reduced-motion preferences disable animated camera focus.
- The agreed next scope is to complete Banking 10 before considering expansion: smooth, resource-bounded exploration, official provision reading/locators, and a small set of evidence-backed cross-law research paths. Wider legal coverage, release automation, and additional operational machinery remain deferred. Synthetic 100/200/400-node tests are renderer measurements, not expanded official coverage.
- The initial 2026-09-26 completeness check found all 806 Article containers had empty `nodes.text`: the shared parser emits paragraph/point bodies separately. The 0.3 implementation now publishes 806 audited Article readings with 7,016 separate reading blocks; Article containers and graph identity remain unchanged. Structural checks and body-completeness checks remain distinct. The shared parser and official relationship semantics were not changed.

## 11. Explicit non-goals for v0.4

- Earth does not replace or migrate the existing Platform pipeline.
- Earth does not read or write the existing Platform Runtime artifact.
- Runtime does not query EUR-Lex, CELLAR, SPARQL, Formex, or raw snapshots.
- No Neo4j, Redis, message queue, GraphQL, WebSocket, second Node service, or second deployment is introduced.
- No unrestricted graph query, recursive boundary traversal, whole-Universe exact reveal, AI relation, or semantic-inference relation is published.
- No generic 2D graph is presented as a 3D Earth merely because it uses WebGL.

## 12. Success condition

Earth succeeds when a user can open a verified `EU Banking` Universe and immediately understand that they are exploring a European legal starfield: rotate and zoom its clusters, select a Work, follow its official relationships, inspect exact official evidence in a lightweight card, progressively enter its hierarchy as a constellation, and return to an accessible non-WebGL representation when needed. The experience must first be simple, attractive, and usable for Banking 10 before broader coverage is considered.

## 13. Pause and continuation record — 2026-09-11

Earth development is intentionally paused after the Phase 4 interaction milestone so that work can move to Contextual Regulatory Copilot. This section is the hand-off record for resuming Earth without reconstructing decisions from chat history. The Git commit containing this section is the pause checkpoint; locate it with `git log -- docs/earth/earth.md`.

Sections 13.1–13.3 preserve the historical checkpoint evidence. The user-confirmed nebula direction dated 2026-09-26 supersedes both the historical release-work priorities and the 2026-09-12 literal-globe direction. Section 13.6 records the superseded globe implementation's checks; section 13.7 records the nebula implementation's checks. Product acceptance remains a user review.

### 13.1 Checkpoint state

- The implementation described in sections 1–12 is present and integrated at `/earth` and `/api/earth/*`.
- Phase 0 through Phase 4 are complete. Phase 5 is the only active phase and has not been represented as complete.
- The reviewed runtime scope is `data/earth/universes/eu-banking-10.json`; `eu-banking-pilot.json` remains a smaller development fixture.
- The current verified ignored artifact is `data/artifacts/earth/earth.sqlite` with build ID `earth-build:4ddda7e6f9e3d57de1bdacdf61b1e27c3ac834b8f01cf9738589b4d5648fb12e`.
- That artifact contains 10 included Works, 95 boundary Works, 1,108 nodes, 806 Articles, and 103 exact official relationships: 48 `AMENDS` and 55 `CORRECTS`.
- The selected official relation snapshot is `data/raw/earth/cellar-relations/2026-09-10T17-36-35-307Z-474679b228f2`, with snapshot ID `earth:cellar-relations:474679b228f2256bb304b1382057ba5744f58f6dae290c021a17d358ffc4f38b` and 103 normalized records.
- Raw snapshots and generated SQLite artifacts are intentionally Git-ignored. They must not be added to a later commit. A fresh checkout therefore needs the official acquisition/build steps below or a separately promoted immutable artifact.
- No background acquisition, build, or development process needs to remain running while Earth is paused.

### 13.2 Last green verification

The pause checkpoint passed all ordinary and Earth-specific gates on 2026-09-11:

```text
npm run check                    pass (260 files)
npm test                         pass (300 tests in 72 files)
npm run build                    pass
npm run earth:render:benchmark   pass (5/5 Chromium cases)
npm run earth:verify -- --artifact data/artifacts/earth/earth.sqlite   pass
git diff --check                 pass
```

The synthetic renderer fixtures reached a visible WebGL frame in approximately 689 ms for 100 Works, 851 ms for 200 Works, and 2.2 s for 400 Works against an eight-second release gate. The 205-boundary paging/filter workflow took approximately 518 ms and the exact-neighbourhood workflow approximately 1.2 s. These figures are test-machine observations, not production latency guarantees.

The production build still reports a size warning for the lazy Reagraph chunk (approximately 1.367 MB minified / 389.51 KB gzip). Reagraph remains isolated behind `EarthRenderer`; the measured spike passed the current gate, but bundle size and low-powered-device behaviour remain Phase 5 review items.

### 13.3 Exact resume procedure

From the repository root:

1. Read this document, `AGENTS.md`, and the pause checkpoint diff before changing Earth contracts or relationship semantics.
2. Confirm whether the ignored `data/raw/earth/` snapshots and `data/artifacts/earth/earth.sqlite` are present. Do not silently substitute Platform data if they are absent.
3. Verify any present source snapshots with `npm run earth:source:verify` and `npm run earth:relations:verify` using the CLI arguments shown by the commands.
4. Rebuild when necessary with `npm run earth:build`, then verify the exact output with `npm run earth:verify -- --artifact data/artifacts/earth/earth.sqlite`.
5. Run `npm run check`, `npm test`, `npm run build`, and `npm run earth:render:benchmark` before continuing Phase 5 or changing the renderer decision.
6. Keep official fetching/building out of server startup and request handlers. Runtime remains read-only and must fail with `earth_artifact_unavailable` when the Earth artifact is absent.

### 13.4 Next bounded work package

Continue from the Three.js nebula and evaluate visual quality and interaction feel against the real Banking 10 artifact:

1. Refine the controlled 3D nebula renderer behind the existing `EarthRenderModel` boundary, retaining the accepted deep-blue/gold/pale-blue palette.
2. Preserve the full-viewport composition, minimal navigation, and one floating detail card.
3. Verify rotate, zoom, select a law, highlight connected stars/curves, enter the loaded hierarchy, inspect a relation, and return to the overview.
4. Keep Banking 10 and the existing bounded API. Do not add laws, graph semantics, filters, workflows, release management, or operational machinery as part of this visual replacement.
5. Check the real page at desktop and mobile widths, retain the structured accessibility fallback, and judge success primarily by clarity, visual quality, and interaction feel.

After the performance work, continue with Banking 10 provision reading as a separate bounded package. Reuse verified official source material; preserve source order, exact locators and selected Expression identity. Keep paragraphs/points in the reading surface without automatically adding them as graph entities. Follow the existing Sol-high review policy before changing data contracts, legal parsing, relationship semantics, or release gates. Do not add laws simply to increase visual density.

### 13.5 Decisions that must not be reopened accidentally

- Earth remains one independently owned feature inside the existing TypeScript/Node application and deployment, not a second service and not a view over the Platform runtime artifact.
- Official acquisition happens at build time. Browser and runtime APIs never call CELLAR/EUR-Lex directly.
- Aggregate overview is the default. Exact relations load only through an explicit, server-bounded neighbourhood request; there is no global reveal.
- Boundary nodes are one-hop, metadata-only, paged, searchable, and non-recursive.
- The UI consumes only Earth API/domain projections. It does not import acquisition, parsing, SQLite, or official-source adapters.
- Earth is visually independent from the Reader and catalogue surfaces. Shared deployment does not require shared page composition.
- The default visual is a European legal nebula with spatial law clusters. A solid Earth/planet surface is not the product metaphor.
- Keep the first experience simple: one starfield, a few obvious controls, and one lightweight information surface.
- Missing titles, hierarchy, evidence, or source material fail closed or remain visibly absent; they are never invented or silently repaired.
- Expanding from Banking 10 to 100/200/400 actual laws is an editorial/legal coverage decision, not a technical auto-discovery step.

### 13.6 Superseded globe verification — 2026-09-26

- `npm run check`, `npm run build`, and verification of the installed `data/artifacts/earth/earth.sqlite` passed.
- `e2e/earth-globe.spec.ts` and `e2e/earth-scale.spec.ts`: 8/8 passed with local Chrome through a temporary Playwright launch configuration. The tracked launch configuration and existing eight-second scale budget were unchanged. The real-artifact cases cover drag and keyboard rotation, zoom/reset, law selection, source links, 390px layout, selection across views, and automatic keyboard fallback without WebGL. Synthetic cases retain boundary paging/filtering, bounded exact navigation, and 100/200/400-node rendering.
- The globe's lazy production chunk is approximately 540 KB minified / 137 KB gzip. Vite still reports its ordinary 500 KB chunk warning; the former Reagraph spike is no longer included in the default Earth build.
- The full `npm test` run had the existing raw-snapshot assertion mismatch (`verifiedRawSnapshots`: expected 28, actual 98) plus five files affected by build-related timeouts. All 38 tests in those five files passed on a one-worker rerun without changing time limits. The full suite is therefore not recorded as green; the snapshot assertion remains outside this visual work package.

### 13.7 Nebula implementation verification — 2026-09-26

- `npm run check`, `npm run build`, and `npm run earth:verify -- --artifact data/artifacts/earth/earth.sqlite` passed. The independently built Earth artifact is `earth-build:9e78c99fefe8f45deb21aaf46442a7da59f3519dca8c69f8656c8b1992e999b4`; no API, canonical contract, parser, or official relationship semantics changed.
- `e2e/earth-nebula.spec.ts` and `e2e/earth-scale.spec.ts`: 9/9 passed using local Chrome and the temporary launch configuration. Coverage includes rotation, zoom/reset, official source links, loaded hierarchy selection and parent-level return, 390px layout, structured selection, automatic no-WebGL fallback, boundary paging/filtering, exact navigation, and the unchanged 100/200/400-Work frame gate.
- Desktop and mobile screenshots were inspected. Mobile framing and label collision avoidance were refined; the 390×844 page has no overflow and no browser errors. Labels may be hidden when no collision-free placement exists; actual nodes remain selectable, and Structured view retains access to the loaded laws.
- The two pure layout tests passed: deterministic placement, stable boundary-star placement across paging, no invented IDs, and no mutation of graph facts.
- `npm test -- --maxWorkers=1`: 322 passed, one failed across 82 files. The remaining failure is the pre-existing `src/release/verify-corpus.test.ts` assertion (`verifiedRawSnapshots`: expected 28, actual 98). No release assertions or time limits were changed; the full suite is not green.
- The lazy nebula chunk is approximately 546 KB minified / 139 KB gzip; Vite retains its ordinary 500 KB warning. Generated artifacts and raw snapshots remain ignored and are not part of this visual change.

### 13.8 Performance work and Banking 10 scope — 2026-09-26

The user confirmed completing the existing ten laws before considering more coverage. This work package addresses browser rendering only; provision-body publication and evidence-backed research paths remain pending. No laws, official relationships, data contracts, parsers, compiler, or release-verification thresholds changed.

- Before optimization, a short instrumented local Chrome run at 1440×1000 with device scale factor 2 recorded about 23.3 animation-frame callbacks/second during rotation, a 423 ms long main-thread task while selecting a law, continued idle drawing, and two additional WebGL contexts after selection/children loading.
- After optimization, the final standalone run recorded about 45.4 callbacks/second during rotation, a longest observed selection task of 70 ms, zero drawing calls while settled, no new contexts during selection, and zero layout operations in the rotation sample. Sampled idle main-thread task occupancy fell from approximately 21% to 1.5%; this is occupancy of the instrumented page's main thread, not whole-computer CPU usage. Each sample was about 3.5 seconds. These are development-mode, headless, machine-specific diagnostics, not production FPS guarantees or a long-duration memory/GPU stability assessment.
- `npm run check`, `npm run build`, and verification of the unchanged installed Earth artifact passed. The lazy renderer chunk is approximately 545 KB minified / 139 KB gzip and retains Vite's ordinary size warning.
- `e2e/earth-nebula.spec.ts`, `e2e/earth-performance.spec.ts`, and `e2e/earth-scale.spec.ts`: 13/13 passed using local Chrome through the temporary launch configuration. New tests instrument ordinary and instanced drawing calls; they verify settled/hidden-view suspension, redraw on interaction/resume, context reuse through three repeated hierarchy paths, explicit context release through five view switches, the two-million-pixel cap, and structured fallback after actual context loss. The hidden-state test synthesizes the visibility event; it is not a long-running real-background-tab soak test. Existing functional and eight-second scale checks remain unchanged.
- Desktop, selected-law, and 390px mobile screenshots were inspected after batching. The accepted palette and star-cluster composition remain, with no browser errors or mobile overflow.
- `npm test -- --maxWorkers=1`: 322 passed and one failed across 82 files. The remaining failure is still the pre-existing 28-versus-98 raw-snapshot assertion in `src/release/verify-corpus.test.ts`; full-suite status is not green.
- Before claiming Banking 10 complete, provision reading must be separately implemented and checked against official source content/order and exact locators. Passing graph/structural tests alone is insufficient. Broader acquisition remains deferred.

### 13.9 Smooth focus and Banking 10 Article reading — 2026-09-27

The user authorized fixing the selection jump and completing the existing ten laws' Article bodies, source locations, and evidence reading. This is not authorization for wider acquisition or inferred cross-law relationships.

- The canvas retains the same viewport and WebGL context on selection. Camera/target/composition move through a 900 ms eased transition; newly loaded hierarchy nodes expand from their parent over 650 ms. Existing child positions are preserved when selected instead of moving back to the Work anchor. Reduced-motion preferences skip those transitions; idle/hidden suspension, pixel cap, disposal, and Structured fallback remain in place.
- The Earth-only source audit pairs reading blocks with the original ACT tree in source order and checks markers, kinds, ownership, interleaved text/children, and reconstructed content hashes. It resolves generated absolute XPath paths back to unique original elements. Unknown Article body containers, tables, non-text bodies, parser warnings, unsupported namespaces, missing blocks, or changed order stop the build. Only legal Article containers directly under ENACTING.TERMS and its DIVISION tree count as graph Articles; embedded amendment/citation Articles remain body text rather than additional nodes.
- A read-only standard libxml XPath check independently confirmed all 7,822 generated Article/block paths each match exactly one element in the corresponding original ACT XML. ACT member filenames are retained to disambiguate ZIP manifestations. Existing shared-parser point/subpoint hints are not used as unique evidence paths.
- The installed ignored artifact is schema/compiler 0.3.0, build `earth-build:4151e5d8a40297f521e2a221885f42fad98457d1f24e0f99389580deeedba651`, 9,310,208 bytes. It contains ten included Works, 95 boundary Works, 1,108 graph nodes, 103 official relations, 806 Article readings, and 7,016 reading blocks. Graph IDs, parent IDs, source locators, display order, and all official relationship rows were compared with the preceding artifact and are unchanged. The largest reading is AI Act Article 3: 80 blocks and 66,394 bytes of JSON, below the unchanged bounded reading budget.
- The preceding artifact is preserved locally as `data/artifacts/earth/earth.pre-reading-2026-09-26.sqlite`. Artifacts/raw snapshots stay ignored; there was no official refetch, canonical contract migration, commit, push, or remote release.
- The floating reader renders paragraphs, points, and nested subpoints without duplicating parent text. It exposes audited source locations, content hashes, snapshot/Expression/Manifestation identity, reviewed official links, and relationship evidence locators. Article reading omits the redundant hierarchy XPath and empty exact-neighbourhood control; the phone reading card is taller without resizing the canvas.
- Scope is explicitly **normalized Article body of the selected English Expression, excluding Formex NOTE and original formatting**. Full official reproduction and latest consolidated coverage are not claimed. Wider laws and curated cross-law research paths remain deferred.

Verified Article reading coverage:

| Law | CELEX | Articles | Reading blocks |
| --- | --- | ---: | ---: |
| CRD IV | 32013L0036 | 165 | 1,124 |
| AMLD IV | 32015L0849 | 69 | 402 |
| GDPR | 32016R0679 | 99 | 779 |
| NIS2 | 32022L2555 | 46 | 471 |
| DORA Amending Directive | 32022L2556 | 11 | 88 |
| DORA | 32022R2554 | 64 | 720 |
| Transfer of Funds Regulation | 32023R1113 | 40 | 246 |
| MiCA | 32023R1114 | 149 | 1,696 |
| Data Act | 32023R2854 | 50 | 500 |
| AI Act | 32024R1689 | 113 | 990 |
| Total | | 806 | 7,016 |

Verification record:

- `npm run check`, `npm run build`, and `npm run earth:verify -- --artifact data/artifacts/earth/earth.sqlite` passed. The lazy renderer remains approximately 546 KB minified / 140 KB gzip and retains Vite's ordinary size warning.
- Earth plus shared Formex parser fixtures: 36/36 passed, including nested/interleaved lists, mixed ALINEA/P paths, source-order/hash checks, namespace and unsupported-body rejection, truncated runtime reading rejection, and missing/old/corrupt Earth artifact isolation from Platform.
- `e2e/earth-nebula.spec.ts`, `e2e/earth-performance.spec.ts`, `e2e/earth-scale.spec.ts`, and `e2e/earth-reading.spec.ts`: 16/16 passed with local Chrome and the temporary launch configuration. The real-data API walk reached all 806 Articles across all ten Works and validated all 7,016 blocks. Normal-motion sampled intermediate focus frames retained the same canvas and viewport; existing idle/context/pixel/fallback/scale checks passed. Desktop and 390×844 screenshots were inspected; no browser errors or mobile overflow were found.
- `npm test -- --maxWorkers=1`: 327 passed, one failed across 85 files. The sole failure remains the pre-existing `src/release/verify-corpus.test.ts` raw-snapshot count assertion (expected 28, actual 98). No release gate/assertion was weakened; full-suite status is not green.

To rebuild on another machine, use the existing ten verified snapshot directories and the reviewed source metadata with `npm run earth:build`, then verify the exact generated artifact. Old 0.2 artifacts must be rebuilt; the server does not silently serve empty readings or perform runtime acquisition/migration.
