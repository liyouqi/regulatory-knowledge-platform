# Country directory: Sol High review

2026-10-20. A read-only Sol High review approved the following first slice before implementation:

- Materialize a separate 32-country metadata directory in the existing read-only Runtime, including the reviewed dataset in build identity and manifest verification. Runtime schema may advance from 5.8 to 5.9.
- Derive local document counts exclusively from current Profile-visible document jurisdictions. EU documents remain a separate common-framework entry, with no country applicability or implementation assertion.
- Distinguish reviewed portals from pending candidate links. Require source evidence and a check time before labelling a portal reviewed.
- Keep Canonical, Public API v1, RAG, legal relationship types and release thresholds unchanged in this slice. Do not broaden jurisdiction enums speculatively or publish transposition relationships.
- Test ISO membership/uniqueness, dataset hash and counts, Profile isolation, empty countries, EU exclusion, unknown codes, and route handling.

The first actual national legal-text adapter requires a further coordinated review of Canonical jurisdiction/source systems, language and Expression metadata, stable national IDs, Profile and exact-source manifest logic, API/OpenAPI/MCP, and RAG contracts. Existing `eu:<CELEX>`, `eu:eba:gl:*` and `lu:cssf:*` IDs must remain byte-for-byte stable.

This records an engineering review decision, not a legal determination or a statement that national laws have already been loaded.

The separately requested Formex 1.6.2 review approved retaining numbered quoted annex wrappers and Roman-plus-letter annex identities. Postchange review initially required correcting Reader fixture assertions and enforcing exact quote/inclusion tag order. Both were corrected; the final Sol High review approved the scope with 25/25 package/parser fixtures passing. Mixed, missing, multiple, cyclic, shared, unbalanced, reversed and outside-span inclusions have rejection fixtures. The two affected legal documents were unpublished candidates; reviewed published annex IDs are preserved.

A subsequent read-only Sol High review assessed the IFD/CRD lexical-search regression. It recommended preserving lexical ranking, frozen questions and expected CRD Article 76 evidence; the browser test must retain a global Top-5 check and exact Reader navigation, while disclosing that IFD Article 28 is now Top-1. No institution-applicability heuristic or release/citation threshold change was approved or introduced.
