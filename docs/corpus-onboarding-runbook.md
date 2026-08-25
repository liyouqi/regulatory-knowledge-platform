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
- parser, relationship, search, performance, and release gates.

It does not yet provide a single end-to-end `corpus:build` command or Edition/Profile compiler. Until those are implemented, use the explicit steps below. Do not create an unreviewed one-off import script to bypass them.

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

### 6. Build and verify the product artifact

```bash
npm run runtime:build
npm run runtime:verify
npm run check
npm test
npm run build
```

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

## Target orchestration before the next batch

The next corpus expansion must introduce a thin command with the intended interface:

```bash
npm run corpus:build -- --profile <profileId>
```

The orchestrator should:

1. read version-controlled source and Profile manifests;
2. locate or fetch approved snapshots;
3. verify checksums;
4. run existing Canonical builders without duplicating parser logic;
5. fail on missing quality baselines or review gates;
6. compile the Profile corpus;
7. build relationships, definitions, and search records from that same corpus;
8. build and verify a staging SQLite artifact;
9. write a machine-readable build report;
10. leave promotion as a separate explicit operation.

The command must be deterministic and runnable without Codex or an LLM. Statistical or model-assisted enrichments remain optional builders with method/model/prompt version provenance and representative evals.

## Snapshot retention

Local raw and generated artifacts remain ignored by Git. For a production release, preserve the exact raw snapshots in content-addressed object storage with retention/versioning, and record their locators and checksums in the release record. Without the archived input, a future fetch can rebuild the then-current official content but cannot guarantee byte-for-byte reproduction of a lost historical source response.

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
