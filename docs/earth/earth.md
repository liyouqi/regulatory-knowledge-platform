# Official EU Regulatory Earth — v0.2

> Status: approved product and implementation requirements
> Scope: an official-source, exploratory regulation graph for a bounded EU regulatory Universe
> This document is intentionally independent of the existing Platform Runtime data path.

## 1. Decision summary

Earth is a feature in the same TypeScript/Node application and deployment as the Regulatory Knowledge Platform, but it is **not** a view over that Platform's `DocumentView`, `RuntimeRepository`, or runtime SQLite artifact.

Earth has its own directory boundary, source manifest, build pipeline, read model, read-only artifact, repository, and HTTP routes. At build time it acquires official material from EUR-Lex/CELLAR/Formex; at runtime it reads only its verified Earth artifact. The browser and Earth API never fetch official sources live.

This separation permits `EU Banking 10` to grow to 100, 200, or 400 laws without coupling its coverage, release cadence, schema evolution, or failure modes to the Platform Runtime. It does not create a second service, database server, deployment, GraphDB, or frontend application.

Existing tested acquisition and Formex parsing code may be reused as a library dependency. Earth must not consume a prebuilt Platform `DocumentView`, Platform canonical artifact, Platform relationship repository, or Platform Runtime SQLite file.

## 2. Product boundary

Earth presents a navigable regulatory world:

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
6. promote only the verified artifact for runtime use.

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
```

`overview` returns only Universe-level law clusters, aggregate inter-law relations, boundary summaries, and build metadata. `children` loads one hierarchy level with an explicit limit. `neighbourhood` is bounded by documented depth, node count, edge count, direction, relation types, and boundary policy. It returns exact relations only for the requested loaded scope.

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

The first candidate is a **Reagraph spike**, isolated under `src/earth/web/renderers/reagraph/`. It proves real-data rendering, bounded expansion, selection/focus, camera/navigation, aggregate/exact projection compatibility, and the performance budget before it becomes the production renderer. Reagraph mechanics may be used, but its default visual treatment is not a product constraint.

Earth must have an accessible non-WebGL fallback from the same render model: keyboard-operable law/relationship list or 2D structured view, focus/selection announcements, text alternatives for relation counts and evidence, visible focus, and no interaction that relies only on color, drag, or hover. Failure to initialize WebGL selects the fallback without losing navigation or official provenance.

## 9. Interaction model

The initial Universe view shows law clusters and aggregate cross-law relations, not every Article. Selecting a law focuses it, keeps its connected clusters legible, dims unrelated clusters, and opens a detail panel with official identity and source/version information. Expanding a law requests its hierarchy incrementally. Selecting a relation shows its type, provenance, exact evidence locator, and source link.

Visual guidance is restrained: a Work has one color family, hierarchy depth changes visual weight, boundary nodes are distinct but not deceptive, and exact-mode density is an intentional user-selected exploration state. The product avoids a default “sci-fi” aesthetic, arbitrary coordinates, saved user graph edits, VR/AR, custom shaders, and generated explanations in the initial release.

## 10. Delivery phases and acceptance gates

| Phase | Deliverable | Acceptance gate |
|---|---|---|
| 0 — contracts | Earth-only directory skeleton, Universe manifest schema, Work/Expression/edge contracts, artifact schema and tests | No Earth import of Platform runtime/view paths; stable IDs and relation semantics receive high-intensity review. |
| 1 — official vertical slice | A small reviewed EU Banking Universe is acquired from official snapshots, parsed, compiled, and opened through EarthRepository | Build records hashes and Expression identity; raw/derived outputs remain ignored; artifact verification and source/parser fixtures pass. |
| 2 — bounded explorer | Read-only Earth API, overview, detail, hierarchy children, boundary nodes, aggregate projection and accessible fallback | No request triggers official fetch or parsing; API responses preserve provenance/evidence; keyboard fallback completes the same basic navigation. |
| 3 — Reagraph spike | Isolated Reagraph adapter using the Phase 2 render model | It passes real-artifact focus, selection, bounded expansion and exact-neighbourhood tests within the agreed performance budget; otherwise replace only the adapter. |
| 4 — production interactions | Focus, drill-down, exact loaded-neighbourhood mode, relation evidence panel, renderer decision | Progressive-load limits are enforced server-side and client-side; no global unbounded reveal; regression and accessibility tests pass. |
| 5 — scale and release | Expand reviewed Universe coverage toward 100/200/400 Works | Synthetic and representative artifact benchmarks cover initial load, focus, expand, relation mode switch, and fallback; a verified immutable artifact is promoted with rollback metadata. |

Every parser, identity, relation-semantic, and artifact-schema change requires targeted fixtures/evaluations plus `npm run check` and `npm test`. Canonical contracts, stable IDs, relationship direction/provenance, and release gates require Sol-high review before merge, as required by repository policy.

### Current implementation status — 2026-09-11

- Phase 0 is complete: Earth contracts and directories are isolated from the existing Platform data and runtime paths.
- Phase 1 is complete for the reviewed Banking 10 vertical slice: ten official English CELLAR contents are stored as immutable, verified source snapshots and compiled into the standalone Earth artifact.
- Phase 2 is complete for Banking 10: the read-only API, progressive hierarchy, aggregate relations, non-recursive boundary Works, exact evidence panel, and keyboard-operable structured view run entirely from the artifact.
- Official relationship acquisition currently publishes 103 reviewed one-hop lifecycle facts: 48 `AMENDS` facts and 55 `CORRECTS` facts. The verified artifact contains ten included Works, 95 boundary Works, 1,108 nodes, and 806 Articles. A boundary title remains absent when CELLAR supplies no English title; Earth does not manufacture one.
- Phase 3 is complete: Reagraph is lazy-loaded behind the renderer boundary and consumes only the pure `EarthRenderModel`. The real Banking 10 artifact passes graph focus, selection, progressive hierarchy, and structured-view checks. Chromium test-only 100/200/400 Work fixtures all reach a WebGL frame inside the eight-second release gate with no page errors, so Reagraph remains the current renderer candidate.
- Phase 4 is complete: boundary results are server-bounded to 100 by default and 200 maximum, with CELEX/official-title filtering, offset paging, total counts, and a matching structured UI. A selected included node can explicitly request an exact depth-one neighbourhood capped at 100 nodes and 150 edges, inspect official evidence, and return to the default aggregate view. Exact loaded relations never reference an omitted node, and there is no global reveal action.
- Phase 5 is in progress: automated Chromium fixtures cover 100/200/400 included Works, a paged 205-Work boundary, and aggregate/exact mode switching. Actual reviewed coverage remains Banking 10; promotion, rollback metadata, and representative larger official Universes remain release work.

## 11. Explicit non-goals for v0.2

- Earth does not replace or migrate the existing Platform pipeline.
- Earth does not read or write the existing Platform Runtime artifact.
- Runtime does not query EUR-Lex, CELLAR, SPARQL, Formex, or raw snapshots.
- No Neo4j, Redis, message queue, GraphQL, WebSocket, second Node service, or second deployment is introduced.
- No unrestricted graph query, recursive boundary traversal, whole-Universe exact reveal, AI relation, or semantic-inference relation is published.
- No second renderer is built before the Reagraph spike has a measured decision.

## 12. Success condition

Earth succeeds when a user can open a verified `EU Banking` Universe, understand the law-level landscape, focus a Work, progressively enter its official selected Expression hierarchy, inspect a bounded set of exact official relations with their evidence, and return to an accessible non-WebGL representation when needed. The same artifact and interaction model must remain viable when the editorial Universe grows from 10 to hundreds of laws.

## 13. Pause and continuation record — 2026-09-11

Earth development is intentionally paused after the Phase 4 interaction milestone so that work can move to Contextual Regulatory Copilot. This section is the hand-off record for resuming Earth without reconstructing decisions from chat history. The Git commit containing this section is the pause checkpoint; locate it with `git log -- docs/earth/earth.md`.

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

Resume with artifact release mechanics, not with additional UI features:

1. Define an Earth-only release manifest containing artifact hash, build ID, schema version, Universe ID/version, source snapshot IDs, creation time, and previous promoted release.
2. Add staged verification followed by atomic promotion to an immutable release path and a small current-release pointer. Define rollback as selecting an already verified prior release; never mutate an artifact in place.
3. Test failed verification, missing artifact, incompatible schema, promotion, restart, and rollback. Treat release-gate or contract changes as high-intensity review work.
4. Measure a representative larger **official** Universe only after its membership is editorially reviewed. Synthetic 100/200/400 fixtures prove renderer scale but do not authorize or define legal coverage.
5. Re-evaluate Reagraph after representative-device measurements. If it fails the agreed budget, replace only `src/earth/web/renderers/reagraph/`; preserve the Earth API, domain state, and pure render model.

### 13.5 Decisions that must not be reopened accidentally

- Earth remains one independently owned feature inside the existing TypeScript/Node application and deployment, not a second service and not a view over the Platform runtime artifact.
- Official acquisition happens at build time. Browser and runtime APIs never call CELLAR/EUR-Lex directly.
- Aggregate overview is the default. Exact relations load only through an explicit, server-bounded neighbourhood request; there is no global reveal.
- Boundary nodes are one-hop, metadata-only, paged, searchable, and non-recursive.
- The UI consumes only Earth API/domain projections. It does not import acquisition, parsing, SQLite, or official-source adapters.
- Missing titles, hierarchy, evidence, or source material fail closed or remain visibly absent; they are never invented or silently repaired.
- Expanding from Banking 10 to 100/200/400 actual laws is an editorial/legal coverage decision, not a technical auto-discovery step.
