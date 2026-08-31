# Platform → RAG Offline Snapshot

## Purpose and boundary

The Platform is the deterministic source for legal works, official text structure, stable IDs, and published relationships. Regulatory RAG remains responsible for corpus selection, chunking, BM25, vectors, hybrid retrieval, query planning, answers, and retrieval/QA evaluation.

The handoff is an immutable file snapshot. RAG has no runtime dependency on the Platform API, MCP server, SQLite schema, GraphDB, or network access.

```text
reviewed source and metadata
→ Canonical build
→ compiled Edition/Profile Runtime
→ runtime verification
→ offline RAG snapshot
→ manual copy
→ transactional RAG import and release build
```

The exporter opens the existing Runtime SQLite in read-only/query-only mode. It does not invoke source acquisition, inspect websites, parse raw files, or silently refresh legal data.

## Export

Build and verify the desired Profile first. The exporter does not dynamically change Profile scope:

```bash
npm run runtime:build -- --profile full-corpus
npm run runtime:verify
npm run rag:export -- \
  --snapshot-id full-corpus-en-2026-08-31 \
  --as-of 2026-08-31 \
  --output exports/full-corpus-en-2026-08-31
```

To export another already-built artifact, pass `--database <path>`. `--snapshot-id`, `--as-of`, and `--output` are mandatory. A snapshot ID uses lowercase letters, digits, `.`, `_`, and `-`. An existing output directory is never overwritten. The exporter writes to a staging directory, verifies the complete result, and only then promotes it to the requested path.

Run the independent handoff check before copying:

```bash
npm run rag:export:verify -- \
  --input exports/full-corpus-en-2026-08-31
```

Generated snapshots live under ignored `exports/`; they are transfer artifacts, not a second Git-managed legal database.

## Snapshot contract 1.0.0

```text
regulatory-export-<snapshot-id>/
├── manifest.json
├── documents.jsonl
├── provisions.jsonl
└── relationships.jsonl
```

Every JSONL line is one complete UTF-8 JSON object. Every file ends in a newline. `manifest.json` records:

- snapshot ID, creation time, legal-state cutoff date, and language;
- compiled Profile ID/version/hash;
- Runtime schema/build identity;
- record counts;
- byte size and SHA-256 of every JSONL file;
- export schema and generator versions.

The current contract is English-only. `documents.jsonl` emits one loaded Legal Work per line and embeds its single English Expression. It preserves Platform stable IDs, CELEX or authority-local identifiers, family, Level, measure type, official source, source snapshot/version, and text-as-of date.

Lifecycle, applicability dates, and legal effect remain `null` when the current Platform record does not assert them. Importers must preserve `null` as “not asserted”; they must not convert it to `active`, `current`, or `binding` by inference. `document_stage=published` only states that the loaded source is a published instrument.

`provisions.jsonl` contains every root Provision and nested Body Block with:

- stable `provision_id`, `document_id`, and `expression_id`;
- parent and root IDs;
- Article/paragraph/point/annex coordinates where the source structure supplies them;
- hierarchy path and exact source locator;
- official source URL;
- `direct_text` for the entity's own source text;
- `text` for deterministic subtree text when children exist;
- `text_scope` so a RAG chunker can avoid accidental duplicate indexing.

Root Article records normally have `text_scope=subtree`. Paragraphs containing points also have subtree text; their point records remain independently addressable. A RAG importer should deliberately choose its chunk granularity instead of indexing every `text` field blindly.

`relationships.jsonl` preserves relationship direction, Platform type, RAG-friendly normalized type, stable endpoints, exact evidence, official source, provenance, builder identity, resolution status, and per-record review status. It includes:

- loaded Document/Provision relationships;
- lifecycle `AMENDS` and `CORRECTS` relationships, including metadata-only external Works;
- metadata-only CJEU `INTERPRETS` relationships;
- reviewed supervisory-decision `FINDS_VIOLATION_OF` findings.

For `MANDATES`, `relationship_type` is `mandates_rts` or `mandates_its` when the loaded target measure type proves that distinction; `platform_relationship_type` remains `MANDATES`. TF-IDF Article↔Recital edges are exported as `candidate`, never as reviewed legal truth. Direct legal-text references are `validated`; reviewed official mappings and metadata are `reviewed`.

Case, Decision, and external Legal Work endpoints are self-describing relationship endpoints but are not misrepresented as loaded full-text documents. For example, a CJEU case relation contains case metadata and an official URL, not judgment text.

## Required RAG import behavior

The receiving project should implement the following sequence:

1. Reject an unsupported `schema_version` or generator contract.
2. Verify all file hashes, byte sizes, and counts before parsing into a release.
3. Parse JSONL into a staging area; never mutate an active RAG release in place.
4. Key Legal Works and provisions by the Platform stable IDs. Keep any legacy RAG ID as an alias/mapping, not as a replacement identity.
5. Select the RAG corpus explicitly by `document_id`; a relationship must not pull an unselected document into the corpus automatically.
6. Preserve Expression/source snapshot/version fields with every generated chunk and citation.
7. Choose chunk granularity using `direct_text`, `text`, parent/root IDs, and `text_scope` to avoid duplicate indexing.
8. Import only accepted relationship review states. Treat `candidate` as retrieval assistance, not legal fact.
9. Build BM25/vector indexes and run RAG evaluations only after the deterministic import passes.
10. Atomically publish a new RAG release; retain the previous release for rollback.

The RAG importer must not use missing fields or an empty relationship result to conclude that a law, lifecycle state, or legal relationship does not exist.

## Current handoff strategy

Always export the complete compiled Profile. The receiving RAG project can compare stable IDs with its active release and select the missing works. Platform must not own a changing “RAG-only delta” configuration.

At the current 2026-08-31 boundary, Platform has nine loaded works absent from the RAG release used for the comparison: AI Act, MiCA, NIS2, Data Act, CRD IV, MiCA CASP Authorisation RTS, CSSF Circular 12/552, the CSSF 2025 ICT-risk communication, and EBA/GL/2021/05. The same full snapshot also carries Platform relationship evidence around shared works such as DORA and GDPR, allowing RAG to add semantic data without downloading those legal texts again.

## Deliberate v1 omissions

Snapshot 1.0.0 does not export chunks, embeddings, indexes, answers, UI data, or API/MCP transport. It also does not yet publish multilingual Expressions, the regulatory Domain/Topic taxonomy, applicability projections, or implementation timelines as separate interchange files. Those are future contract additions and must require a schema-version review rather than being smuggled into existing fields.
