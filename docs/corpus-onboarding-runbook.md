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

The repository currently provides separate commands for:

- EUR-Lex/CELLAR source list, fetch, and verification;
- CSSF source list, fetch, and verification;
- parser inspection and quality-gated Canonical publication;
- reviewed CELLAR, lifecycle, case-law, and Level 2 relationship inputs;
- atomic Runtime SQLite build and read-only verification;
- validated build-time Edition/Profile compilation with `full-corpus` and `banking-default`;
- exact-snapshot corpus manifest, end-to-end local orchestration, isolated Runtime artifact, and machine-readable build report;
- parser, relationship, search, performance, and release gates.

The implemented command is `npm run corpus:build -- --profile <profileId>`. The explicit acquisition and inspection steps below still apply when adding or refreshing a source; the orchestrator never fetches mutable current content in place of a missing pinned snapshot and never replaces legal review.

## Decide whether an adapter already exists

Before adding a source, classify it:

1. **Existing EUR-Lex Formex structure**: reuse the shared EUR-Lex adapter and parser.
2. **Existing CSSF HTML/PDF profile**: reuse the matching CSSF adapter and parser profile.
3. **Known authority, materially different structure**: add a bounded parser profile and fixtures.
4. **New authority or media type**: add one reusable Source Adapter, snapshot contract, parser fixtures, and quality gate before publishing documents from it.

A source-specific adapter may preserve source semantics. It must still emit the common Canonical contract. Do not add law-specific parsing or legal data to React components.

## Add an EUR-Lex law using the current commands

### 1. Register and validate

Add the reviewed CELEX, English ELI URL, aliases, `familyId`, `regulatoryLevel`, `measureType`, and bounded source-status metadata to `data/source-registry.json`.

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

Cellar may expose an older act as one multi-item FMX4 manifestation instead of one downloadable ZIP. The acquisition layer must preserve all byte-exact official ACT/ANNEX/DOC XML items and their individual response metadata/hashes in snapshot schema `1.1.0`; it may assemble only a deterministic transport ZIP at the raw boundary. Do not choose the first XML item by response order, because legacy manifests can list an Annex before the ACT. `source:verify` checks both the assembled package hash and every recorded upstream item before Canonical parsing.

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

The command requires the manifest source set to match both source registries exactly, verifies every snapshot and reviewed quality baseline, hashes required reviewed relationship/Profile inputs, rebuilds every Canonical document through its existing builder, and verifies the resulting staging SQLite through the read-only Runtime services. Generated Canonical files, SQLite, and `build-report.json` stay under ignored `data/artifacts/corpus-builds/`; promotion remains separate.

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

## Corpus orchestration

Use:

```bash
npm run corpus:build -- --profile <profileId>
```

The orchestrator:

1. read version-controlled source and Profile manifests;
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
