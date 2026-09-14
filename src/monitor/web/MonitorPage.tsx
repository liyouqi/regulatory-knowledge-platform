import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  Copy,
  ExternalLink,
  FileDown,
  Network,
  Send,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import {
  type FormEvent,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import type {
  MonitorAiMessage,
  MonitorExplainResponse,
  MonitorTimeline,
  MonitorEvent as RegulatoryEvent,
} from "../monitor-contract";
import { MonthlyReport } from "./MonthlyReport";
import "./monitor.css";

type Filters = {
  month: string;
  source: string;
  topic: string;
  sector: string;
};

const ALL = "All";
const PAGE_SIZE = 20;
const CURRENT_YEAR = new Date().getUTCFullYear().toString();
const SOURCE_ORDER = [
  "CSSF",
  "ESAs",
  "EBA",
  "ESMA",
  "AMLA",
  "EUR-Lex",
  "European Commission",
  "EIOPA",
];
const SECTOR_ORDER = [
  "Banking",
  "Funds & asset management",
  "Insurance & pensions",
  "Securities & markets",
  "Payments & e-money",
  "Crypto-assets",
  "AML/CFT",
  "Cross-sector",
];
const MCP_CONFIG = `{
  "mcpServers": {
    "regulatory-monitor": {
      "command": "npm",
      "args": ["run", "--silent", "mcp"],
      "cwd": "/path/to/regulatory-knowledge-platform"
    }
  }
}`;

function unique(items: string[]): string[] {
  return [...new Set(items)].sort((left, right) => left.localeCompare(right));
}

function displayMonth(month: string): string {
  const [year, rawMonth] = month.split("-").map(Number);
  if (!year || !rawMonth) return month;
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, rawMonth - 1, 1)));
}

function displayDate(date: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(date));
}

function eventSummary(event: RegulatoryEvent): string {
  return (
    event.analysis.summary ??
    "Open the official publication for the complete regulatory update."
  );
}

function eventSectors(event: RegulatoryEvent): string[] {
  const text = [
    event.source.title,
    event.classification.topic,
    ...event.classification.affectedEntities,
  ]
    .join(" ")
    .toLowerCase();
  const sectors = [
    [/bank|credit institution|prudential|crr|crd/, "Banking"],
    [
      /fund|ucits|aifm|asset manag|investment manag/,
      "Funds & asset management",
    ],
    [/insur|reinsur|pension|iorp|solvency/, "Insurance & pensions"],
    [
      /investment firm|broker|securit|trading venue|market infrastructure|\bccp\b|\bcsd\b|emir|mifid/,
      "Securities & markets",
    ],
    [/payment|e-money|electronic money/, "Payments & e-money"],
    [/crypto|mica|token/, "Crypto-assets"],
    [/aml|money laundering|financial crime|obliged entit/, "AML/CFT"],
  ]
    .filter(([pattern]) => (pattern as RegExp).test(text))
    .map(([, sector]) => sector as string);
  return sectors.length > 0 ? sectors : ["Cross-sector"];
}

function FilterSelect({
  label,
  value,
  values,
  onChange,
  renderValue = (item) => item,
}: {
  label: string;
  value: string;
  values: string[];
  onChange: (value: string) => void;
  renderValue?: (value: string) => string;
}) {
  return (
    <label className="monitor-filter">
      <span>{label}</span>
      <span className="monitor-select-wrap">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value={ALL}>{ALL}</option>
          {values.map((item) => (
            <option key={item} value={item}>
              {renderValue(item)}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden="true" size={14} />
      </span>
    </label>
  );
}

function DetailPanel({
  event,
  initialMode,
  month,
  onClose,
}: {
  event: RegulatoryEvent;
  initialMode: "brief" | "copilot";
  month: string;
  onClose: () => void;
}) {
  const [mode, setMode] = useState(initialMode);
  const [messages, setMessages] = useState<MonitorAiMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [thinking, setThinking] = useState(false);
  const [copilotError, setCopilotError] = useState("");
  const started = useRef(false);

  useEffect(() => {
    const close = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === "Escape") onClose();
    };
    globalThis.addEventListener("keydown", close);
    return () => globalThis.removeEventListener("keydown", close);
  }, [onClose]);

  const askCopilot = useCallback(
    async (nextQuestion: string, showQuestion = true) => {
      const trimmed = nextQuestion.trim();
      if (!trimmed || thinking) return;
      const history = messages;
      if (showQuestion) {
        setMessages((current) => [...current, { role: "user", text: trimmed }]);
      }
      setThinking(true);
      setCopilotError("");
      try {
        const response = await fetch("/api/monitor/explain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventId: event.id,
            month,
            question: trimmed,
            messages: history,
          }),
        });
        const body = (await response.json()) as
          | MonitorExplainResponse
          | { error?: string };
        if (!response.ok || !("answer" in body)) {
          throw new Error(
            "error" in body && body.error
              ? body.error
              : "Monitor Copilot could not answer.",
          );
        }
        setMessages((current) => [
          ...current,
          { role: "assistant", text: body.answer },
        ]);
      } catch (error) {
        setCopilotError(
          error instanceof Error
            ? error.message
            : "Monitor Copilot could not answer.",
        );
      } finally {
        setThinking(false);
      }
    },
    [event.id, messages, month, thinking],
  );

  const openCopilot = useCallback(() => {
    setMode("copilot");
    if (!started.current) {
      started.current = true;
      void askCopilot(
        "Explain this regulatory update. Tell me what changed, why it matters, and what I should check next.",
        false,
      );
    }
  }, [askCopilot]);

  useEffect(() => {
    if (initialMode === "copilot") openCopilot();
  }, [initialMode, openCopilot]);

  function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuestion = question;
    setQuestion("");
    void askCopilot(nextQuestion);
  }

  return (
    <div className="monitor-detail-layer">
      <button
        aria-label="Close event details"
        className="monitor-detail-backdrop"
        onClick={onClose}
        type="button"
      />
      <aside aria-label="Regulatory event details" className="monitor-detail">
        <div className="monitor-detail-topline">
          {mode === "copilot" ? (
            <button
              className="monitor-detail-back"
              onClick={() => setMode("brief")}
              type="button"
            >
              <ChevronLeft aria-hidden="true" size={16} /> Event brief
            </button>
          ) : (
            <span>Event brief</span>
          )}
          <button aria-label="Close" onClick={onClose} type="button">
            <X aria-hidden="true" size={18} />
          </button>
        </div>

        {mode === "brief" ? (
          <>
            <p className="monitor-detail-meta">
              {event.source.authority} · {displayDate(event.source.publishedAt)}
            </p>
            <h2>{event.source.title}</h2>
            <p className="monitor-detail-summary">{eventSummary(event)}</p>

            <div className="monitor-detail-classification">
              <span>{event.classification.topic}</span>
              <span>{event.classification.eventType}</span>
              {event.classification.status ? (
                <span>{event.classification.status}</span>
              ) : null}
            </div>

            <button
              className="monitor-copilot-launch"
              onClick={openCopilot}
              type="button"
            >
              <Sparkles aria-hidden="true" size={17} />
              <span>
                <strong>Explain this update</strong>
                <small>Open Copilot with this event already in context</small>
              </span>
              <ArrowUpRight aria-hidden="true" size={17} />
            </button>

            {event.analysis.keyPoints.length > 0 ? (
              <section className="monitor-detail-section">
                <h3>What changed</h3>
                <ul>
                  {event.analysis.keyPoints.map((point) => (
                    <li key={point}>
                      <Check aria-hidden="true" size={14} />
                      <p>{point}</p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {event.analysis.businessTakeaways?.length ? (
              <section className="monitor-detail-section monitor-takeaway-section">
                <h3>Why it matters</h3>
                <ul>
                  {event.analysis.businessTakeaways.map((point) => (
                    <li key={point}>
                      <span aria-hidden="true">→</span>
                      <p>{point}</p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {event.analysis.suggestedActions?.length ? (
              <section className="monitor-detail-section">
                <h3>What to check next</h3>
                <ol>
                  {event.analysis.suggestedActions.map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ol>
              </section>
            ) : null}

            {event.analysis.importantDates?.length ? (
              <section className="monitor-detail-section monitor-important-dates">
                <h3>Important dates</h3>
                {event.analysis.importantDates.map((item) => (
                  <div key={`${item.label}-${item.date}`}>
                    <time dateTime={item.date}>{displayDate(item.date)}</time>
                    <p>{item.label}</p>
                  </div>
                ))}
              </section>
            ) : null}

            <section className="monitor-detail-section monitor-impact">
              <h3>Who may be affected</h3>
              <div>
                <small>Entities</small>
                <p>
                  {event.classification.affectedEntities.join(", ") ||
                    "Broad market"}
                </p>
              </div>
              <div>
                <small>Functions</small>
                <p>
                  {event.analysis.potentiallyAffectedFunctions.join(", ") ||
                    "To be assessed"}
                </p>
              </div>
            </section>

            <a
              className="monitor-official-link"
              href={event.source.url}
              rel="noreferrer"
              target="_blank"
            >
              Read the official publication
              <ExternalLink aria-hidden="true" size={15} />
            </a>
          </>
        ) : (
          <div className="monitor-copilot">
            <p className="monitor-copilot-kicker">
              <Sparkles aria-hidden="true" size={14} /> Monitor Copilot
            </p>
            <h2>Understand this update</h2>
            <div className="monitor-copilot-context">
              <span>{event.source.authority}</span>
              <strong>{event.source.title}</strong>
            </div>

            <div aria-live="polite" className="monitor-copilot-messages">
              {messages.map((message, index) => (
                <div
                  className={`monitor-copilot-message ${message.role}`}
                  key={`${message.role}-${index}`}
                >
                  <small>
                    {message.role === "assistant" ? "Copilot" : "You"}
                  </small>
                  <p>{message.text}</p>
                </div>
              ))}
              {thinking ? (
                <div className="monitor-copilot-thinking">
                  <span aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                  Thinking about this update…
                </div>
              ) : null}
              {copilotError ? (
                <div className="monitor-copilot-error">
                  <p>{copilotError}</p>
                  <button
                    onClick={() =>
                      void askCopilot(
                        "Explain this regulatory update. Tell me what changed, why it matters, and what I should check next.",
                        false,
                      )
                    }
                    type="button"
                  >
                    Try again
                  </button>
                </div>
              ) : null}
            </div>

            <form
              className="monitor-copilot-composer"
              onSubmit={submitQuestion}
            >
              <label htmlFor="monitor-copilot-question">Ask a follow-up</label>
              <div>
                <textarea
                  id="monitor-copilot-question"
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="For example: Which teams should review this?"
                  rows={2}
                  value={question}
                />
                <button
                  aria-label="Send question"
                  disabled={!question.trim() || thinking}
                  type="submit"
                >
                  <Send aria-hidden="true" size={17} />
                </button>
              </div>
            </form>
            <p className="monitor-copilot-note">
              AI explanation based on this Monitor brief. Check the official
              publication before relying on it.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}

export function MonitorPage() {
  const [feed, setFeed] = useState<MonitorTimeline | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [error, setError] = useState("");
  const [mcpOpen, setMcpOpen] = useState(false);
  const [mcpCopied, setMcpCopied] = useState(false);
  const [reportMonth, setReportMonth] = useState<string | null>(null);
  const [selected, setSelected] = useState<{
    event: RegulatoryEvent;
    mode: "brief" | "copilot";
  } | null>(null);
  const [filters, setFilters] = useState<Filters>({
    month: ALL,
    source: ALL,
    topic: ALL,
    sector: ALL,
  });

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    void fetch(`/api/monitor/timeline?year=${CURRENT_YEAR}`, {
      signal: controller.signal,
    })
      .then(async (feedResponse) => {
        if (!feedResponse.ok)
          throw new Error("The Monitor feed is unavailable.");
        return (await feedResponse.json()) as MonitorTimeline;
      })
      .then((nextFeed) => {
        setFeed(nextFeed);
        setVisibleCount(PAGE_SIZE);
      })
      .catch((caught: unknown) => {
        if ((caught as DOMException).name !== "AbortError") {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load Monitor.",
          );
        }
      });
    return () => controller.abort();
  }, []);

  const options = useMemo(() => {
    const events = feed?.events ?? [];
    return {
      months: unique(
        events.map((event) => event.source.publishedAt.slice(0, 7)),
      ).reverse(),
      sources: unique(events.map((event) => event.source.authority)).sort(
        (left, right) =>
          SOURCE_ORDER.indexOf(left) - SOURCE_ORDER.indexOf(right),
      ),
      topics: unique(events.map((event) => event.classification.topic)),
      sectors: SECTOR_ORDER.filter((sector) =>
        events.some((event) => eventSectors(event).includes(sector)),
      ),
    };
  }, [feed]);

  const filteredEvents = useMemo(
    () =>
      (feed?.events ?? []).filter(
        (event) =>
          (filters.month === ALL ||
            event.source.publishedAt.startsWith(filters.month)) &&
          (filters.source === ALL ||
            event.source.authority === filters.source) &&
          (filters.topic === ALL ||
            event.classification.topic === filters.topic) &&
          (filters.sector === ALL ||
            eventSectors(event).includes(filters.sector)),
      ),
    [feed, filters],
  );
  const visibleEvents = filteredEvents.slice(0, visibleCount);

  function updateFilter(name: keyof Filters, value: string) {
    setFilters((current) => ({ ...current, [name]: value }));
    setVisibleCount(PAGE_SIZE);
  }

  const activeFilterCount = Object.values(filters).filter(
    (value) => value !== ALL,
  ).length;
  const sourceCount = options.sources.length;
  const topicCount = unique(
    (feed?.events ?? []).map((event) => event.classification.topic),
  ).length;
  const eventsBySource = options.sources.map((source) => ({
    source,
    count: (feed?.events ?? []).filter(
      (event) => event.source.authority === source,
    ).length,
  }));
  const currentMonth = new Date().toISOString().slice(0, 7);

  return (
    <main className="monitor-root">
      <header className="monitor-site-header">
        <div className="monitor-utility">
          <Link className="monitor-back" to="/">
            <ArrowLeft aria-hidden="true" size={14} /> Regulatory Knowledge
          </Link>
          <span className="monitor-refresh-date">
            {feed
              ? `Last refreshed ${new Date(feed.generatedAt).toLocaleDateString("en-GB")}`
              : "Loading latest edition"}
          </span>
          <div className="monitor-utility-actions">
            <button
              className="monitor-mcp-button"
              onClick={() => setMcpOpen((current) => !current)}
              type="button"
            >
              <Network aria-hidden="true" size={15} /> MCP access
            </button>
            <button
              className="monitor-report-button"
              disabled={!feed || options.months.length === 0}
              onClick={() =>
                setReportMonth(
                  filters.month !== ALL
                    ? filters.month
                    : (options.months[0] ?? currentMonth),
                )
              }
              type="button"
            >
              <FileDown aria-hidden="true" size={15} />
              Generate Monthly Report
            </button>
          </div>
        </div>
        <a className="monitor-masthead" href="/monitor">
          Regulatory Monitor
        </a>
      </header>

      {mcpOpen ? (
        <dialog
          aria-label="Monitor MCP access"
          className="monitor-mcp-panel"
          open
        >
          <div className="monitor-mcp-panel-heading">
            <div>
              <span>Local, read-only access</span>
              <h2>Monitor MCP</h2>
            </div>
            <button
              aria-label="Close MCP access"
              onClick={() => setMcpOpen(false)}
              type="button"
            >
              <X aria-hidden="true" size={17} />
            </button>
          </div>
          <p>
            Query stored current-year updates with{" "}
            <code>list_monitor_updates</code> and{" "}
            <code>get_monitor_update</code>. No MCP tool can call AI.
          </p>
          <pre>{MCP_CONFIG}</pre>
          <button
            className="monitor-mcp-copy"
            onClick={() => {
              void navigator.clipboard.writeText(MCP_CONFIG);
              setMcpCopied(true);
            }}
            type="button"
          >
            {mcpCopied ? (
              <Check aria-hidden="true" size={14} />
            ) : (
              <Copy aria-hidden="true" size={14} />
            )}
            {mcpCopied ? "Copied" : "Copy configuration"}
          </button>
        </dialog>
      ) : null}

      <div className="monitor-page">
        <div className="monitor-content-grid">
          <section className="monitor-feed-column" id="updates">
            <div className="monitor-filterbar">
              <div className="monitor-filter-title">
                <SlidersHorizontal aria-hidden="true" size={15} />
                Filter
                {activeFilterCount > 0 ? <b>{activeFilterCount}</b> : null}
              </div>
              <div className="monitor-filter-controls">
                <FilterSelect
                  label="Month"
                  onChange={(month) => updateFilter("month", month)}
                  renderValue={displayMonth}
                  value={filters.month}
                  values={options.months}
                />
                <FilterSelect
                  label="Source"
                  onChange={(source) => updateFilter("source", source)}
                  value={filters.source}
                  values={options.sources}
                />
                <FilterSelect
                  label="Topic"
                  onChange={(topic) => updateFilter("topic", topic)}
                  value={filters.topic}
                  values={options.topics}
                />
                <FilterSelect
                  label="Sector"
                  onChange={(sector) => updateFilter("sector", sector)}
                  value={filters.sector}
                  values={options.sectors}
                />
              </div>
            </div>

            <div className="monitor-feed-heading">
              <h1>Updates</h1>
              <p>
                Showing {visibleEvents.length} of {filteredEvents.length}
              </p>
            </div>

            {error ? <p className="monitor-state">{error}</p> : null}
            {!feed && !error ? (
              <p aria-live="polite" className="monitor-state">
                Loading this year's updates…
              </p>
            ) : null}

            <div className="monitor-event-list">
              {visibleEvents.map((event, index) => {
                const month = event.source.publishedAt.slice(0, 7);
                const previousMonth = visibleEvents[
                  index - 1
                ]?.source.publishedAt.slice(0, 7);
                return (
                  <Fragment key={event.id}>
                    {month !== previousMonth ? (
                      <div className="monitor-month-divider">
                        <h2>{displayMonth(month)}</h2>
                        {month === currentMonth ? (
                          <span>In progress</span>
                        ) : null}
                      </div>
                    ) : null}
                    <article className="monitor-event">
                      <button
                        className="monitor-event-open"
                        onClick={() => setSelected({ event, mode: "brief" })}
                        type="button"
                      >
                        <span className="monitor-event-meta">
                          <strong>{event.source.authority}</strong>
                          <span>{displayDate(event.source.publishedAt)}</span>
                          <span>{event.classification.eventType}</span>
                          {event.source.reference ? (
                            <span>{event.source.reference}</span>
                          ) : null}
                        </span>
                        <span className="monitor-event-copy">
                          <strong>{event.source.title}</strong>
                          <p>{eventSummary(event)}</p>
                          {event.analysis.keyPoints.length > 0 ? (
                            <span className="monitor-event-takeaways">
                              <b>What changed</b>
                              <ul>
                                {event.analysis.keyPoints
                                  .slice(0, 2)
                                  .map((point) => (
                                    <li key={point}>{point}</li>
                                  ))}
                              </ul>
                            </span>
                          ) : null}
                          <span className="monitor-event-event-meta">
                            <i>{event.classification.topic}</i>
                            {event.classification.status ? (
                              <i>{event.classification.status}</i>
                            ) : null}
                            <i>
                              {event.classification.affectedEntities[0] ??
                                "Broad market"}
                            </i>
                          </span>
                        </span>
                        <ArrowUpRight
                          className="monitor-event-arrow"
                          aria-hidden="true"
                          size={18}
                        />
                      </button>
                      <button
                        className="monitor-event-ai"
                        onClick={() => setSelected({ event, mode: "copilot" })}
                        type="button"
                      >
                        <Sparkles aria-hidden="true" size={14} /> Explain with
                        AI
                      </button>
                    </article>
                  </Fragment>
                );
              })}
            </div>

            {visibleEvents.length < filteredEvents.length ? (
              <button
                className="monitor-load-more"
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                type="button"
              >
                Load more
                <span>
                  {filteredEvents.length - visibleEvents.length} remaining
                </span>
              </button>
            ) : null}

            {feed && filteredEvents.length === 0 ? (
              <div className="monitor-empty">
                <CalendarDays aria-hidden="true" size={21} />
                <p>No updates match these filters.</p>
                <button
                  onClick={() => {
                    setFilters({
                      month: ALL,
                      source: ALL,
                      topic: ALL,
                      sector: ALL,
                    });
                    setVisibleCount(PAGE_SIZE);
                  }}
                  type="button"
                >
                  Clear filters
                </button>
              </div>
            ) : null}
          </section>

          <aside className="monitor-summary-rail" id="summary">
            <section>
              <h2>{CURRENT_YEAR} overview</h2>
              <dl>
                <div>
                  <dt>Updates</dt>
                  <dd>{feed?.events.length ?? "—"}</dd>
                </div>
                <div>
                  <dt>Sources</dt>
                  <dd>{sourceCount || "—"}</dd>
                </div>
                <div>
                  <dt>Topics</dt>
                  <dd>{topicCount || "—"}</dd>
                </div>
              </dl>
            </section>
            <section id="sources">
              <h2>By authority</h2>
              <ul>
                {eventsBySource.map(({ source, count }) => (
                  <li key={source}>
                    <span>{source}</span>
                    <strong>{count}</strong>
                  </li>
                ))}
              </ul>
            </section>
            <section className="monitor-about-feed">
              <h2>About this feed</h2>
              <p>
                Official publications, organised for orientation. Open the
                source before relying on an update as a legal record.
              </p>
            </section>
          </aside>
        </div>
      </div>

      <footer className="monitor-footer">
        <span>Regulatory Monitor</span>
        <small>European financial regulatory intelligence</small>
      </footer>

      {selected ? (
        <DetailPanel
          event={selected.event}
          initialMode={selected.mode}
          key={`${selected.event.id}-${selected.mode}`}
          month={selected.event.source.publishedAt.slice(0, 7)}
          onClose={() => setSelected(null)}
        />
      ) : null}
      {feed && reportMonth ? (
        <MonthlyReport
          month={reportMonth}
          months={options.months}
          onClose={() => setReportMonth(null)}
          onMonthChange={setReportMonth}
          timeline={feed}
        />
      ) : null}
    </main>
  );
}
