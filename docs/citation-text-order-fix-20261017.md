# Citation text order — 2026-10-17

The internal citation service now projects the existing Reader `orderedContent` sequence instead of flattening each parent's aggregate text before its children. This fixes misplaced trailing text in CRD Articles 74, 76 and 88 without changing legal sources, parsers, Canonical contracts, Runtime artifacts, stable IDs, legal relationships or search ranking.

Previously: parent `[before + after]` → point (a) → point (b).

Now: parent `[before]` → point (a) → point (b) → the same parent `[after]`.

## Internal contract migration

- CitationContext schema and `stable-entity-id` method are **1.1.0**. The enclosing CitationRetrieval response schema is also **1.1.0**; its unchanged FTS retrieval algorithm remains **1.0.0**. Public API and MCP DTOs are not changed.
- Each text segment is one exact, untrimmed Reader text run. Adjacent runs are not merged. A stable `entityId` can legitimately appear multiple times: do not deduplicate segments by entity ID.
- `contentIndex` is the original index in that entity's `BodyBlock.orderedContent` array. `(entityId, contentIndex)` locates a run only within the same source version/Runtime identity; it is **not** a new stable citation ID or character offset in the official XML/PDF. Existing anchor, kind, marker and source locator are retained.
- `marker` describes the owning block; it is not an instruction to prefix every run. Projection metadata declares `scope: text-only`, `order: reader-ordered-content`, `markerInsertion: none` and `omittedResourceCount`. Literal markers already in source text are not removed.
- Formula resources are counted by occurrence in the selected subtree but not OCRed, replaced with invented text or merged across. If `omittedResourceCount > 0`, text alone is incomplete: open the Reader/structured body to inspect formulas. Even when zero, this remains the normalized Reader body, not a reproduction of footnotes, numbering or original formatting.
- An existing empty or formula-only target can return `textSegments: []`; unknown or Profile-excluded IDs still return `null`/HTTP 404. The response retains target/source identity even if it has no text.
- Missing, duplicate, unconsumed or reordered direct-child references fail closed. Duplicate/cyclic entity IDs are rejected, with only the existing unique top-level owning-provision leaf alias allowed. Corrupted loaded evidence throws instead of silently falling back to another target or the root. Relationships/context missing for a loaded entity are also corruption, not a not-found result.

Consumers must parse the new inner and outer schemas, retain array order and repeated entity IDs, and respect resource omissions. Do not silently relabel an old 1.0 payload as 1.1.

## Evidence and frozen benchmarks

The [projection review receipt](../data/editorial/citation-text-projection-review.json) records old file checksums and the three changed CRD projection hashes. The original datasets and the July-CRD datasets remain byte-for-byte unchanged. New defaults are `banking-governance-tasks-ordered-1.1.json` and the separately selected `banking-governance-holdout-ordered-1.1.json`. Questions, gold entity IDs, source pins, locators and source URLs are identical to the July-CRD datasets; only projection hashes, dataset version and review date change. These are already-seen migration regressions, not a new unseen holdout.

No currency acquisition was repeated: the workflow continues using the matching **2026-10-16** source review. This change makes no new latest-law, institutional-applicability or real-user-value claim.

## Verification

Targeted tests compare all **197 CRD Article bodies** with an independent traversal of the pinned official XML (notes/numbering/Article headings excluded, whitespace ignored, wording/punctuation/order significant). They also project all loaded provision roots, verify source lineage for split runs, and cover nested lists, text-only/child-only blocks, legitimate leaf aliases, empty/formula-only full-schema responses, corrupted-reference failures and no-root-fallback behavior. The whole-corpus traversal covers 6,769 provision roots / 47,058 Body Blocks / 280 resource occurrences in the current 101-Document artifact.

```sh
npm run check
npm test
npm run build
npm run runtime:verify
npm run citation:benchmark
npm run banking:benchmark
npm run banking:benchmark -- --dataset data/benchmarks/banking-governance-holdout-ordered-1.1.json
npm run banking:workflows
```

- `npm run check`, production build and Runtime verification passed. The data artifact remains `runtime-5.8.0-cb05a18e23c314da` with 101 Documents and zero reviewed-input issues: no source/parser rebuild or corpus growth is required for this service fix.
- Citation Top-1 gate: **3/3**, unchanged. Ordered 18-task dataset: **18/18** evidence/navigation, **15/18** global and **17/18** scoped Top-5 retrieval. Rebased six-task dataset: **6/6** evidence/navigation, **3/6** global and **5/6** scoped. Three workflow walkthroughs passed; this remains technical evidence, not user acceptance.
- Browser/HTTP regression: **5/5** passed, including actual nested 1.1 payloads, split-run indices/order, unchanged Reader text/date, document scope, CSSF navigation and legal relationship directions. Public API/OpenAPI/MCP regressions also passed in the full run.

Full test suite: **102 files / 427 tests passed** in 475.95 seconds. The repository-required Sol High review covered the projection, versioning, stable-ID alias exception and failure semantics before finalization. Raw sources and generated reports remain ignored; this task does not deploy or push a remote release.
