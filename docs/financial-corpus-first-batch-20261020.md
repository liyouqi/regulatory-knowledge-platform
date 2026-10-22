# Financial corpus first batch — 20 October 2026

Fifteen sources were fetched from CELLAR and independently inspected. Active indicates reviewed source and strict canonical construction; release/runtime verification is a separate step. All fifteen entries are now active. The consolidated dates are selected text dates, not guarantees of current law or applicability. Raw snapshots are local-only and ignored by Git.

| CELEX | Selected expression | Status | Articles | Annexes | Warnings | Snapshot SHA-256 |
| --- | --- | --- | ---: | ---: | ---: | --- |
| 32009L0065 | 02009L0065-20260416 | active | 139 | 5 | 22 | `sha256:b6ae4114475b115afc6253d9d26e07ba74ea5922f0ef2d7c7ebb3835192e7e9e` |
| 32011L0061 | 02011L0061-20260416 | active | 77 | 5 | 0 | `sha256:41c144904b62b33e7e4a8936338b836513dde85442b9a1a43c4e4b495e73ff4f` |
| 32013R0231 | 02013R0231-20240212 | active | 117 | 4 | 6 | `sha256:971697d4ea1aaf8f0f8ed77bf95052e7bb64241f2e6c64b1f91ac3e74ede9751` |
| 32024L0927 | 32024L0927 | active | 5 | 4 | 0 | `sha256:6c6f0ea7a8c66eef7dd8d5c8c316dbf224c6fb64ab369fc00b3419e4b5b3f828` |
| 32010L0043 | 02010L0043-20220801 | active | 49 | 0 | 0 | `sha256:9ecbff33ffcf6acb1d9481e84b8948c4952da8913182f13bf5bac9ddc246a343` |
| 32016R0438 | 02016R0438-20200401 | active | 25 | 0 | 0 | `sha256:3c556ce403549a7b683a6fc06708c07821064b827901dad740230a89b6adeb63` |
| 32014R0596 | 02014R0596-20260605 | active | 42 | 2 | 0 | `sha256:8dc47314169a24165225906741e6852cf9407464f337c452087bb5ebbe7ac919` |
| 32017R1129 | 02017R1129-20260605 | active | 54 | 9 | 0 | `sha256:72e85897fb7db98705fe69b32421b7784bb49d963e5befb4c7e8d9fa660cf1a2` |
| 32014R1286 | 02014R1286-20240109 | active | 35 | 0 | 0 | `sha256:a7937f66f7e9732d15e56aa8de09a18679302715385507e55e5ef908f702c48b` |
| 32016R1011 | 02016R1011-20260101 | active | 83 | 3 | 0 | `sha256:5bc584be6f968a22c687a6f716e93891c1f3647dd14bea74b7b950a1391c55d4` |
| 32019R2033 | 02019R2033-20240109 | active | 67 | 0 | 0 | `sha256:a1d860716f929e01b09da8e8ac3b9662cbefed9b1a5713616fa41a8ce6ab28d1` |
| 32019L2034 | 02019L2034-20241224 | active | 70 | 0 | 0 | `sha256:238185717c23f51a39a8d2a87aa703761b200fb93f8e54239399b2ef807e50c1` |
| 32010L0044 | 02010L0044-20100710 | active | 36 | 0 | 0 | `sha256:ab7a067c2940c07a97b41a6a0641c7e5c5e982626d0100d87a56a0b05330f354` |
| 32017R1131 | 02017R1131-20241224 | active | 48 | 0 | 0 | `sha256:ffc3ad8c83b34c5621b6ab68ef746df22bd94711399fb7100c33301a31686604` |
| 32015R0760 | 02015R0760-20240110 | active | 40 | 0 | 0 | `sha256:0bedb16982b49ec3d48659ae3417bd0c83de4c2368f846bb27f162c2aa5b5050` |

## Review and limitations

- For active entries, verified source checksums and parsed first, middle and last Article text anchors against the corresponding source XML XPath; independently counted source ARTICLE elements, confirmed unique article IDs, checked annex labels and first text anchors where applicable, and passed strict canonical builds. This is sampled fidelity review, not an assertion that every legal provision has been manually compared.
- 32009L0065: parser 1.6.2 preserves `annex:iia`. All 22 warnings are source groups without TITLE; the source article count (139) and all five annex labels were independently checked.
- 32024L0927: parser 1.6.2 preserves outer annex II/IV and nests quoted annex V/IIA with their original source locators. All 18 quoted paragraphs were compared with source XML; 5 own Articles and 68 recitals were independently counted. Package and parser fixtures cover rejection of ambiguous or malformed wrappers. Sol High reviewed and approved the implementation and fixtures (see `country-directory-review-20261020.md`).
- 32013R0231 has six warnings: two annex parts without titles, two empty paragraphs and their corresponding empty-text warnings. Source XML confirms the paragraphs are blank `IE` form fields; annex I–IV titles and boundaries were checked.
- 32019R2033 has four formula resources. All four source TIFFs are referenced once in ordered content; source and generated PNGs have identical RGBA pixels, and source locators and formula order were reviewed. For 32014R0596 Article 21a and the AIFMD and Prospectus annex samples, the initial simple text search was affected by XML markup and spacing; manual comparison confirmed the sampled words against the official XML.
- Active annex titles and counts were checked against source. The other active no-annex documents contain no formula resources. Banking-default is an explicit allowlist and does not include these new families.

## Commands and checks

`npm run source:list`; for each source, `npm run source:fetch -- --catalog --celex <CELEX>` followed by `npm run canonical:inspect -- --catalog --snapshot <path>`; inspection verifies the immutable snapshot before parsing. Candidate output was generated with `canonical:build -- --catalog --allow-drift` for review. Each active entry subsequently passed `npm run canonical:build -- --snapshot <path>` with the recorded reviewed baseline. The exact snapshots and hashes for active entries are pinned in `data/corpus-build-manifest.json` version 1.24.0.

Integrated validation is recorded below. No production deployment or durable remote snapshot archival has been performed.

## Integrated scope

The full corpus contains 116 Reader documents (112 EUR-Lex, three CSSF, one EBA guideline); banking-default remains 99. The full corpus has four Topics and 33 provision/document assignments, including six fund-management navigation entries across UCITS and AIFMD. The country directory contains 32 nations; only Luxembourg currently has local Reader text (three existing CSSF documents). Seven portal identities are reviewed; 25 remain pending.

A same-snapshot comparison against earlier 1.6.1/1.6.0 artifacts for all 97 previously active EU documents found no changes to Canonical identities, legal text, structural hierarchy, ordered content, labels, locators or resources. Build/source-version metadata and parser-warning metadata were excluded from that comparison; it is a regression check, not a new whole-corpus legal review.

## Retrieval regression observed during expansion

For the frozen question “Who approves and periodically reviews a bank's risk strategy?”, global lexical Top-1 is now IFD Article 28 and CRD Article 76 is Top-2. The existing question ranking uses prefix coverage and BM25; it does not assess institutional applicability. The browser walkthrough now explicitly selects CRD Article 76 within the first five results and retains the original target, exact text, version caution and navigation checks. Sol High reviewed this decision: no heuristic bank-versus-investment-firm applicability priority was added, frozen datasets and citation/release gates are unchanged. This is a disclosed Top-1 regression, not a global retrieval improvement.

## Validation

- `npm run check`, `npm run build`, and `npm run runtime:verify`: passed.
- Strict full-corpus pinned build: passed, 116 sources/documents, 63,560 records and 19,512 relationships. Banking-default strict build also passed: 99 visible documents, 51,161 records and 15,917 relationships. Both requests verify all 116 pinned sources; zero archived sources, all exact snapshots remain local-only.
- Package/parser dedicated fixtures: 25/25 passed; the 97-document source-matched Canonical comparison found no content/ID regressions.
- Citation, search and related-recital benchmarks: passed without threshold changes.
- Banking frozen question set: 18/18 evidence and navigation checks, global Top-5 15/18, scoped Top-5 17/18. Separate holdout: 6/6 evidence/navigation, global 3/6, scoped 5/6. These are diagnostic retrieval figures, not user adoption or applicability evidence.
- Browser cases: country directory/filter/detail, LU/DE/unknown states, narrow mobile layout, banking evidence/selection/scope/Topic links, fund Topic and UCITS/AIFMD II annex rendering passed after correcting the new annex test to locate the existing Reader title outside the body.
- The first broad test pass exposed stale corpus/Topic/version/external-Work counts and timed out under concurrent strict builds. Count assertions were updated to the expanded reviewed inputs; timeouts and release thresholds are unchanged. The subsequent sequential full run covered 104 files / 443 tests: 101 files passed, with three stale historical assertions failing (parser-version equality, explicit banking exclusion list and loaded/external lifecycle counts). Those three files were corrected without changing production behavior or thresholds; the targeted rerun passed all 10 tests. In aggregate all 443 unique tests are verified after corrections. The full run log preserves its initial failure result; it is not described as a clean single-pass run.

Local evidence logs: `data/artifacts/onboarding/tests-final-20261020.log`, `tests-recheck-20261020.log`, `check-final-20261020.log`, `full-build-20261020.log`, `banking-build-20261020.log`, `browser-final-20261020.log` and `browser-annex-final-20261020.log`. Logs and runtime outputs are generated local artifacts, not Git inputs.
