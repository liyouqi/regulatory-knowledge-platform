# Monitor Handoff History

Dated development and completion records extracted from the Monitor specification on 2026-10-03. The 2026-09-14 completion record supersedes the earlier development queue. Event counts, local Git state and test results describe those handoffs, not the current machine or deployment.

Use the [Monitor specification](../monitor/regulatory-monitor.md) for the V1 product and data boundaries and [Moving Development to Another Computer](../development-migration.md) for the maintained transfer checklist.

## 13. Development handoff — 2026-09-13

This section is the restart point for continuing Monitor work on another computer.

### Current implementation state

- implementation baseline commit: `071147a feat: broaden monitor coverage and static access`;
- the baseline is on `origin/main`;
- the working tree was clean after that commit;
- the Monitor UI, current-year timeline, month grouping, 20-item `Load more`, source/topic/sector filters, event brief, whole-event Copilot, and local read-only MCP entry are implemented;
- enabled sources are CSSF, EBA, joint ESAs publications, ESMA, EIOPA, AMLA, European Commission Finance, and the EUR-Lex public feed;
- the last local refresh produced 303 AI-enriched events across January–September 2026, with no basic/fallback events;
- generated Monitor data is ignored by Git and is not part of the Platform corpus, Runtime SQLite, or Earth artifact.

The company-report source set is covered: CSSF, ESAs, EBA, ESMA, AMLA, and European Commission/Official Journal-facing material. EIOPA adds insurance and pensions. The current unresolved source gap is full current-year Official Journal history: the latest EUR-Lex public RSS refresh returned zero matching items and does not backfill the year.

### Recommended transfer from the old computer

Use [Moving Development to Another Computer](../development-migration.md) as the authoritative project-wide checklist. It covers `.env`, Reader Canonical/raw data, the complete Galaxy artifact, Monitor data, disposable artifacts, clean rebuild options, and verification. Do not maintain a second transfer list in this Monitor document.

### Restart commands

With the recommended files in place:

```bash
npm run check
npm run dev
```

Open the Vite URL printed by the terminal, normally `http://localhost:5173/monitor`. Port `3000` is the API, not the browser UI.

To replace the copied Monitor cache or rebuild without copying it:

```bash
npm run monitor:refresh
```

The command is current-year only. With `PRIVATE_AI_*` configured it automatically enriches new events, reuses existing enriched records, and prints simple per-item and batch progress. Without that configuration it still writes basic source-derived events.

### Verification at handoff

- `npm run check`: passed;
- `npm run build`: passed;
- MCP integration test: 8/8 passed;
- browser check: annual feed, financial-sector filter, responsive MCP panel, initial Copilot explanation, and direct Chinese follow-up passed;
- full `npm test`: 311/312 passed. The unrelated existing failure is `src/release/verify-corpus.test.ts`, whose local assertion expects 28 raw snapshots while this machine contains 98.

### Continue in this order

1. Add a simple public, no-login EUR-Lex/Official Journal current-year backfill so delegated and implementing acts are not dependent on the latest RSS window.
2. Review the real 303-event page visually and make only concrete usability refinements; keep the Monitor UI independent from the main website.
3. Implement `Generate Monthly Report` after source coverage and browsing UX are accepted.
4. Consider Cloud Scheduler and remote MCP only later. Keep MCP static and read-only; do not expose Monitor AI through MCP.

RAG, text selection, workflow/task management, persistence infrastructure, rollback machinery, and historical years remain intentionally out of scope.

## 14. Completion handoff — 2026-09-14

The V1 work listed in the previous handoff is now complete in the working implementation.

### Completed after the 2026-09-13 handoff

- EUR-Lex now uses the public Publications Office Cellar SPARQL endpoint as its primary, no-login current-year backfill. The existing RSS collector remains a best-effort latest-publication supplement.
- The backfill is bounded by year, page size, maximum page count, English expression, legal-work CELEX shape, and financial-regulation title/reference terms. It remains an isolated Monitor source adapter and does not enter the Platform corpus or Runtime SQLite.
- EUR-Lex events retain the stable CELEX reference and expose their actual document type, such as Regulation or Decision, instead of flattening every item to `Publication`.
- The tracked fallback feed now contains a small current-year official baseline, so a fresh clone does not render an empty current-year Monitor before the first local refresh.
- `Generate Monthly Report` is implemented as a client-side report over the already loaded read-only timeline. It supports month selection, grouped report content, official links, important-date counts, printing, and browser `Save as PDF` without another backend or stored report format.
- Desktop browser review confirms the browsing page and monthly report preserve the independent warm-white/yellow/deep-teal visual system and keep the report content readable. Narrow-screen behavior is covered by browser automation.
- Annual-list behavior is covered with a synthetic 45-event browser test: the UI reveals 20, then 40, then all 45 records. This verifies the paging interaction without claiming that the old computer's local-only 303-event cache was available on this machine.

### Verification at completion

Completed on 2026-09-14:

```bash
npm run check                                                    # passed
npm test                                                         # 79 files, 317 tests passed
npm run build                                                     # passed
CI=1 npx playwright test e2e/monitor.spec.ts --project=chromium  # 3 passed
```

The EUR-Lex adapter also has targeted tests for bounded query construction, result mapping, and absence of authentication headers. The monthly report has unit tests for month filtering, ordering, grouping, and invalid input.

### Remaining optional operations

No required V1 development item remains. Cloud Scheduler deployment and remote MCP exposure are separate operational decisions and remain deferred. MCP stays local, static, and read-only. Historical-year collection, RAG, workflow/task management, and report persistence still require a separate scoped product decision rather than being added implicitly to V1.
