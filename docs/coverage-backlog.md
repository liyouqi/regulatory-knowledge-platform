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

Current 0→1 status: the complete original-OJ English Formex text of Directive 2013/36/EU (CRD IV), including Annexes I–II, is pinned and reproducibly onboarded through the corpus manifest with explicit current-version and corrigendum metadata. The loaded text is not represented as the current consolidated text. EBA/GL/2021/05 is independently acquired and fidelity-gated as 234 numbered guideline paragraphs plus Annex I. Reviewed mappings publish `CRD Article 74 → MANDATES → EBA/GL/2021/05`, `EBA paragraph 5 → SUPPLEMENTS → CRD Article 74`, and `Circular CSSF 12/552 Introduction block 7 → IMPLEMENTS → EBA/GL/2021/05`. The generic Regulatory Path page projects those directions at `/domains/banking-governance-internal-control`. Runtime 5.4.0 also publishes the first evidence-bearing applicability rule at `/applicability/dora` and three reviewed cross-file Topics at `/topics`: exact scope evidence and Topic stable-entity assignments are Profile-filtered without claiming a final legal determination. Internal citation services return exact text, source lineage, relationships, context, and deterministic retrieval metadata with Profile isolation. The Banking Governance, structured retrieval, cross-regulation-path, applicability, and Topic/Taxonomy 0→1 pilots are complete; broader institution/activity, Topic, and query/provision coverage remain 1→100 work.

Supervisory decisions 0→1 is complete with CNPD `18FR/2022`: one normalized Decision, one CNPD Authority, and four exact `FINDS_VIOLATION_OF` links to GDPR Articles 5, 6, 12, and 15. The reviewed input pins the official PDF SHA-256, size, page count, operative text, and page locator. Additional CNPD/CNIL/CSSF decisions, no-violation outcomes, appeals, decision-text ingestion, and bulk discovery remain 1→100 queues; none are inferred from authority website summaries.

## Financial-domain 1→100 queues

| Domain | Representative next slice | Scale-out after validation | Status |
|---|---|---|---|
| Banking governance | completed CSSF → EBA implementation relation | governance, remuneration, fit-and-proper, internal control | 0→1 complete |
| Prudential | one bounded CRR topic | capital, liquidity, leverage, reporting | deferred |
| Payments | four reviewed core laws/materials using the corpus orchestrator | PSD/PSR, payment security, EBA guidance, national material | deferred |
| AML/KYC | three official EU acts are reproducibly onboarded; one authority/national chain remains the next bounded slice | EBA guidance, CSSF/FIU/national implementation, consolidated-version coverage | in-progress |
| Funds/asset management | one UCITS/AIFMD family slice | delegated acts, ESMA guidance, national materials | deferred |
| Insurance | one Solvency II family slice | delegated acts, EIOPA guidance, national materials | deferred |
| Investment/markets | one MiFID/MiFIR topic | market structure, conduct, reporting, ESMA material | deferred |
| Digital assets | existing MiCA family through a dedicated Profile | more RTS/ITS/Guidelines/Q&A | deferred |
| Cross-sector digital | existing DORA/GDPR/AI Act/NIS2/Data Act corpus | further ICT/cyber/data measures | in-progress |

## RAG corpus alignment

The 31 August 2026 alignment uses the RAG repository only as a reviewed scope inventory. Platform independently acquires official bytes and applies its own snapshot, Canonical, quality, Profile, and release gates; RAG chunks, BM25/vector indexes, generated catalogs, and release artifacts are not imported.

The first zero-code-complexity batch is validated: seven additional DORA EUR-Lex acts (`32022L2556`, `32024R1502`, `32024R1505`, `32025R0295`, `32025R0420`, `32025R0532`, and `32025R1190`) and three AML/payments acts (`32015L0849`, `32016R1675`, and `32023R1113`) reuse the existing Formex adapter without parser, Canonical-contract, relationship, Runtime-schema, API, or UI changes. The manifest now pins 28 documents; `full-corpus` contains all 28 and `banking-default` contains 26 after excluding the MiCA family. AMLD IV and Regulation 2016/1675 are deliberately loaded as original-OJ text with explicit current-version links; the RAG repository's consolidated XHTML is not silently substituted.

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
