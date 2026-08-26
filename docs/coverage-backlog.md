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

Current 0→1 status: the complete original-OJ English Formex text of Directive 2013/36/EU (CRD IV), including Annexes I–II, is pinned and reproducibly onboarded through the corpus manifest with explicit current-version and corrigendum metadata. The loaded text is not represented as the current consolidated text. EBA/GL/2021/05 is now independently acquired and fidelity-gated as 234 numbered guideline paragraphs plus Annex I; report front matter and accompanying material are explicitly excluded from the legal body. Reviewed official mappings publish `CRD Article 74 → MANDATES → EBA/GL/2021/05` and `EBA paragraph 5 → SUPPLEMENTS → CRD Article 74`. The regulatory-context service separately returns versioned editorial Domain assignments, EBA issuer metadata, and a reviewed guideline legal-nature/status record. The first reviewed EU → Luxembourg formal legal relation remains the next bounded slice.

## Financial-domain 1→100 queues

| Domain | Representative next slice | Scale-out after validation | Status |
|---|---|---|---|
| Banking governance | first EU → Luxembourg formal legal relation | governance, remuneration, fit-and-proper, internal control | in-progress |
| Prudential | one bounded CRR topic | capital, liquidity, leverage, reporting | deferred |
| Payments | four reviewed core laws/materials using the corpus orchestrator | PSD/PSR, payment security, EBA guidance, national material | deferred |
| AML/KYC | one EU package + one authority/national chain | AML package, EBA guidance, FIU/national implementation | deferred |
| Funds/asset management | one UCITS/AIFMD family slice | delegated acts, ESMA guidance, national materials | deferred |
| Insurance | one Solvency II family slice | delegated acts, EIOPA guidance, national materials | deferred |
| Investment/markets | one MiFID/MiFIR topic | market structure, conduct, reporting, ESMA material | deferred |
| Digital assets | existing MiCA family through a dedicated Profile | more RTS/ITS/Guidelines/Q&A | deferred |
| Cross-sector digital | existing DORA/GDPR/AI Act/NIS2/Data Act corpus | further ICT/cyber/data measures | in-progress |

## Cross-cutting 1→100 queues

- additional jurisdictions after the first EU → Luxembourg chain;
- provision-level taxonomy coverage beyond representative samples;
- institution/activity-specific applicability profiles;
- full authority and legal-nature metadata;
- additional version history and consolidated text comparison;
- deeper CJEU and national case-law evidence;
- larger search and relationship evaluation sets;
- durable content-addressed remote raw snapshot storage (manifest/archive gate is implemented);
- incremental rebuild beyond the implemented full manifest-driven build and build report;
- public API/MCP authentication, compatibility, rate limiting, and SDKs in Phase 4.

## Guardrails

- Regulatory Domain is editorial classification with provenance, version, and review state.
- Domain, applicability, and affected organizational function are separate dimensions.
- A Profile controls product corpus visibility; it is not a universal legal conclusion.
- Guidelines, Q&A, FAQ, decisions, and official legislation retain distinct legal nature and binding status.
- New relation types require direction, endpoint, evidence, provenance, and tests before publication.
- Raw dumps, generated Canonical artifacts, Runtime SQLite, secrets, and local environment files stay out of Git.
