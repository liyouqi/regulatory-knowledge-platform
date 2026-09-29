# Corpus Onboarding Runbook

This runbook defines how a new law or official regulatory document enters the platform without hidden manual state. It covers data production; runtime promotion and rollback remain in `docs/runtime-operation-runbook.md`.

## Non-negotiable outcome

Every published document must be reproducible from:

- a version-controlled source registry entry;
- an immutable official-source snapshot and checksum;
- a versioned adapter/parser;
- a reviewed quality baseline;
- version-controlled legal-semantic mappings where needed;
- a validated Edition/Profile configuration;
- deterministic Canonical and Runtime builders.

Official text is never invented, corrected, or silently replaced. Parser output, Canonical data, reviewed enrichment, Runtime SQLite, and UI remain separate.

## What is implemented now

The repository keeps source-specific commands as diagnostic tools, while normal maintenance has one entry point. Internally it provides:

- EUR-Lex/CELLAR source list, fetch, and verification;
- CSSF source list, fetch, and verification;
- EBA source list, fetch, and verification;
- parser inspection and quality-gated Canonical publication;
- reviewed CELLAR, lifecycle, case-law, and Level 2 relationship inputs;
- atomic Runtime SQLite build and read-only verification;
- validated build-time Edition/Profile compilation with `full-corpus` and `banking-default`;
- exact-snapshot corpus manifest, end-to-end local orchestration, isolated Runtime artifact, and machine-readable build report;
- parser, relationship, search, performance, and release gates.

The normal maintenance command is `npm run corpus:update`; `corpus:refresh` remains a compatibility alias. The reproducible release command is `npm run corpus:build -- --profile <profileId>`. The explicit acquisition and inspection steps below remain diagnostic/review tools when a source changes; neither orchestrator replaces legal review.

For EUR-Lex laws, `data/source-registry.json` is also the small human-readable corpus catalog. Its lifecycle has only three values:

- `active`: reviewed and included in the normal Runtime workflow;
- `queued`: downloaded and parsed as an isolated onboarding candidate on the next `corpus:update`;
- `planned`: visible backlog only; it is not fetched or published.

An `active` or `queued` row contains the existing source fields. A `planned` row may contain only `status`, `batch`, `familyId`, `shortName`, and `celex`. Temporary outcomes such as source failure or parser failure are not maintained in this file; they are written to the refresh report. CSSF and EBA retain their existing adapter-specific registries because their source contracts differ from EUR-Lex, but require no additional day-to-day command.

## Refresh the current experimental corpus

Daily development and first setup use a separate current-source workflow:

```bash
npm run corpus:update
```

This command downloads the currently selected official bytes for every registered EUR-Lex, CSSF, and EBA source, audits all registered EUR-Lex acts from the verified CELLAR tree notices already stored in those snapshots, selects the newest verified local snapshot, runs the existing Canonical parsers, validates the version-controlled reviewed datasets, atomically rebuilds the default Runtime SQLite, and verifies that artifact through the read-only Reader/Search services. Use `--skip-fetch` for a fully local rebuild; that mode performs the same audit from local tree notices and marks it as not freshly fetched.

The same command also processes every `queued` EUR-Lex row. It fetches the official source, parses a candidate under ignored `data/artifacts/onboarding/`, and records a suggested quality baseline as `review-required`; a failure is recorded as `blocked` without removing any active Reader document. Queued and planned rows never enter Canonical production selection, the Runtime, strict manifests, or RAG exports. After review, promoting a row means adding the reviewed quality data, changing its status to `active`, and pinning the exact snapshot in the release manifest. Routine users still operate one command and read one report at `data/artifacts/refresh/build-report.json`.

Normally no arguments are needed. For a large catalog, the same command may be limited to one configured batch with `npm run corpus:update -- --batch <batch-id>`; only acquisition and Canonical preparation are limited, while the resulting Runtime is still rebuilt from the complete active corpus so unrelated Reader documents do not disappear.

The audit is advisory. A newer effective expression is written as `review-required` only when the official notice exposes an English Formex manifestation; a consolidated work available only in another language is not a usable English Reader candidate. The audit never edits `source-registry.json`, `document-expressions.json`, the exact-snapshot manifest, release-pinned Runtime selection, or a RAG export. Future expressions are counted but never selected. This preserves the small human gate without requiring a different discovery command.

Repeated retrieval of unchanged official content may produce several immutable retrieval directories with the same content-based `snapshotId`. The strict manifest build selects the lexicographically earliest matching retrieval, preserving the originally reviewed instance; later retrievals remain available as audit history and do not make the pin ambiguous or move the release forward.

The data ownership boundary is intentional:

- large official snapshots and derived Canonical/Runtime artifacts stay ignored because they can be downloaded and rebuilt;
- small reviewed mappings, topics, applicability rules, metadata, registries, and Profiles stay in Git because they contain human-reviewed semantics that downloading a PDF cannot reproduce.

Current-source update does not pretend that a new official version has already been reviewed. Parser count/hash differences are recorded as `qualityDrift` in `data/artifacts/refresh/build-report.json`. A reviewed record whose Document/provision/evidence endpoint no longer validates is omitted from that experimental Runtime and recorded under `reviewedInputIssues`; it is never retargeted automatically. Review the source change, update the affected Git dataset and quality baseline, run its targeted fixtures/evals, and commit those small changes.

This tolerant behavior applies only to experimental update, local development, and ordinary test setup. `npm run corpus:build`, `npm run runtime:build` without `--review-mode report`, and release verification remain strict, pinned review gates.

## Decide whether an adapter already exists

Before adding a source, classify it:

1. **Existing EUR-Lex Formex structure**: reuse the shared EUR-Lex adapter and parser.
2. **Existing CSSF HTML/PDF profile**: reuse the matching CSSF adapter and parser profile.
3. **Existing EBA Guidelines PDF profile**: reuse the EBA authority adapter and add a bounded, reviewed document-body profile when page boundaries differ.
4. **Known authority, materially different structure**: add a bounded parser profile and fixtures.
5. **New authority or media type**: add one reusable Source Adapter, snapshot contract, parser fixtures, and quality gate before publishing documents from it.

A source-specific adapter may preserve source semantics. It must still emit the common Canonical contract. Do not add law-specific parsing or legal data to React components.

## Add an EUR-Lex law using the current commands

### 1. Register and validate

Add the reviewed CELEX, English ELI URL, aliases, `familyId`, `regulatoryLevel`, `measureType`, and bounded source-status metadata to `data/source-registry.json`.

The base `celex` remains the stable Legal Work identifier. By default, acquisition reads that act's original-OJ expression. To publish a reviewed consolidated expression, also pin its dated `expressionCelex` (for example `02013R0575-20260626`), set `sourceStatus.basis` to `consolidated`, and make `textAsOf` match the expression date. Never select a future consolidated expression merely because CELLAR has already published it; the pinned expression must be effective on the review date. A consolidated expression does not replace or delete earlier immutable raw snapshots.

```bash
npm run source:list
npm test
```

Aliases and identifiers must be unique and verified. A Registry entry is a source declaration, not proof that the document has passed parser quality gates.

### 2. Fetch and verify the immutable source

```bash
npm run source:fetch -- --celex <CELEX>
npm run source:verify -- --snapshot data/raw/eur-lex/<CELEX>/<snapshot-directory>
```

Keep the printed snapshot identifier and SHA-256 values. `data/raw/` is ignored by Git and must not be edited.

Consolidated expressions use the `CONS.ACT` Formex root and can contain inline `CONS.ANNEX` elements. The shared parser preserves the base-law stable IDs while binding Canonical output to the exact dated expression.

Cellar may expose an older act as one multi-item FMX4 manifestation instead of one downloadable ZIP. The acquisition layer must preserve all byte-exact official ACT/ANNEX/DOC XML items and their individual response metadata/hashes in snapshot schema `1.1.0`; it may assemble only a deterministic transport ZIP at the raw boundary. Do not choose the first XML item by response order, because legacy manifests can list an Annex before the ACT. `source:verify` checks both the assembled package hash and every recorded upstream item before Canonical parsing.

Formex packages may also contain packaging-only Annex wrappers and TIFF formula resources. The shared package boundary removes an Annex only when it delegates to another ANNEX document through `TYPE="FORMEX.DOC"`; the referenced leaf Annex remains subject to normal count/hash gates. Formula TIFFs remain official source bytes. Canonical build creates a lossless PNG rendition, records both hashes, and binds the resource to its exact `orderedContent` position. Never OCR a formula into purported legal text or publish a formula-bearing act with the resource silently omitted.

### 3. Inspect before publication

```bash
npm run canonical:inspect -- --snapshot data/raw/eur-lex/<CELEX>/<snapshot-directory>
```

Compare the official source with reported Articles, Recitals, Annexes, paragraphs, points, structural nodes, warnings, and suggested text anchors. Add the complete reviewed quality baseline to the source registry. Never lower a baseline solely to make a build pass.

If the structure is materially new, stop and add a targeted parser fixture before continuing.

### 4. Publish the immutable Canonical artifact

```bash
npm run canonical:build -- --snapshot data/raw/eur-lex/<CELEX>/<snapshot-directory>
```

Canonical output under `data/artifacts/canonical/` is generated and ignored by Git. The reviewed source registry, quality baseline, fixtures, and parser code are the version-controlled production inputs.

### 5. Add reviewed semantic data only when applicable

Examples include:

- Level 1 ↔ RTS/ITS mappings in `data/official-mappings/`;
- reviewed CELLAR metadata in `data/official-metadata/`;
- future Domain, Authority, jurisdiction, legal-nature, and Profile assignments.

Each relationship type must define direction, allowed endpoint types, provenance, evidence, and review status. Automatic candidates do not become published legal relationships until their gate passes.

### 6. Pin the reviewed snapshot and build the product artifact

Add the exact `snapshotId`, content SHA-256, adapter, identifier, and retention status to `data/corpus-build-manifest.json`, then run:

```bash
npm run corpus:build -- --profile <profileId>
npm run check
npm test
npm run build
```

The command requires the manifest source set to match all three source registries exactly, verifies every snapshot and reviewed quality baseline, hashes required reviewed relationship/Profile inputs, rebuilds every Canonical document through its existing builder, and verifies the resulting staging SQLite through the read-only Runtime services. Generated Canonical files, SQLite, and `build-report.json` stay under ignored `data/artifacts/corpus-builds/`; promotion remains separate.

For local application testing, run `REGULATORY_EDITION_PROFILE=<profileId> npm run dev` so the `predev` build uses the intended Profile. Production serves the already verified SQLite artifact and does not compile or switch Profiles at startup.

Run dedicated parser, relationship, or search fixtures/evals when the corresponding behavior changed. `npm run release:verify` verifies the assembled corpus but does not fetch sources or rebuild every Canonical artifact from raw snapshots.

### 7. Verify all delivery surfaces

Confirm that the new document is consistent in:

- Find Laws and full-text search;
- Reader and Explorer routes;
- Definitions;
- family/Level 2 Library when applicable;
- Article, Document, and Global relationship graphs;
- runtime manifest and `/api/health` corpus counts;
- every intended Edition/Profile, including proof that excluded Profiles cannot access it by direct URL.

## Add several laws in one domain

For a batch such as four payment laws:

1. review the batch scope and official sources together;
2. process each source through fetch → verify → inspect → quality baseline → Canonical build;
3. review cross-document relationships and domain/profile assignments as one bounded dataset;
4. build Runtime once after all Canonical artifacts pass;
5. run corpus-level tests, benchmarks, and delivery checks;
6. publish one build report listing successful, failed, and deliberately deferred documents.

The batch is not “four file imports.” Acquisition and parsing are deterministic; legal nature, applicability, taxonomy, and ambiguous relationship semantics remain explicit review gates.

## Add an EBA guideline using the current commands

Register its official page/PDF, stable `eu:eba:*` Document ID, family, aliases, publication date, and Level 3 measure type in `data/eba-source-registry.json`. Then run:

```bash
npm run eba:source:list
npm run eba:source:fetch -- --id <local-id>
npm run eba:source:verify -- --snapshot data/raw/eba/<local-id>/<snapshot-directory>
npm run eba:canonical:inspect -- --snapshot data/raw/eba/<local-id>/<snapshot-directory>
npm run eba:canonical:build -- --snapshot data/raw/eba/<local-id>/<snapshot-directory>
```

Inspection must identify the exact legal-body page range separately from cover/report/consultation material, preserve numbered provisions and annexes, and publish count/hash gates before the source enters the corpus manifest. Record guideline legal nature and status in reviewed official metadata; record Domain assignments separately as editorial data. A CRD/CRR or other legal-basis relation becomes a published edge only through an evidence-checked reviewed mapping.

## Corpus orchestration

Use:

```bash
npm run corpus:build -- --profile <profileId>
```

The orchestrator:

1. read version-controlled EUR-Lex, CSSF, EBA, and Profile manifests;
2. locate the exact approved local snapshots pinned by ID and checksum;
3. verify checksums;
4. run existing Canonical builders without duplicating parser logic;
5. fail on missing quality baselines or review gates;
6. compile the Profile corpus;
7. build relationships, definitions, and search records from that same corpus;
8. build and verify a staging SQLite artifact;
9. write a machine-readable build report;
10. leave promotion as a separate explicit operation.

It deliberately does not auto-fetch when a pinned snapshot is missing: run the source fetch/inspect/review flow and update the manifest explicitly. The command is deterministic and runnable without Codex or an LLM. Statistical or model-assisted enrichments remain optional builders with method/model/prompt version provenance and representative evals.

## Snapshot retention

Local raw and generated artifacts remain ignored by Git. Every manifest entry records `retention.status`; all current snapshots are explicitly `local-only`. For a production release, preserve the exact raw snapshots in content-addressed object storage with retention/versioning, change the entry to `archived` with a reviewed `gs://`, `s3://`, or HTTPS locator, and run `npm run corpus:build -- --profile <profileId> --require-archived`. The archive gate fails if even one source remains local-only. The command validates archive declarations but does not upload or download objects; storage credentials and lifecycle policy stay outside the application.

## Definition of done

A new document is onboarded only when:

- official-source identity and snapshot checks pass;
- Canonical validation and reviewed fidelity baselines pass;
- parser warnings are understood and bounded;
- stable IDs and official text hashes are tested;
- semantic mappings are reviewed or explicitly absent;
- intended Profile inclusion/exclusion is tested;
- Runtime build, verification, ordinary gates, and dedicated gates pass;
- the build report records source, parser, schema, Profile, relationship, and Runtime identities;
- known limitations and deferred 1→100 work are added to `docs/coverage-backlog.md`.
