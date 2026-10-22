# Country directory — 20 October 2026

## Source checks

This is source-identity review for country directory metadata. It does not certify source currency, legal applicability or loaded national legal text.

Public HTTPS landing pages were downloaded in this run. Immutable response bytes and the acquisition report are retained locally under ignored `data/raw/country-directory/2026-10-20/`. Seven portal identities were reviewed from their visible titles and governmental publisher/service information. The remaining 25 candidate portals stay pending with no asserted review time.

| Country | Observed title / outcome | Status | Response SHA-256 |
|---|---|---|---|
| LU | Legilux (script-only body; review remains pending) | pending | `sha256:cc0431de869db92dd9874c604dded2a7570479eb83022344e97942e1a281a235` |
| FR | HTTP Error 403: Forbidden | pending | `unavailable` |
| DE | Gesetze im Internet | reviewed | `sha256:179633e8e7a1c1be4233f9bf06ddd29068a6419a6b086d27e8be2ac240dac3ad` |
| IE | Irish Statute Book | reviewed | `sha256:08d3d51cc939af936ff4f2b87f3b3da4447580b89fd7554a8435e126429a94fe` |
| NL | Eenvoudig zoeken - Overheid.nl / Wetten.nl | reviewed | `sha256:fadfa841a47ef483979c975c74d0d948abecf615d47186a61007ab67b476a6a8` |
| IT | Normattiva | reviewed | `sha256:48e54db7810201d358dc607e893c1f56bf618d01b9048a54aa428078bfd0825b` |
| ES | BOE.es - Agencia Estatal Boletín Oficial del Estado | reviewed | `sha256:5f112397c55cd7cf69642d3d48cad21af859a8b3fa9ef6b81d24a781411ee052` |
| BE | Empty or script-only landing page | pending | `sha256:1f9022da08698e202798f9067dc3fc9705caa61eda9a5c5a2b5b70a6608c876d` |
| AT | RIS Informationsangebote | reviewed | `sha256:35d93b8c656d96e6e8b1f7e218e3784b806b413de1bc78d8661ec57325ff5c23` |
| PT | Empty or script-only landing page | pending | `sha256:0794abe5f8088cfd34e8e50bb5f9f7828b20a3c505f702e4b51be3bbb0631b57` |
| GB | Legislation.gov.uk | reviewed | `sha256:d8eb40d688eca23fc2d59d3e2a20c1df2f96bc2fb6b55c9e2464160374c6e3cb` |
| CH | Fedlex (script-only body; review remains pending) | pending | `sha256:39d0c4d52bf6c1140a7d5b1848e1a625375891aecc22869089e1361f1fd8b3be` |

France returned HTTP 403. Belgium returned an empty/script response and Portugal required JavaScript. Luxembourg and Switzerland exposed script-only shells; those were not promoted from candidate status. HTTP 200 alone is not a review result. Twenty unrequested portals also remain pending.

Country membership and ISO metadata are separate from portal review. The directory contains EU-27, NO/IS/LI and GB/CH; EU is not itself a country.

## Review

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
