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
  --snapshot-id full-corpus-en-2026-08-31-r2 \
  --as-of 2026-08-31 \
  --output exports/full-corpus-en-2026-08-31-r2
```

To export another already-built artifact, pass `--database <path>`. `--snapshot-id`, `--as-of`, and `--output` are mandatory. A snapshot ID uses lowercase letters, digits, `.`, `_`, and `-`. An existing output directory is never overwritten. The exporter writes to a staging directory, verifies the complete result, and only then promotes it to the requested path.

Run the independent handoff check before copying:

```bash
npm run rag:export:verify -- \
  --input exports/full-corpus-en-2026-08-31-r2
```

Generated snapshots live under ignored `exports/`; they are transfer artifacts, not a second Git-managed legal database.

The earlier local snapshot `full-corpus-en-2026-08-31` used contract 1.0.0 and is superseded because it did not preserve mixed text/list source order. Do not import it. Immutable snapshots are not repaired in place; the corrected handoff is the separately named `full-corpus-en-2026-08-31-r2` snapshot.

## Snapshot contract 1.1.0

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

The current contract is English-only. `documents.jsonl` emits one loaded Legal Work per line and embeds its single English Expression. It preserves Platform stable IDs, CELEX or authority-local identifiers, family, Level, measure type, official source, issuer names, source snapshot/version, and text-as-of date. Every Expression states `text_kind`, `currency_status`, the reviewed version-selection policy, and a fallback reason when the loaded text is not consolidated. `not_assessed` is an explicit review outcome and must not be interpreted as current.

Lifecycle, applicability dates, and legal effect remain `null` when the current Platform record does not assert them. Importers must preserve `null` as “not asserted”; they must not convert it to `active`, `current`, or `binding` by inference. `document_stage=published` only states that the loaded source is a published instrument.

`provisions.jsonl` contains every root Provision and nested Body Block with:

- stable `provision_id`, `document_id`, and `expression_id`;
- parent and root IDs;
- Article/paragraph/point/annex coordinates where the source structure supplies them;
- hierarchy path and exact source locator;
- a contiguous `document_order` within each Legal Work;
- `ordered_content_blocks`, interleaving direct text and child Provision references in exact source order;
- official source URL;
- `direct_text` for the entity's own source text;
- `text` for deterministic subtree text when children exist;
- `text_scope` so a RAG chunker can avoid accidental duplicate indexing.

Root Article records normally have `text_scope=subtree`. Paragraphs containing points also have subtree text; their point records remain independently addressable. A RAG importer should deliberately choose its chunk granularity instead of indexing every `text` field blindly.

The ordered-content contract is required for structures where a paragraph contains introductory text, a nested list, and a trailing subparagraph. The release verifier includes a reviewed semantic case for AMLD IV Article 13(1): its intro, points (a)–(d), and trailing text must remain in that order.

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
5. Select the RAG corpus explicitly by `document_id`, always importing a complete Legal Work with its Expression and all Provision records. A relationship must not pull an unselected document into the corpus automatically.
6. Preserve Expression/source snapshot/version fields with every generated chunk and citation.
7. Choose chunk granularity using `direct_text`, `text`, parent/root IDs, and `text_scope` to avoid duplicate indexing.
8. Import only accepted relationship review states. Treat `candidate` as retrieval assistance, not legal fact.
9. Build BM25/vector indexes and run RAG evaluations only after the deterministic import passes.
10. Atomically publish a new RAG release; retain the previous release for rollback.

The RAG importer must not use missing fields or an empty relationship result to conclude that a law, lifecycle state, or legal relationship does not exist.

## Current handoff strategy

Always export the complete compiled Profile. The receiving RAG project can compare stable IDs with its active release and select any complete Legal Works it accepts. Platform must not own a changing “RAG-only delta” configuration.

Export is receiver-initiated and is not a Platform release gate. Platform maintains the stable exporter and verified Runtime data; the RAG project decides when it needs a snapshot, runs or requests the export, imports it transactionally, and owns its own release cadence. Platform does not push snapshots, trigger RAG indexing, or track whether a Platform corpus release has been adopted by RAG.

`manifest.corpus_selection_policy` fixes this behavior as `selection_unit=complete_legal_work`, `auto_include_relationship_targets=false`, and `relationship_boundary=metadata_stub`. After document selection, the importer may retain a relationship crossing the selected boundary only by storing the unselected endpoint as the self-describing metadata stub already carried by the relationship record, or it may omit that relationship from the selected release. It must not create an incomplete full-text Document, invent missing Provision text, reverse the edge, or treat absence from the selected release as proof that the legal relationship does not exist. Relationships whose required selected-side endpoint is absent must be rejected rather than orphaned.

This makes selective import safe without weakening snapshot integrity: hash verification still applies to the complete handoff, while corpus selection is a deterministic receiving-project release step.

## Interoperability status and next-snapshot quality queue

Regulatory RAG has accepted Snapshot contract 1.1.0 for deterministic import. This does not change the boundary above: Platform exports the complete compiled Profile, while the receiving project chooses complete Legal Works for its own corpus. The current handoff does not require original PDF/XML files and does not give Platform any responsibility for RAG runtime, framework, API/MCP, vector, or index configuration.

Two non-blocking corrections are queued for the next ordinary Platform data update:

- `document_order` must follow the official reading order in the reviewed source. CSSF 12/552 is a known correction: its Introduction must precede Annex I rather than carrying a later order value.
- A consolidated Expression must distinguish the legal Work's original `date_document` from the verified consolidated-text cutoff. For CSSF 12/552, the 2012-12-11 document date must not be reused as `text_as_of` or an Expression date for the later consolidated text. When the consolidation cutoff cannot be confirmed from reviewed evidence, retain `currency_status=not_assessed` and do not infer it.

These corrections preserve Work IDs, Provision IDs, and relationship semantics. They must be released as a new complete immutable snapshot ID; never overwrite the existing r2 handoff.

## Deliberate 1.1 omissions

Snapshot 1.1.0 does not export chunks, embeddings, indexes, answers, UI data, or API/MCP transport. It also does not yet publish multilingual Expressions, the regulatory Domain/Topic taxonomy, applicability projections, or implementation timelines as separate interchange files. Those are future contract additions and must require a schema-version review rather than being smuggled into existing fields.
