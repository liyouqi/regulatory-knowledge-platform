# Banking governance: question retrieval, currency review and workflow trial kit

Scope: a local, bounded evidence-location workflow, not a legal-answer generator or a completed customer study. Baseline navigation was committed separately as `2b3925e`. No source pins, legal parsers, canonical contracts, relationship directions or release thresholds were changed in this continuation.

## 1. Business-question search

Full-text search now detects unquoted English questions, removes a bounded grammatical stop-word list, uses short inflection prefixes, retrieves at most 200 lexical candidates, requires at least two content-prefix matches, and ranks by content-term coverage then BM25 with stable ties. Question results keep the best location per root Provision. This is partial **lexical matching**, not semantic reasoning or a legal answer.

Ordinary keyword queries, explicit numbers/identifiers, quoted phrases and queries containing an explicit negative marker (`not`, `never`, `without`, `except`, `exclude` or `不/非/除外`) retain the existing strict AND/phrase behaviour and global document diversity. This does not provide meaning-aware treatment of legal predicates, modalities, contractions or other forms of negation. Definition and law-identity search are unchanged. SQL uses bound parameters; raw FTS syntax is never executed.

Chinese support is a small, explicit search-concept vocabulary, not general translation. Its two diagnostic questions still miss the expected Top-5 provision. Unsupported vocabulary must not be presented as an answered question.

In the Web search dialog, select **Full text**, enter the question, and optionally choose a loaded law in **Evidence scope**. Scope is applied before ranking and options come only from the active Runtime/Profile catalog. The dialog displays normalized terms and a non-answer disclaimer. Reader displays the loaded text date and a current-source caution outside the official provision body.

| Frozen question set | Global Top-5 expected-provision hits | Document-scoped Top-5 hits |
|---|---:|---:|
| Original 18 (17 English + 1 Chinese) | 15/18, previously 0/18 | 17/18, previously 0/18 |
| Separate 6-question holdout (5 English + 1 Chinese) | 3/6 | 5/6 |

The holdout queries/targets were written before evaluating the new algorithm and were not changed after seeing its results. These small editorial sets do not establish broad real-user accuracy. The remaining global misses are governance arrangements and audit resources in the original set, regulatory-change and board-minutes tasks in the holdout, and both Chinese questions. Document scope is a usable workaround, not a disguised global-search success.

```sh
npm run banking:benchmark
npm run banking:benchmark -- --dataset data/benchmarks/banking-governance-holdout.json
npm run citation:benchmark
npm run search:benchmark
```

The original question dataset/pins/hashes remain frozen. Its `queryRewriting: false` refers to the audit caller submitting the original question unchanged; SearchService now performs the documented question normalization. Retrieval hit counts remain diagnostic and do not relax existing release or three-case citation gates. Generated reports carry the dataset and runtime identity under ignored `data/artifacts/evaluations/`.

## 2. Source currency review — 2026-10-13

The reviewed observations and evidence hashes are in `data/editorial/banking-governance-currency-review.json`. Raw acquisition evidence is separately retained under ignored `data/raw/currency-audit/2026-10-13/`.

| Source | Verified finding | Action |
|---|---|---|
| CRD | The live official CELLAR tree notice lists English Formex consolidations through **2026-07-11**; loaded pin remains **2025-01-17** | Corrected only loaded Expression `currencyStatus` to `historical`. Review/onboard `02013L0036-20260711` through the existing fidelity/pin workflow before claiming latest text. |
| EBA/GL/2021/05 | Download SHA-256 `1529fbe9d55b…` matches the loaded pin. Live landing page marks the final report **In force** and links an **Ongoing review** | Keep the pin. Monitor the revision; do not adopt consultation content as final text or replace the pinned paragraph-14 date with a different landing-page field. |
| CSSF 12/552 | Download SHA-256 `dbea9517a19d…` matches the loaded pin, including amendments through **24/860** | Keep the pin. The English PDF does not replace the prevailing French text or institution/national-law review. |

Official evidence: [CELLAR CRD directory](https://publications.europa.eu/resource/celex/32013L0036?language=en), [EUR-Lex version information](https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX%3A02013L0036-20260111), [EBA page](https://www.eba.europa.eu/activities/single-rulebook/regulatory-activities/internal-governance/guidelines-internal-governance-under-crd), [EBA PDF](https://www.eba.europa.eu/sites/default/files/document_library/Publications/Guidelines/2021/1016721/Final%20report%20on%20Guidelines%20on%20internal%20governance%20under%20CRD.pdf), [CSSF PDF](https://www.cssf.lu/wp-content/uploads/cssf12_552eng.pdf).

The Web browsing connector returned challenges/403 for some EUR-Lex/EBA pages; direct read-only official HTTP downloads succeeded. Four full evidence hashes are verified by `banking:workflows`. If the raw audit files are absent on another machine, the report explicitly records them as unavailable, not locally reverified. These dated checks do not certify all contemporary banking law.

## 3. Three internal workflow walkthroughs

```sh
npm run banking:workflows
```

This uses the existing read-only Runtime, citation/Topic services and frozen task queries. It writes an ignored evidence pack with exact citation-context text segments, root/Block IDs, official source URLs, locators, snapshot/build identity, question results and the currency-review actions. Text is not rewritten into an invented compliance answer. Source pin mismatches or available-but-corrupt audit files fail closed.

| Workflow | Selected starting evidence | Document-scoped retrieval | Global retrieval |
|---|---|---:|---:|
| 合规检查：利益冲突政策、合规职能与合规章程 | EBA paragraphs 105/204; CSSF Part II point 139 | 3/3 | 3/3 |
| 内部审计：资源独立性、审计章程与风险导向计划 | EBA paragraph 214; CSSF Part II points 41/154 | 3/3 | 2/3 |
| 董事会材料：治理责任、职责分工与会议记录 | CRD Article 88; EBA paragraph 20; CSSF Part II point 25 | 3/3 | 3/3 |

All three pass the bounded technical walk-through (source/text integrity → scoped retrieval → exact Topic/Reader navigation). This does **not** establish complete audit requirements, institutional applicability or current-law clearance. The generated report fixes `userValueVerified`, `currentLawClearance` and `institutionApplicabilityAssessed` to false; human trial fields remain null.

## 4. Actual user trial — pending, not simulated

Use [the blank CSV template](templates/banking-governance-user-trial.csv). Ask an actual banking compliance/internal-control colleague to perform one or more tasks:

1. Record institution type/jurisdiction and an anonymous participant code; no client transactions or personal information.
2. Write their own business question before searching; do not hand them a copied legal-text fragment.
3. Search globally, then scope to a law if necessary; record both outcomes separately.
4. Open the cited Reader provision, check the complete text, source/date and official cross-document context, and record missing or unacceptable evidence.
5. Record actual start/end timestamps and whether the result was accepted **as starting evidence**. Review current-law/institutional scope separately; do not turn this into an automatic legal conclusion.

No trial participant has been contacted, no user acceptance has been recorded, and no human time-saving/ROI number has been invented. The next acceptance decision requires real feedback. The current engineering evidence supports usability improvement, not a market-value claim.

## Verification

- `npm run check`, `npm run build`, `npm run runtime:verify`: passed; 101 loaded Documents and no reviewed-input issues.
- Final `npm test`: **97 files, 401 tests passed**.
- Browser verification with installed Chrome: **4/4 passed** (business question → exact CRD evidence, real Document scope request, Topic → exact CSSF Part II point, unchanged official relationship directions). Project browser config was not changed.
- Original citation Top-1 regression: **3/3 passed**. Existing keyword/definition search evaluation passed; its measured warm P95 was 10.413 ms on this local Intel machine. This latency is not a business-question latency claim.
- Original frozen dataset SHA-256: `6e90a57c597d656b324a1765f3485da570d2ef449b084edb8501f82ed90ecd75`; separate holdout: `4056d41a969ce2bcc76fd6d3733f181fd9fe8bfb22241c65236d284ff17b46a9`.
- Both question sets and all three workflow walkthroughs were evaluated against `runtime-5.8.0-1f518b2e5c584f34`. Data remains approximately 1.4 GiB. Raw acquisitions, exact-text evidence packs, runtime SQLite and generated evaluation reports are not committed.
