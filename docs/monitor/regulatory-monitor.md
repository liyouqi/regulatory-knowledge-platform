# Regulatory Monitor — Product and Technical Design v1.4

> Status: V1 implementation complete
> Date: 2026-09-14
> Product surface: `/monitor`
> Product language: English
> Design goal: simple, visually independent regulatory change monitoring with an easily repeatable data refresh pipeline

## 1. Product decision

Regulatory Monitor answers one practical question:

> What changed recently, and which changes may matter to my organisation?

It is a lightweight monitoring product, not a GRC workflow. The first release presents the current year of regulatory events from selected official sources, grouped by month, supports a small set of useful filters, and opens a focused event brief with a link to the official publication.

The Monitor is deliberately independent from the Regulatory Knowledge Platform Reader and Earth:

- its data is not part of the Platform corpus or runtime SQLite;
- its refresh schedule can change without rebuilding the Platform corpus;
- its page has its own information architecture and visual identity;
- it does not reuse the Reader layout or Earth renderer;
- it shares only the existing TypeScript application, build, server, and deployment.

## 2. V1 experience

The first usable page contains:

1. a compact product header and current-year summary;
2. filters for month, source, topic, and financial sector;
3. a reverse-chronological annual event feed grouped by month;
4. an event brief with deeper business impact and next-step content;
5. a direct link to the official source;
6. a visible `Generate Monthly Report` action.
7. a whole-event `Explain with AI` action when the configured provider is available.

The current year is the default period. The current month is visibly marked `In progress`. The browser initially shows 20 matching events and `Load more` advances through the already loaded annual feed in explicit pages of 20. Automatic infinite-scroll fetching is not used.

The report action opens a lightweight monthly report built directly from the loaded Monitor timeline. The report follows `topic → event → status/date → explanation → business takeaways → deadline/effective date → source`, supports month selection, and uses the browser print flow for printing or saving as PDF. It does not introduce a report service or persist a second report representation.

The visual reference is the Financial Times topic/myFT feed, adapted into a more energetic palette: a warm-white reading surface, yellow masthead, deep teal text, coral accents, dense headline-led updates, and a useful summary rail. It does not copy FT branding or assets. The page avoids a second hero heading beneath the masthead, same-page navigation that looks like tabs, landing-page typography, metric walls, decorative cards, pill-heavy metadata, and staged entrance animation.

Each event row must contain enough substance to be useful without opening the detail panel:

- authority, publication date, document type, and status;
- a concise summary;
- up to two concrete `What changed` points;
- topic and the first affected-entity label.

The detail panel must not simply repeat the feed row. It expands the event into the full change summary, business takeaways, suggested checks, affected entities and functions, important dates when available, and the official link. Its headline is a normal article heading, not a hero-sized title.

The content pattern is based on the supplied company monthly report. Its most useful structure is `category → event → status/date → explanation → business takeaways → deadline/effective date → source`. The long table of contents and glossary are useful for a generated PDF, but are not repeated in the browsing UI.

## 3. V1 scope

Enabled official sources:

- EUR-Lex;
- CSSF;
- EBA and joint European Supervisory Authorities publications;
- ESMA press releases and consultations;
- EIOPA news;
- AMLA consultations and regulatory publications;
- European Commission financial-services news.

This mix intentionally covers Luxembourg first, followed by banking, investment funds and securities markets, insurance and pensions, AML/CFT, and cross-sector EU financial policy. More sources remain additive adapters rather than a new pipeline.

Initial filters:

- month;
- source;
- topic;
- financial sector.

Shown but not required as a V1 filter:

- potentially affected functions;
- legal status;
- important dates.

Explicitly outside V1:

- task assignment and approval;
- workflow state and ownership;
- subscriptions and notifications;
- control or obligation mapping;
- audit trails;
- a Monitor database;
- a second frontend or backend framework.

## 4. Architecture

```text
CSSF / EBA / ESMA / EIOPA / AMLA / EC / EUR-Lex
          |
          v
  npm run monitor:refresh
          |
          v
  data/monitor/latest.json
          |
          v
  read-only Monitor API
          |
          v
  independent /monitor UI
```

The Monitor stays inside the current React + Vite + Express + TypeScript application. It does not add Next.js, FastAPI, Python, a queue, or a database.

Recommended ownership:

```text
src/monitor/
├── monitor-contract.ts     # Monitor-only event and feed types
├── monitor-refresh.ts      # small official-source collectors and JSON writer
├── monitor-refresh-cli.ts  # command-line entry point
├── monitor-router.ts       # read-only Express routes
└── web/                    # Monitor page and isolated CSS

data/monitor/       # Monitor-only refreshed JSON
```

The two application integration points are intentionally small:

- mount `/api/monitor/*` in the existing Express server;
- render the independent page for `/monitor` in the existing React application.

No Monitor module imports the Platform runtime repository, canonical document model, Earth artifact, or Platform search services.

## 5. Data model

One event separates downloaded facts from lightweight interpretation without creating multiple storage systems.

```ts
type RegulatoryEvent = {
  id: string
  source: {
    authority: 'EUR-Lex' | 'CSSF' | 'EBA' | 'ESAs' | 'ESMA' | 'EIOPA' | 'AMLA' | 'European Commission'
    title: string
    url: string
    publishedAt: string
    reference?: string
  }
  classification: {
    topic: string
    eventType: string
    status?: string
    affectedEntities: string[]
  }
  analysis: {
    summary: string
    keyPoints: string[]
    businessTakeaways?: string[]
    suggestedActions?: string[]
    importantDates?: Array<{ label: string; date: string }>
    potentiallyAffectedFunctions: string[]
  }
}
```

The split is for clarity in code and UI, not a high-assurance validation system. Official facts remain visibly attributable to their source; classifications and impact descriptions are presented as Monitor analysis.

If a publication does not provide evidence of a before/after comparison, the interface uses `Key points` or `Change summary`, not `What changed`.

## 6. Refresh pipeline

`npm run monitor:refresh` is the single refresh entry point. With no arguments it rebuilds every available month in the current year. A current-year month may be used for a smaller incremental refresh:

```bash
npm run monitor:refresh
npm run monitor:refresh -- --month 2026-09
npm run monitor:refresh -- --year 2026
```

Past years are rejected. The yearly command walks the enabled official archive pages until it reaches the prior year, reads the current EUR-Lex public feed, partitions matching events into monthly files, and enriches each event once. It does not run twelve independent monthly downloads. The public-source path does not require an EUR-Lex web-service account; the registered SOAP service is deliberately not part of this simple pipeline.

The CLI accepts either one month or a year. Annual refresh still writes separate monthly JSON files; the runtime timeline aggregates those files without creating a database or one large persistent document.

The command:

1. requests the relevant listing/archive pages from each enabled source;
   EUR-Lex's general feed is narrowed to financial-sector publications so unrelated EU budget and agency notices do not fill the product timeline;
2. opens each matching official publication page and extracts readable source text;
3. when `PRIVATE_AI_*` is configured, automatically uses that external model and the Monitor-owned enrichment prompt to create the summary, status, topic, affected population, business takeaways, suggested checks, and explicit important dates;
4. without AI configuration, keeps a basic listing-derived event rather than blocking the refresh;
5. writes one fresh JSON feed for the UI;
6. records source failures in refresh metadata while keeping successful source items.

During enrichment the CLI prints the month, AI item number, authority, abbreviated title, and completed batch count. It does not print the source body, prompt, API key, or model response.

This is not the Platform corpus pipeline and does not call `corpus:refresh`.

The pipeline may run locally, during image preparation, in Cloud Run, or from a scheduler. Cloud Run local storage is intentionally acceptable for this feature: Monitor data is disposable and can be reconstructed by running the refresh command again. No persistence service is required for V1.

Runtime syncing uses the same implementation through `POST /api/monitor/refresh`. The route is available when `MONITOR_REFRESH_TOKEN` is configured and accepts the token as `Authorization: Bearer <token>`. An optional Cloud Scheduler request can call this route; it does not introduce a second ingestion path.

## 7. Data and Git policy

Monitor data is isolated by location and ownership.

- refreshed data lives only under `data/monitor/`;
- it is not imported into Platform canonical JSON or SQLite;
- it is not included in Earth artifacts;
- large downloads and transient responses are not committed;
- a small default/demo feed may be shipped with the application so `/monitor` is useful before the first refresh.

The annual API aggregates the available monthly files at read time. Pagination is browser-side because a year of Monitor events remains a small payload; no pagination store or cursor service is introduced. The sector filter uses a small readable set such as banking, funds and asset management, insurance and pensions, securities and markets, payments, crypto-assets, and AML/CFT; exact affected populations remain visible in each event brief.

The refreshed feed can be replaced at any time. It is a rebuildable product cache, not the authoritative legal record.

On a new computer, copy or clone the code, install dependencies, configure the private model variables if enrichment is wanted, and run `npm run monitor:refresh`. The generated `data/monitor` files do not need to be copied from the old computer or committed to Git.

## 8. Monitor Copilot and AI enrichment

Monitor Copilot explains one complete regulatory event. It deliberately does not provide text selection:

- the useful unit in Monitor is the event, not a fragment of legal text;
- each feed row and event brief has an `Explain with AI` action;
- clicking it opens the Monitor-owned side panel and immediately generates the first explanation;
- the default explanation answers `what changed`, `why it matters`, and `what to check next`;
- follow-up questions remain tied to the same event;
- the panel shows an obvious `Thinking` animation while waiting.

This interaction is separate from the Reader Copilot. It does not reuse Reader selection, exact provision context, conversation storage, or visual components. It may reuse the same server-configured model connection. The server resolves the submitted event ID from the current Monitor feed before sending the event brief, so the browser does not provide authoritative event content.

Refresh-time enrichment uses that same `.env` model configuration, not a development-time Codex model. Its prompt is local to `src/monitor/monitor-enrichment.ts`, so the monitoring questions and output shape can evolve without changing Reader Copilot or relying on an external prompt service. The prompt is designed around the questions regulatory teams actually triage: legal status, concrete change, affected population, important dates, operational implications, and the next internal checks.

The generated answer is based on source metadata and Monitor analysis, not the full official publication. The panel says this directly and links back to the official source. It does not present the result as legal advice or a final applicability determination.

The current user question is the primary instruction to Monitor Copilot. A narrow follow-up is answered directly instead of regenerating the default four-part explanation. RAG and full-document retrieval remain later work.

AI enrichment is optional and follows the working page and refresh pipeline.

V1 does not require an LLM to collect or display events. When `PRIVATE_AI_*` is configured, enrichment creates summaries, one controlled topic, affected-entity hints, and potentially affected functions. These fields remain analysis, never official legal text.

No regulatory content is sent to an external model unless that provider has been explicitly configured and authorised.

## 9. Static MCP access

The page header exposes a small `MCP access` panel with the local stdio configuration. MCP adds two read-only tools: `list_monitor_updates` and `get_monitor_update`. They search or return the already stored current-year JSON and never invoke the enrichment model or Monitor Copilot. This is a local entry point, not a remotely hosted MCP endpoint.

## 10. UI independence

Monitor owns its CSS under `src/monitor/web/`. It does not use the main Reader shell, header, cards, theme toggle, or page composition.

It may share only low-level application infrastructure:

- React and React Router;
- the Vite build;
- Lucide icons;
- the Express origin;
- basic browser accessibility behaviour.

The route should look intentional when opened directly. A small back link may lead to the Platform, but the Monitor brand and navigation remain self-contained.

## 11. Delivery order

### Slice 1 — working product surface

- isolated `/monitor` page;
- small shipped feed;
- current-year timeline with month grouping and client-side `Load more` pagination;
- month, source, topic, and financial-sector filters;
- event detail view and official links;
- report button;
- responsive layout.

### Slice 2 — repeatable refresh

- `npm run monitor:refresh`;
- official source collectors covering Luxembourg and the main EU financial sectors;
- JSON output consumed by the same API and page;
- simple refresh metadata and partial-source reporting.

### Slice 3 — access and later output

- read-only static Monitor MCP tools;
- optional Cloud Scheduler trigger;
- client-side monthly report generation with browser print/save-PDF output.

## 12. Acceptance criteria

V1 is accepted when:

- `/monitor` opens as a visually independent product page;
- the page does not require the Platform SQLite data model;
- the bundled feed can be filtered and inspected;
- every event links to its official source;
- `npm run monitor:refresh` can replace the feed without changing UI code;
- a failed source does not prevent already collected source items from being written;
- the production image contains a usable baseline feed;
- ordinary project type checking and build complete successfully.

No broader test matrix, rollback subsystem, migration framework, or release gate is required for this feature.

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

Clone the code; do not copy the repository itself:

```bash
git clone git@github.com:liyouqi/regulatory-knowledge-platform.git
cd regulatory-knowledge-platform
npm install
git log -1 --oneline
```

Node.js 24 or newer and npm 11 or newer are expected.

Copy these local-only files/directories securely from the old computer:

```text
.env
data/artifacts/canonical/
data/artifacts/earth/earth.sqlite
data/monitor/                         # optional but recommended; about 940 KB
```

Why:

- `.env` contains `PRIVATE_AI_*` and is intentionally not in Git;
- `data/artifacts/canonical/` lets the normal `npm run dev` pre-step rebuild Runtime SQLite without downloading the legal corpus again;
- `data/artifacts/earth/earth.sqlite` preserves the locally built Earth view;
- copying `data/monitor/` preserves the current 303 enriched records and avoids immediately repeating external LLM calls. It may instead be omitted and rebuilt with `npm run monitor:refresh`.

Do not copy `node_modules/`, `dist/`, `data/artifacts/corpus-builds/`, `data/artifacts/runtime/`, or `data/artifacts/search/`. Runtime and search artifacts are rebuilt from Canonical. `data/raw/` is also unnecessary for normal UI development; copy it only when continuing source acquisition or parser work.

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
