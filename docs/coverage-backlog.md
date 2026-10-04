# Coverage Backlog

This document prevents Phase completion and future corpus expansion from depending on memory. It records bounded 0→1 capability slices separately from unbounded 1→100 coverage.

Statuses are `planned`, `in-progress`, `validated`, or `deferred`. A coverage item becomes `validated` only after the onboarding and release gates in `docs/corpus-onboarding-runbook.md` pass.

## Product direction

Maintain one European Financial Regulatory Knowledge Platform with one codebase, Canonical Contract, stable-ID system, relationship model, and corpus pipeline. Build multiple Edition/Profile artifacts rather than separate banking, funds, insurance, payments, or digital-assets platforms.

The visible Web product and the Agent/RAG data product consume the same reviewed legal data. Phase 4 Public API/MCP adapts stable services; it does not become a second ingestion pipeline.

## Phase 2 bounded completion

| Capability | 0→1 completion | Later 1→100 work | Status |
|---|---|---|---|
| Relationship graph | Article, Document, and Global projections over one runtime dataset | richer layouts and larger relation coverage | validated |
| CELLAR relations | reviewed closed-corpus and external-Work examples | more predicates and broader neighborhoods | validated |
| Version lifecycle | bounded version-chain plus amendment/corrigendum metadata | consolidated lineage, comparison, Article provenance | validated |
| CJEU | metadata-only Act-level interpretation graph | judgment text and Article/paragraph citations | validated |
| Level 2 | representative DORA/MiCA RTS/ITS and reporting pair | additional RTS/ITS/Guidelines/Q&A | validated |
| Edition/Profile | one `banking-default` build-time compilation with route/search/graph isolation | funds, insurance, payments, digital-assets and institution-specific profiles | validated |
| Structured relation query | one deterministic evidence-bearing query over existing relations | advanced relation-aware search combinations | validated |
| Deployment closure | immutable Cloud Run release, health/build record, rollback procedure | CI/CD automation and broader operational hardening | in-progress |

Phase 2 does not wait for every future regulation, case, amendment, or Level 3 document. It completes when the planned 0→1 rows are validated and documented.

## Phase 3 bounded completion

| Capability | 0→1 completion | Later 1→100 or on-demand work | Status |
|---|---|---|---|
| Financial-domain pilot | CRD, EBA internal-governance guidance, CSSF 12/552, and one evidence-bearing EU → Luxembourg chain | further banking governance, prudential, payments, AML, funds, insurance, and markets slices | validated |
| Topic / taxonomy | three cross-file reviewed Topics with provision links and Profile-safe materialization | broader Topic coverage and official/algorithmic assistance | validated |
| Implementation timeline | six AI Act milestones with exact Article 113 evidence | further regulation timelines and delegated/implementing milestones | validated |
| Supervisory decision | CNPD `18FR/2022` with four exact GDPR Article findings | more jurisdictions, outcomes, appeals, and decision-text coverage | validated |
| Applicability navigation | DORA credit-institution scope evidence and RTS/ITS navigation without a final conclusion | more entity types, activities, and institution-specific profiles | validated |
| Multi-hop regulatory path | Banking Governance CRD → EBA → CSSF path over existing exact edges | additional Domains and richer comparison/navigation templates | validated |
| Internal Agent/RAG retrieval | citation-ready stable-ID context and 3-case deterministic Top-1 benchmark | broader evaluation sets and Phase 4 public transports | validated |
| Focused graph persistence | graph-neutral SQLite repository/service boundary retained | evaluate GraphDB only when observed query load requires it | deferred |

Phase 3 completes its planned 0→1 intelligence capabilities without a GraphDB. The deferred persistence option is an implementation-scale decision, not an unmet product requirement; all future coverage is tracked below rather than treated as incomplete phase work.

## Phase 3 first non-IT pilot

Use **Banking Governance & Internal Control** as the first financial-business domain slice.

Representative scope:

- selected CRD governance provisions;
- EBA Internal Governance material;
- existing CSSF Circular 12/552;
- one verified EU → Luxembourg legal relationship chain;
- a small versioned Domain taxonomy at Document and representative Provision level;
- Authority entities and reviewed `ISSUED_BY` / jurisdiction relations;
- citation-ready internal Agent/RAG retrieval output.

This pilot validates the workflow and data contracts. It does not attempt simultaneous full coverage of CRR/CRD, AML, payments, credit, markets, funds, insurance, prudential reporting, ESG, or national implementations.

Current 0→1 status: the complete original-OJ English Formex text of Directive 2013/36/EU (CRD IV), including Annexes I–II, is pinned and reproducibly onboarded through the corpus manifest with explicit current-version and corrigendum metadata. The loaded text is not represented as the current consolidated text. EBA/GL/2021/05 is independently acquired and fidelity-gated as 234 numbered guideline paragraphs plus Annex I. Reviewed mappings publish `CRD Article 74 → MANDATES → EBA/GL/2021/05`, `EBA paragraph 5 → SUPPLEMENTS → CRD Article 74`, and `Circular CSSF 12/552 Introduction block 7 → IMPLEMENTS → EBA/GL/2021/05`. The generic Regulatory Path page projects those directions at `/domains/banking-governance-internal-control`. Runtime 5.5.0 also publishes the first evidence-bearing applicability rule at `/applicability/dora`, three reviewed cross-file Topics at `/topics`, and reviewed Expression metadata for the offline RAG contract: exact scope evidence and Topic/stable-entity assignments are Profile-filtered without claiming a final legal determination. Internal citation services return exact text, source lineage, relationships, context, and deterministic retrieval metadata with Profile isolation. The Banking Governance, structured retrieval, cross-regulation-path, applicability, and Topic/Taxonomy 0→1 pilots are complete; broader institution/activity, Topic, and query/provision coverage remain 1→100 work.

Supervisory decisions 0→1 is complete with CNPD `18FR/2022`: one normalized Decision, one CNPD Authority, and four exact `FINDS_VIOLATION_OF` links to GDPR Articles 5, 6, 12, and 15. The reviewed input pins the official PDF SHA-256, size, page count, operative text, and page locator. Additional CNPD/CNIL/CSSF decisions, no-violation outcomes, appeals, decision-text ingestion, and bulk discovery remain 1→100 queues; none are inferred from authority website summaries.

## Financial-domain 1→100 queues

| Domain | Representative next slice | Scale-out after validation | Status |
|---|---|---|---|
| Banking governance | completed CSSF → EBA implementation relation | governance, remuneration, fit-and-proper, internal control | 0→1 complete |
| Prudential | reviewed CRR consolidated text plus original-OJ CRD/CRR III/CRD VI texts are reproducibly onboarded; one bounded CRR topic remains | capital, liquidity, leverage, reporting and further reviewed consolidated-version coverage | in-progress |
| Payments | reviewed primary-law payments corpus using the existing orchestrator | PSD/PSR, payment security, EBA guidance, national material | deferred |
| AML/KYC | six reviewed AML-family EU acts are reproducibly onboarded; one authority/national chain remains the next bounded slice | EBA guidance, CSSF/FIU/national implementation, consolidated-version coverage | in-progress |
| Funds/asset management | one UCITS/AIFMD family slice | delegated acts, ESMA guidance, national materials | deferred |
| Insurance | one Solvency II family slice | delegated acts, EIOPA guidance, national materials | deferred |
| Investment/markets | reviewed MiFID II/MiFIR corpus in the banking Profile | market structure, conduct, reporting, ESMA material | validated |
| Digital assets | existing MiCA family through a dedicated Profile | more RTS/ITS/Guidelines/Q&A | deferred |
| Cross-sector digital | existing DORA/GDPR/AI Act/NIS2/Data Act corpus | further ICT/cyber/data measures | in-progress |

## RAG corpus alignment

The 31 August 2026 alignment uses the RAG repository only as a reviewed scope inventory. Platform independently acquires official bytes and applies its own snapshot, Canonical, quality, Profile, and release gates; RAG chunks, BM25/vector indexes, generated catalogs, and release artifacts are not imported.

The first zero-code-complexity batch is validated: seven additional DORA EUR-Lex acts (`32022L2556`, `32024R1502`, `32024R1505`, `32025R0295`, `32025R0420`, `32025R0532`, and `32025R1190`) and three AML/payments acts (`32015L0849`, `32016R1675`, and `32023R1113`) reuse the existing Formex adapter without Canonical-contract, relationship, Runtime-schema, API, or UI changes. CRR (`32013R0575`) now pilots reviewed consolidated Formex: the stable base-law ID remains unchanged while the pinned `02013R0575-20260626` expression supplies 786 Articles and four Annexes as of 26 June 2026. The selected CRR consolidated Formex does not repeat the original recitals, so the current CRR Reader expression reports zero Recitals rather than silently merging text from a second expression.

CRR III (`32024R1623`) and CRD VI (`32024L1619`) are now loaded as the next prudential layer. Their official amendment relationships to CRR and CRD IV are published from reviewed CELLAR Work metadata. BRRD (`32014L0059`), SRMR (`32014R0806`), DGSD (`32014L0049`), and PSD2 (`32015L2366`) extend the Level 1 banking baseline across recovery and resolution, deposit protection, and payments, using the existing Formex pipeline without parser-specific exceptions. AMLR (`32024R1624`), AMLD VI (`32024L1640`), the AMLA Regulation (`32024R1620`), and the SEPA Regulation (`32012R0260`) add the next AML and payments slice through the same pipeline; AMLA and SEPA use reviewed consolidated expressions, while AMLR and AMLD VI retain their reviewed original publications. Consumer Credit Directive II (`32023L2225`), Mortgage Credit Directive (`32014L0017`), Payment Accounts Directive (`32014L0092`), and the Instant Payments Regulation (`32024R0886`) complete the second banking-core batch; MCD uses its reviewed current consolidated expression and the other three retain their official publications. CRR III exposed two reusable Formex requirements: packaging-only Annex wrappers are removed while the referenced legal Annex remains, and official TIFF formula resources are verified, losslessly rendered as PNG for browsers, and retained at their exact ordered-content positions without OCR or invented formula text.

### Banking-core-3 — 4 October 2026

| Document | CELEX | Reviewed text | Articles |
|---|---|---|---|
| Electronic Money Directive II | `32009L0110` | Consolidated `02009L0110-20180113` | 24 |
| Securitisation Regulation | `32017R2402` | Consolidated `02017R2402-20210409` | 55 |
| Covered Bonds Directive | `32019L2162` | Consolidated `02019L2162-20240109` | 35 |
| Covered Bonds CRR Amending Regulation | `32019R2160` | Original OJ, 18 December 2019 | 2 |

Top-level Article labels/order and counts were checked against the official XML; all four have zero parser warnings. The three consolidated expressions are confirmed by the 4 October 2026 official CELLAR English-Formex version audit. Consolidated sources do not silently borrow original recitals. The existing Formex parser, Canonical contract, and UI are reused.

Reviewed official CELLAR metadata adds PSD2 → EMD2, Covered Bonds Directive → BRRD, and Covered Bonds CRR Amending Regulation → CRR `AMENDS` edges with the original direction and Work URIs. All 67 prior reviewed edges remain present in the fresh official snapshot; the published dataset now contains 70 edges.

The manifest pins 47 documents. Both strict Profile builds are verified: `full-corpus` contains 47 and `banking-default` 1.5.0 contains 45 after excluding the MiCA family.

For another computer that already has the previous corpus, sync the reviewed Git inputs and copy only these four CELEX directories under both `data/raw/eur-lex/` and `data/artifacts/canonical/`. Rebuild its Runtime with `npm run runtime:build`; no bulk copy of older corpus builds is required. The new raw lifecycle and currency-audit snapshots are optional for ordinary Reader use and should also be retained when continuing provenance review.

### Banking-core-4 — 4 October 2026

| Document | CELEX | Reviewed text | Articles |
|---|---|---|---|
| Financial Collateral Directive | `32002L0047` | Consolidated `02002L0047-20220812` | 14 |
| Settlement Finality Directive | `31998L0026` | Consolidated `01998L0026-20240408` | 16 |

The official base-act CELLAR notices confirm these are the latest effective English Formex expressions as of 4 October 2026. Independent XML inspection matches the top-level Article labels and order, including Financial Collateral Article 9a and Settlement Finality Articles 10a and 12a. Both sources have zero parser warnings, no Recitals or Annexes in the selected consolidated expressions, and independently checked first/last text hashes. Raw content and tree-notice checksums are verified. No parser, Canonical contract, relationship dataset, Runtime schema, API, or UI changes are needed.

After this batch, the manifest pinned 49 documents. `banking-default` 1.6.0 added the financial-collateral and settlement-finality families and contained 47 documents while preserving the MiCA exclusions. Both strict Profile builds passed. Build-time data preparation and read-only SQLite remained the same.

Verification: `npm run check`, `npm run build`, both strict corpus builds, and all 353 tests across 89 files passed. Targeted banking-Profile checks cover document and Article counts, scoped search, exact citations for inserted Articles, consolidated version IDs, and the existing MiCA exclusions.

For another computer with the previous corpus, transfer only these two CELEX directories under `data/raw/eur-lex/` and `data/artifacts/canonical/`, sync the reviewed Git inputs, and run `npm run runtime:build`. The official currency-audit snapshot under `data/raw/corpus-audits/banking-core-4/` is retained separately for provenance.

### Banking-core-5 — 4 October 2026

| Document | CELEX | Reviewed text | Articles | Recitals |
|---|---|---|---|---|
| SSM Regulation | `32013R1024` | Original OJ, 29 October 2013 | 34 | 87 |
| Interchange Fee Regulation | `32015R0751` | Original OJ, 19 May 2015 | 18 | 44 |

The official base-act CELLAR notices expose no usable English consolidated Formex for these sources as of 4 October 2026. The selected official publications are explicitly `original_oj` / `not_assessed`, with a consolidation fallback reason; this does not claim they are current consolidated law. Independent XML inspection matches Article labels/order, Recital counts, and first Recital plus first/last Article text hashes. Both snapshots pass checksum verification and have zero parser warnings and no Annexes.

After this batch, the manifest pinned 51 documents. `banking-default` 1.7.0 adds the SSM family; the Interchange Fee Regulation uses the existing payments family. The banking corpus contains 49 documents and still excludes MiCA. Existing parser, contracts, relationship datasets, Runtime schema, API, and UI are reused.

Verification: both strict Profile builds, `npm run check`, `npm run build`, and all 354 tests across 89 files passed. Banking-Profile tests verify Article/Recital counts, scoped search, exact citations, and original-publication version IDs for both sources.

Cross-computer transfer follows the same procedure: copy only these two CELEX directories under `data/raw/eur-lex/` and `data/artifacts/canonical/`, sync reviewed Git inputs, and run `npm run runtime:build`. Retain `data/raw/corpus-audits/banking-core-5/` separately for version-selection provenance.

### Formex quotation fidelity — 4 October 2026

EBA onboarding exposed empty `QUOT.START` / `QUOT.END` elements whose `CODE` attributes encode official quotation marks. Formex parser 1.7.0 now preserves the four observed Unicode code points in plain text and ordered Reader content. Missing, unsupported, or nonempty markers fail closed. `CODE` is authoritative, including the official DORA ITS cell whose start and end markers both encode `2019`; the parser does not silently correct that source punctuation.

A comparison of all 47 previously pinned EUR-Lex snapshots preserves provision counts, stable IDs, version IDs, locators, and order. Text changed in 41 documents / 3,264 provisions; removing only the restored quotation marks reproduces the previous text. All 23 changed baseline anchors were independently checked against their source XML paths before updating their hashes. Existing XML-entity representation is unchanged. Encoded quotation markers are excluded only when deriving point and Annex identities; official display labels retain them.

Ignored evidence lives under `data/artifacts/onboarding/quotation-migration/`. The fix runs during data preparation; Reader still uses the compiled SQLite artifact. Test execution uses one worker to avoid competing corpus builds, with 60-second build hooks. The full-corpus Reader round-trip has a 30-second budget; complete raw/Canonical/Runtime verification and repeated SQLite fixture builds have 60 seconds. Ordinary tests retain 10 seconds and dedicated performance thresholds are unchanged.

### Banking-core-6 — 4 October 2026

| Document | CELEX | Reviewed text | Articles | Recitals |
|---|---|---|---|---|
| EBA Regulation | `32010R1093` | Consolidated `02010R1093-20251231` | 100 | 0 |
| Bank Reorganisation and Winding-up Directive | `32001L0024` | Consolidated `02001L0024-20140702` | 36 | 32 |

Official base-act CELLAR notices confirm these are the latest effective English Formex expressions as of 4 October 2026. Independent XML inspection verifies top-level Article labels/order, selected-expression Recital counts, first/last Article text hashes, and the first Recital hash where present. Both sources have zero parser warnings and no Annexes, and content/tree-notice checksums pass. The Winding-up consolidated source itself contains 32 Recitals; they are not borrowed from another expression.

The manifest pins 53 documents. `banking-default` 1.8.0 adds the EBA-regulation and bank-reorganisation families and contains 51 documents. The existing reviewed MiCA → EBA `AMENDS` edge becomes resolved in `full-corpus` when its target is loaded; its identity, direction, predicate, and Work URIs stay unchanged. The banking Profile continues to exclude MiCA and that edge. Broad global search rankings change as the corpus grows: in the banking Profile, the first AMLD IV result for `money laundering` moved from position 19 to 35 after this batch. At this stage, the default first 20 results no longer included AMLD IV; the subsequent search repair restores default-page coverage and retains document-scoped retrieval checks.

Verification: both strict Profile builds, `npm run check`, `npm run build`, Runtime verification, and 27 dedicated Formex fixture tests passed. The complete 367-test run passed 322 tests in 85 unaffected files; the four remaining files were corrected and rerun separately, covering the other 45 tests. These fixes update official quotation expectations, preserve bounded global AMLD discovery alongside scoped retrieval, and allow the measured complete-corpus verification time without changing legal-data gates.

At completion of banking-core-6, `operational risk` → DORA failed the top-20 search check, also failing against the earlier 51-document backup. The subsequent global search coverage repair below resolves this limitation.

For another computer with the previous corpus and its verified raw snapshots, sync reviewed Git inputs and copy only the two new CELEX directories under `data/raw/eur-lex/`. Run `npm run corpus:update -- --skip-fetch` to rebuild **all** local Canonical artifacts with parser 1.7.0 and the default Reader SQLite; inspect its report for zero quality drift and reviewed-input issues. This command uses local snapshots and is an experimental refresh. Then run `npm run corpus:build -- --profile full-corpus` to verify the exact pinned corpus separately; its isolated artifacts do not populate the local Canonical directory. Copying only the two new Canonical directories is insufficient because the local loader requires the current parser version for every EUR-Lex document. Alternatively, transfer all 49 current parser-1.7.0 EUR-Lex Canonical directories and run `npm run runtime:build`. If raw snapshots are missing, transfer the corresponding pinned raw directories first. Retain `data/raw/corpus-audits/banking-core-6/` separately for version-selection provenance.

### Global search coverage — 4 October 2026

Plain BM25 allowed many clauses from one law to fill the global first page: DORA first appeared at position 64 for `operational risk`, and AMLD IV at 48 for `money laundering` in the 53-document full corpus. Global search now takes the best match from each law in BM25 order before taking second matches, and repeats for further matches. Exact document scope keeps the previous BM25 order. Strict AND/prefix/phrase matching, source text, highlights, stable links, law-identity search, and definitions stay within their existing contracts.

The implementation uses the current read-only SQLite FTS index, with no new dependencies, schema, services, model calls, or source parsing. Only the selected result rows receive snippets. Three synthetic SQL fixtures cover crowding, deterministic ties, complete results, limits, document scope, strict AND, phrase highlighting, and stable anchors. Original relevance cases remain; two additional cases protect AMLD IV and DORA coverage.

Before business expansion, all eight global cases, six definition cases, and three citation Top-1 cases passed on the 53-document corpus. The normal-query benchmark recorded warm P95 10.34 ms. On the same SQLite artifact, 50-sample broad-query comparisons measured `risk` P95 11.51 → 26.74 ms, `bank` 4.54 → 5.16 ms, and `operational` 2.96 → 4.20 ms. These are local measurements; global diversification adds work for high-hit queries, while document-scoped search keeps its prior query path.

### Banking-core-7 — 4 October 2026

| Document | CELEX | Reviewed text | Articles | Annexes |
|---|---|---|---|---|
| MiFID II | `32014L0065` | Consolidated `02014L0065-20260606` | 103 | 4 |
| MiFIR | `32014R0600` | Consolidated `02014R0600-20251123` | 95 | 0 |

These sources extend the banking corpus into investment services, investor protection, market transparency, and transaction reporting. Official base-act CELLAR notices confirm the latest effective English Formex expressions and original publication date (12 June 2014). Independent XML review checks Article labels/order, Annex labels/counts, and eight exact text anchors, including MiFID II Article 25(2) and MiFIR Article 26(1). Both selected expressions contain no Recitals and produce zero parser warnings. Content and tree-notice checksums pass; no new parser profile or contract is needed.

The manifest pins 55 documents. `banking-default` 1.9.0 includes the `mifid` family and contains 53 documents while retaining MiCA exclusions. The existing reviewed DORA → MiFIR `AMENDS` edge becomes resolved when MiFIR is loaded; its ID, predicate, direction, and Work URIs stay unchanged. No relationship records are added.

Validation after expansion: both strict Profile builds, `npm run check`, `npm run build`, and Runtime verification pass. All 371 tests across 90 files are verified by the complete run plus the targeted Dossier rerun. Dossier tests now reuse one immutable corpus fixture instead of reparsing it for each case; assertions and timing budgets are unchanged. The 55-document corpus passes eight global search checks, six definition checks, and all three citation Top-1 checks. The local normal-query search benchmark records warm P95 16.60 ms; this is a function-level benchmark, not an HTTP latency guarantee.

For a computer already holding the parser-1.7.0 corpus, sync reviewed Git inputs and transfer only the two new CELEX directories under `data/raw/eur-lex/` and `data/artifacts/canonical/`, then run `npm run runtime:build`. Retain `data/raw/corpus-audits/banking-core-7/` for version-selection provenance. Strict Profile builds use pinned raw snapshots and isolated artifacts as described in the onboarding runbook.

### Banking-core-8 and AI Act implementing measures — 4 October 2026

| Document | CELEX | Reviewed text | Articles | Annexes |
|---|---|---|---|---|
| EMIR | `32012R0648` | Consolidated `02012R0648-20250117` | 137 | 4 |
| CSDR | `32014R0909` | Consolidated `02014R0909-20260117` | 83 | 1 |
| AI Act Scientific Panel | `32025R0454` | Original OJ, 10 March 2025 | 20 | 0 |
| AI Act Commission Proceedings | `32026R1755` | Original OJ, 21 July 2026 | 15 | 1 |

EMIR and CSDR extend the existing investment/markets corpus into derivatives, clearing, reporting, securities settlement, and central securities depositories. The official 4 October CELLAR audit confirms the newest effective English Formex consolidated expressions. The AI measures are European Commission implementing regulations, classified as `level-2` / `other` in the existing `ai-act` family. Scientific-panel governance and Commission proceedings (including general-purpose AI model evaluations and fines) are their bounded scope; they do not provide complete guidance for bank AI use cases.

Independent XML review verifies Article labels/order, Annex labels/counts, 18 exact text anchors, and content/tree-notice checksums. The additional business anchors are EMIR Article 9(1), CSDR Article 5(1), and Article 5(1) of each AI measure. All four have zero parser warnings. The selected EMIR/CSDR expressions contain zero Recitals; the original AI publications retain 13 and six Recitals respectively. The existing parser, Canonical contract, Runtime schema, relationship semantics, and API/UI are reused.

The manifest pins 59 documents. `banking-default` 1.10.0 adds the `emir` and `csdr` families and contains 57 documents, including all three AI-family documents and preserving MiCA exclusions. The existing reviewed DORA → EMIR and DORA → CSDR `AMENDS` edges become resolved with their original IDs, direction, predicate, and Work URIs. No relationship records are added. AI-family membership is classification, not a new mandate/adoption relationship; the existing RTS/ITS mapping contract is not widened for these `other` measures. The AI original publications retain `original_oj` / `not_assessed` Expression metadata and the explicit fallback reason rather than claiming reviewed consolidated currency.

Validation: both strict Profile builds, `npm run check`, web build, and explicit Runtime verification pass. All 372 cases across 90 files are verified by the complete suite plus a 52-case rerun of four affected files. Three stale corpus-count assertions were updated to the new source/Work counts; supervisory-decision tests now share one immutable corpus fixture instead of repeatedly loading the full corpus. Existing assertions and timing budgets are preserved. The 59-document corpus passes all eight global search checks, six definition checks, and three citation Top-1 checks.

For a computer already holding the parser-1.7.0 corpus, sync reviewed Git inputs and transfer the four new CELEX directories under `data/raw/eur-lex/` and `data/artifacts/canonical/`, then rebuild Runtime. Retain the `banking-core-8` currency audit and independent onboarding review for provenance. Strict builds continue to consume the exact manifest pins.

#### First investment/markets reading sequence

This is an editorial reading sequence over reviewed text, not a claim that every transaction is subject to every instrument. Use the existing Reader Article/paragraph navigation and citation links; no new runtime workflow is introduced.

| Reading focus | Document | Reviewed starting point |
|---|---|---|
| Investment advice and suitability | MiFID II | Article 25(2) |
| Transaction reporting | MiFIR | Article 26(1) |
| Derivative contract reporting | EMIR | Article 9(1) |
| Intended settlement date | CSDR | Article 5(1) |

Each starting paragraph is included in its source's independently checked quality hashes. Broader applicability, exceptions, national implementation, and reporting technical standards require their own reviewed evidence and are not inferred from this sequence.

### Coverage depth by family

The EUR-Lex family counts are coverage indicators: DORA has 14 documents (two Level 1 acts and 12 Level 2 measures), AML has six (five Level 1 acts and one Level 2 measure), and AI Act now has three (one Level 1 act and two Level 2 implementing measures). Family size does not establish completeness, equal regulatory importance, or legal applicability. Other one-document families currently provide reviewed primary-law text; their implementing measures, guidance, and national layers remain separate expansion queues.

The next AI coverage slice should prioritize practical official guidance, with publication/final-versus-draft status and legal nature reviewed for each candidate:

- [Prohibited AI practices guidelines](https://digital-strategy.ec.europa.eu/en/library/commission-publishes-guidelines-prohibited-artificial-intelligence-ai-practices-defined-ai-act): non-binding Commission guidance, distinct from Article 5 itself.
- [General-purpose AI provider guidelines](https://digital-strategy.ec.europa.eu/en/library/guidelines-scope-obligations-providers-general-purpose-ai-models-under-ai-act): scope and provider obligations; non-binding guidance remains distinct from the voluntary Code of Practice.
- [Transparency guidance](https://digital-strategy.ec.europa.eu/en/library/guidelines-transparency-obligations-providers-and-deployers-ai-systems): verify the selected final publication and its exact official source before ingestion; retain any drafts as separate, clearly identified material.
- [High-risk AI guidance](https://digital-strategy.ec.europa.eu/en/policies/guidelines-ai-high-risk-systems): confirm final adoption status before promotion and build a bounded financial-use-case reading path from reviewed AI Act evidence.

These guidance documents are not in the current Reader corpus. Commission web/PDF material needs a bounded reusable source profile and fidelity fixtures before publication; it must not be squeezed into the existing EBA PDF adapter or counted as extra binding regulations. This queue is documented coverage work, not a parser-contract or runtime-infrastructure change.

The remaining 18 RAG-only documents are retained as an explicit future queue rather than forced through an unsuitable parser:

- GDPR decisions `32021D0914` and `32021D0915` require a reviewed `decision` document-type slice.
- Joint ESA/EBA guidelines `JC-GL-2024-36`, `JC-GL-2024-34`, `EBA-GL-2021-02`, `EBA-GL-2024-01`, `EBA-GL-2022-05`, `EBA-GL-2022-15`, `EBA-GL-2023-04`, and `EBA-GL-2024-11` require reusable, document-bounded authority-PDF profiles and quality fixtures.
- CSSF Circulars `25/882`, `25/892`, `26/915`, `21/782`, `23/842`, `23/843`, `25/878`, and `25/879` require confirmation that an existing reviewed PDF profile fits; otherwise they need a separately bounded profile and fixture.

This queue is coverage work, not permission to add RAG-specific ingestion code to Platform.

## Cross-cutting 1→100 queues

- additional jurisdictions after the first EU → Luxembourg chain;
- provision-level taxonomy coverage beyond representative samples;
- institution/activity-specific applicability profiles;
- broader institution/activity applicability rules after the completed DORA credit-institution 0→1;
- full authority and legal-nature metadata;
- additional version history and consolidated text comparison;
- deeper CJEU and national case-law evidence;
- larger search and relationship evaluation sets;
- durable content-addressed remote raw snapshot storage (manifest/archive gate is implemented);
- incremental rebuild beyond the implemented full manifest-driven build and build report;
- remote Public API/MCP account authorization, distributed quotas, audit policy, and a published client SDK beyond the completed API-key/OpenAPI/Swagger, stdio, and executable MCP relationship-client 0→1 slices.

## Guardrails

- Regulatory Domain is editorial classification with provenance, version, and review state.
- Domain, applicability, and affected organizational function are separate dimensions.
- A Profile controls product corpus visibility; it is not a universal legal conclusion.
- Guidelines, Q&A, FAQ, decisions, and official legislation retain distinct legal nature and binding status.
- New relation types require direction, endpoint, evidence, provenance, and tests before publication.
- Raw dumps, generated Canonical artifacts, Runtime SQLite, secrets, and local environment files stay out of Git.
