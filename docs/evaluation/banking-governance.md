# Banking governance: bounded business-task audit

This records the initial navigation-only slice. The [2026-10-13 continuation](banking-workflows.md) documents subsequent question-search changes, live source currency checks and three internal workflow walkthroughs. The [2026-10-16 CRD upgrade](../reviews/crd-20261016.md) records the new source pin and rebased evaluations; the historical 0/18 search results and 2025 CRD pin below remain frozen, not current-state claims.

This slice improves evidence navigation across the **already loaded** CRD, EBA/GL/2021/05 and Circular CSSF 12/552. It adds no legal documents, parsing rules, canonical contracts, relationship semantics, answer generator or public API. Official text and existing `MANDATES`, `SUPPLEMENTS` and `IMPLEMENTS` edges remain unchanged.

The 18 questions are **internally authored editorial scenarios**, not observed customer questions or a representative user study. They test finding a selected starting provision, not the completeness of a legal answer or an institution's compliance. Business usefulness remains a hypothesis to validate with users.

## Use the slice

Open `/topics/banking-governance-internal-control`. The Topic now has **20 provision entries across three Documents**, up from three. Each entry displays a separate editorial navigation note; opening it leads to the unmodified Reader text. The taxonomy has three Topics and 27 assignments overall, version `1.1.0`. Membership is `EDITORIAL`, not a new legal relationship or applicability conclusion.

Use `/domains/banking-governance-internal-control` for the existing evidence-bearing CRD → EBA → CSSF relationship path. The Topic does not assert that every added provision forms a new official cross-document edge.

Topic detail now reads only its assigned Documents through the existing Runtime repository instead of parsing every Reader payload in the corpus. A targeted regression checks both the unchanged service output and the exact three-Document read set for this Topic. UI never reads raw sources or editorial source JSON.

## Frozen sources and version limits

The task dataset pins each source snapshot/version and each expected root Provision's text SHA-256 and source locator. Review exact source/version in the Reader before use:

| Document | Loaded text used by this audit | Official source |
|---|---|---|
| CRD IV | Consolidated text as of **2025-01-17**; not a claim to load the latest 2026 consolidation | [EUR-Lex loaded expression](https://eur-lex.europa.eu/eli/dir/2013/36/2025-01-17/eng) |
| EBA/GL/2021/05 | Pinned 2021 Guidelines PDF; no new assessment of ongoing review or replacement status | [EBA official PDF](https://www.eba.europa.eu/sites/default/files/document_library/Publications/Guidelines/2021/1016721/Final%20report%20on%20Guidelines%20on%20internal%20governance%20under%20CRD.pdf) |
| CSSF 12/552 | Pinned English PDF including amendments through **24/860**, landing-page update 2024-08-29; the PDF states that French prevails in discrepancies | [CSSF official source](https://www.cssf.lu/en/Document/circular-cssf-12-552/), [PDF](https://www.cssf.lu/wp-content/uploads/cssf12_552eng.pdf) |

These are loaded-source boundaries, not current-law or institution-specific applicability conclusions. The CSSF landing page/PDF were accessible in the online spot-check; EBA returned HTTP 403, so its online currency was **not** reverified. Pinned local evidence remained available and hash-checked. No source registry, snapshot pin or legal-nature status was silently updated.

## Questions and selected starting evidence

The full queries, Chinese scenario labels, source pins, locators and hashes are versioned in `data/benchmarks/banking-governance-tasks.json`. The first 17 retrieval queries are English business questions; the last is a Chinese-language diagnostic. Chinese labels below are editorial question prompts, not translations of legal text.

| # | Scenario | Selected starting evidence | Locator |
|---|---|---|---|
| 1 | 银行治理安排应从哪些条款开始查？ | CRD Article 74 | pinned XPath |
| 2 | 谁负责批准并定期审查银行的风险策略？ | CRD Article 76 | pinned XPath |
| 3 | 治理安排和利益冲突防范由谁承担责任？ | CRD Article 88 | pinned XPath |
| 4 | 管理机构的职责分工应在哪里记录？ | EBA paragraph 20 | PDF page 20 |
| 5 | 机构层面的利益冲突政策由谁监督？ | EBA paragraph 105 | PDF page 39 |
| 6 | 内控框架下业务条线的风险管理从哪里查？ | EBA paragraph 141 | PDF page 47 |
| 7 | 内部控制职能的独立性条件从哪里查？ | EBA paragraph 175 | PDF page 53 |
| 8 | 常设合规职能和负责人要求从哪里查？ | EBA paragraph 204 | PDF page 57 |
| 9 | 合规政策监督和法律变化评估从哪里查？ | EBA paragraph 208 | PDF page 57 |
| 10 | 内部审计的独立性和资源要求从哪里查？ | EBA paragraph 214 | PDF page 58 |
| 11 | 监督机构的会议记录要求从哪里查？ | CSSF Part II point 25 | PDF page 21 |
| 12 | 内部审计章程和多年审计计划由谁确认？ | CSSF Part II point 41 | PDF page 24 |
| 13 | 第二道和第三道防线对应哪些内控职能？ | CSSF Part II point 105 | PDF page 40 |
| 14 | 内控人员的任务和薪酬何时影响独立性？ | CSSF Part II point 109 | PDF page 41 |
| 15 | 内部控制职能的年度汇总报告要求从哪里查？ | CSSF Part II point 117 | PDF page 43 |
| 16 | 合规章程的内容与批准要求从哪里查？ | CSSF Part II point 139 | PDF page 50 |
| 17 | 内部审计计划的周期与风险导向覆盖从哪里查？ | CSSF Part II point 154 | PDF page 56 |
| 18 | 银行应该如何管理利益冲突？ | CSSF Part II point 168 | PDF page 60 |

## Repeatable evaluation

```sh
npm run runtime:build
npm run banking:benchmark
npm run citation:benchmark
```

`banking:benchmark` uses the existing Runtime repository, Topic service and citation retrieval service. It:

- checks the selected source pin/version/URL, exact locator and text hash;
- checks that each Topic link resolves to exactly the expected loaded Reader Provision, including CSSF Part namespaces;
- submits the **unchanged original query** both globally and with the selected Document scope, requesting Top 5;
- counts a retrieval hit only for the expected root Provision or one of its descendants, not merely the same law;
- records runtime build/Profile identity, dataset hash, case-level ranks and failures under ignored `data/artifacts/evaluations/banking-governance/`.

Evidence/navigation failures return a nonzero exit code. Search hit rates are explicitly **diagnostic**, with no arbitrary pass threshold and no desired score asserted by tests. This new audit is not wired into release gates and does not replace or weaken the original three-case Top-1 citation regression gate. It does not call an LLM or evaluate generated answers.

## Observed result and gaps

Both runs used dataset SHA-256 `6e90a57c597d656b324a1765f3485da570d2ef449b084edb8501f82ed90ecd75` and the same three source pins. The before/after runtime identities were `runtime-5.8.0-c030abcffab23e31` and `runtime-5.8.0-756405eab297e0c9` respectively.

| Check | Before | After |
|---|---:|---:|
| Selected exact evidence available and unchanged | 18/18 | 18/18 |
| Topic entry resolves to expected Reader provision | 1/18 | 18/18 |
| Original-question global Top-5 retrieval hit | 0/18 | 0/18 |
| Original-question Document-scoped Top-5 retrieval hit | 0/18 | 0/18 |

The demonstrated improvement is **navigation coverage**, not natural-language search or market validation. Search code/ranking was not changed. `parseFullTextQuery` retains up to eight ordinary terms, creates prefix matches and joins them with `AND`; question words are not removed. Consequently, this is currently a keyword search interface, not a business-question answering interface. Chinese-to-English retrieval is also not supplied by this pipeline.

Priority follow-up:

1. **Retrieval usability:** test a separately reviewed question/keyword handling improvement against this frozen set and existing exact-citation/quoted-phrase regressions. Preserve failures and distinguish English-query and Chinese-query results; do not tune this set by replacing questions with copied text fragments.
2. **Loaded-version freshness:** review the current CRD expression and EBA review status through the existing source workflow before making current-law claims. The sources are sufficient to test these navigation scenarios, not to establish full contemporary legal coverage.
3. **Observed user value:** ask banking compliance/internal-control users to perform the tasks; record successful evidence location, effort and missing questions. No time-saving or ROI claim is made from this synthetic audit.
4. **Corpus expansion:** add documents only when one of those tasks establishes a missing-source gap. No missing starting evidence was found for these 18 selected scenarios; broader governance completeness has not been established.

## Verification

- `npm run check`, `npm run build`, and `npm run runtime:verify`: passed.
- Final `npm test`: **95 files, 393 tests passed**.
- Existing `npm run citation:benchmark`: **3/3 Top-1 cases passed**, unchanged.
- `e2e/banking-governance.spec.ts`: **2/2 passed**, including the exact CSSF Part II Reader jump and existing directed official mappings. The local run used installed Google Chrome via a temporary config because the Playwright-managed browser was not installed; the project browser configuration was not changed.
- Data remains about **1.4 GiB**. No additional Canonical corpus-build snapshots were created; raw sources and generated reports/runtime artifacts remain Git-ignored.

These are local implementation checks, not a remote deployment, source-currency certification or user-value study.
