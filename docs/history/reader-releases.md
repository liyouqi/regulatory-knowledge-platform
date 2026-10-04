# Reader Release History

Historical implementation and verification notes extracted from the project README on 2026-10-03. Counts, test results, tags and phrases such as “in progress” describe their recorded checkpoints; they are not a fresh deployment or test report.

For documented phase status and remaining scope, use the [coverage backlog](../coverage-backlog.md). For the generated Reader publication inventory, use [corpus status](../corpus-status.md). Start with the [documentation index](../README.md) for current operating guides.

## Recorded release checkpoints

Annotated Git tag `v0.1.0` marks commit `4b485b6` as the first usable product release. The earlier `phase-1.0.0` and `phase-2.0.0` tags retain their respective milestones. `phase-3.0.0` marks the validated bounded regulatory-intelligence release: Topics, timeline, decision, applicability, regulatory path, banking pilot, and internal citation retrieval all reuse the same read-only Runtime contract; GraphDB evaluation and all 1→100 expansion remain deferred.

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

The explicit-reference portion of Release 0.4 is complete locally. Exact, document-scoped defined-term hover/focus and official-definition Side Peek are also implemented from the normalized SQLite definition records; ambiguous terms and inferred variants remain unlinked.

Release 0.5 is complete and includes:

- full official ingestion, Reader, Explorer, and search coverage for DORA Delegated Regulation (EU) 2024/1774 and MiCA Delegated Regulation (EU) 2025/305;
- full official ingestion and reviewed Article 28(10) mapping for DORA Delegated Regulation (EU) 2024/1773 (ICT third-party contractual-policy RTS);
- full official ingestion and reviewed Article 18 mapping for DORA Delegated Regulation (EU) 2024/1772 (incident classification and materiality-threshold RTS);
- full official ingestion, four Annexes, reviewed Article 28(9) mapping, and the first real ITS filter for DORA Implementing Regulation (EU) 2024/2956;
- full official ingestion and reviewed Article 20 mapping for DORA Delegated Regulation (EU) 2025/301 (major ICT incident reporting-content and time-limit RTS);
- full official ingestion, four Annexes, and reviewed Article 20 mapping for DORA Implementing Regulation (EU) 2025/302 (major ICT incident reporting forms, templates, and procedures ITS);
- a minimal legal-text status contract that distinguishes original OJ text from a current EUR-Lex version and exposes known corrigenda in Reader and Level 2 Library;
- version-controlled, schema-validated DORA/MiCA mapping evidence;
- `official-mapping@1.0.0` paired `MANDATES` / `ADOPTED_UNDER` edges in the unified SQLite relationship store;
- separate relationship API groups and responsive Reader presentation with official-evidence links;
- direct-Article Formex support with a parser fixture and parser version `1.3.0`;
- desktop and 390px browser verification of DORA Article 15, reverse RTS legal bases, and exact MiCA RTS search.

The family-level RTS/ITS library and Level 1 summary counts are now implemented from the runtime SQLite data: `/library/dora`, `/library/mica`, and their `/rts` or `/its` filters list official measures, mandate Articles when a reviewed mapping exists, Reader/Explorer links, source status, and official sources without duplicating the curated mapping input. The DORA incident-reporting RTS/ITS pair is complete. Seven further DORA EUR-Lex acts from the shared RAG inventory are now loaded through the same Formex pipeline; they do not receive invented mandate edges where no Platform-reviewed mapping exists. The reviewed DORA/GDPR/AI Act TF-IDF benchmark passes 8/8 at Top 5, so build-time Related Recitals are enabled for those three laws with explicit `TFIDF` provenance and retained similarity scores. Additional Level 2 semantic mappings remain an explicitly reviewed 1→100 backlog, not a corpus-ingestion blocker.

Phase 2 is now in progress. Its relationship graph delivery includes a focused Article graph at `/relationships/:slug/:collection/:number`, a Document graph at `/relationships/:slug`, and a global network at `/relationships`. The Article view remains exact-provision scoped; the Document view collapses only cross-document edges onto their stable document entities and combines legal-text references, reviewed Level 2 mappings, and reviewed CELLAR metadata without changing the underlying relationship records. The global view uses that same read-only runtime projection: all loaded regulations are visible by default, while metadata-only CJEU Cases and external CELLAR Works are optional layers. Explorer provides the Document entry, Article graphs link to the broader Document view, and every loaded Document node can open its focused graph. All views support relation-type filters, state-backed node dragging, pan/zoom, an explicit provenance legend, and an on-demand source Side Peek. The graph UI remains route-lazy-loaded, so the visualization dependency does not increase the Reader/Explorer initial JavaScript bundle.

The first bounded structured relationship query is available at `/relationship-queries/level-2-mandates` (also linked from every relationship graph). It is deliberately a fixed query template, not AI or free-text understanding: choose a DORA Article and it returns only its reviewed `MANDATES` edges, including stable IDs, exact mapping evidence, the official evidence URL, and Reader links. It defaults to DORA Article 28, where the currently reviewed data returns both the register-of-information ITS 2024/2956 and the ICT third-party-policy RTS 2024/1773. A missing result means that no reviewed mapping is published for that Article; it does not mean that no legal relationship exists.

The second Phase 2 slice publishes the 12 reviewed closed-corpus CELLAR structural relations described above without changing the Canonical contract. The next bounded slice adds the separately reviewed external-Work contract. The current Runtime reports 4,420 resolved loaded-entity relationships, plus 65 lifecycle relationships, 63 external Works, 72 CJEU Case entities, and 72 Act-level `INTERPRETS` relationships in the default `full-corpus` Profile; newly loaded documents contribute only deterministic legal-text references unless a separate reviewed mapping exists. The reviewed CELLAR datasets remain explicitly based on their earlier bounded snapshot; loading another source does not silently claim new CELLAR metadata edges. The Document graph displays the 24 `AMENDS`, 41 `CORRECTS`, and GDPR's 72 metadata-only CJEU edges; the Global Network preserves these same nodes and edges as optional metadata layers rather than duplicating them. The CJEU dataset preserves 71 judgments and one order exactly as classified by their official English titles; two joined-case CELEX records remain explicitly unavailable without fallback. Judgment text and Article/paragraph citation inference are not part of this slice, so Case nodes open official CELLAR metadata rather than local text. Complete consolidated lineage, Article-level amendment provenance, additional CELLAR predicates, and Article-level CJEU delivery remain separately reviewed work.
