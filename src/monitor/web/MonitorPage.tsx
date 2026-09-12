import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ExternalLink,
  FileDown,
  Send,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import {
  type FormEvent,
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
  MonitorFeed,
  MonitorEvent as RegulatoryEvent,
} from "../monitor-contract";
import "./monitor.css";

type Filters = {
  source: string;
  topic: string;
  entity: string;
};

type MonitorMonths = { months: string[] };

const ALL = "All";

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

function FilterSelect({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string;
  values: string[];
  onChange: (value: string) => void;
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
              {item}
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
  const [feed, setFeed] = useState<MonitorFeed | null>(null);
  const [months, setMonths] = useState<string[]>([]);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<{
    event: RegulatoryEvent;
    mode: "brief" | "copilot";
  } | null>(null);
  const [filters, setFilters] = useState<Filters>({
    source: ALL,
    topic: ALL,
    entity: ALL,
  });

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      fetch(
        selectedMonth
          ? `/api/monitor/feed?month=${encodeURIComponent(selectedMonth)}`
          : "/api/monitor/feed",
        { signal: controller.signal },
      ),
      fetch("/api/monitor/months", { signal: controller.signal }),
    ])
      .then(async ([feedResponse, monthsResponse]) => {
        if (!feedResponse.ok)
          throw new Error("The Monitor feed is unavailable.");
        const nextFeed = (await feedResponse.json()) as MonitorFeed;
        const nextMonths = monthsResponse.ok
          ? ((await monthsResponse.json()) as MonitorMonths).months
          : [];
        return { nextFeed, nextMonths };
      })
      .then(({ nextFeed, nextMonths }) => {
        setFeed(nextFeed);
        setMonths(nextMonths);
        if (!selectedMonth) setSelectedMonth(nextFeed.month);
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
  }, [selectedMonth]);

  const options = useMemo(() => {
    const events = feed?.events ?? [];
    return {
      sources: unique(events.map((event) => event.source.authority)),
      topics: unique(events.map((event) => event.classification.topic)),
      entities: unique(
        events.flatMap((event) => event.classification.affectedEntities),
      ),
    };
  }, [feed]);

  const filteredEvents = useMemo(
    () =>
      (feed?.events ?? []).filter(
        (event) =>
          (filters.source === ALL ||
            event.source.authority === filters.source) &&
          (filters.topic === ALL ||
            event.classification.topic === filters.topic) &&
          (filters.entity === ALL ||
            event.classification.affectedEntities.includes(filters.entity)),
      ),
    [feed, filters],
  );

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
          <button
            className="monitor-report-button"
            onClick={() => globalThis.print()}
            type="button"
          >
            <FileDown aria-hidden="true" size={15} />
            Generate Monthly Report
          </button>
        </div>
        <a className="monitor-masthead" href="/monitor">
          Regulatory Monitor
        </a>
        <nav className="monitor-nav" aria-label="Monitor sections">
          <a className="active" href="#updates">
            Updates
          </a>
          <a href="#summary">Monthly summary</a>
          <a href="#sources">Sources</a>
        </nav>
      </header>

      <div className="monitor-page">
        <section className="monitor-edition-heading" id="updates">
          <div>
            <p>European financial regulation</p>
            <h1>Latest regulatory updates</h1>
            <span>
              A concise monthly view of publications from selected EU and
              Luxembourg authorities.
            </span>
          </div>
          <label className="monitor-month-select">
            <span>Edition</span>
            <span className="monitor-select-wrap">
              <select
                value={selectedMonth || feed?.month || ""}
                onChange={(event) => setSelectedMonth(event.target.value)}
              >
                {(months.length > 0 ? months : feed ? [feed.month] : []).map(
                  (month) => (
                    <option key={month} value={month}>
                      {displayMonth(month)}
                    </option>
                  ),
                )}
              </select>
              <ChevronDown aria-hidden="true" size={15} />
            </span>
          </label>
        </section>

        <div className="monitor-content-grid">
          <section className="monitor-feed-column">
            <div className="monitor-filterbar">
              <div className="monitor-filter-title">
                <SlidersHorizontal aria-hidden="true" size={15} />
                Filter
                {activeFilterCount > 0 ? <b>{activeFilterCount}</b> : null}
              </div>
              <div className="monitor-filter-controls">
                <FilterSelect
                  label="Source"
                  onChange={(source) =>
                    setFilters((current) => ({ ...current, source }))
                  }
                  value={filters.source}
                  values={options.sources}
                />
                <FilterSelect
                  label="Topic"
                  onChange={(topic) =>
                    setFilters((current) => ({ ...current, topic }))
                  }
                  value={filters.topic}
                  values={options.topics}
                />
                <FilterSelect
                  label="Affected entity"
                  onChange={(entity) =>
                    setFilters((current) => ({ ...current, entity }))
                  }
                  value={filters.entity}
                  values={options.entities}
                />
              </div>
            </div>

            <div className="monitor-feed-heading">
              <h2>Updates</h2>
              <p>
                Showing {filteredEvents.length} of {feed?.events.length ?? 0}
              </p>
            </div>

            {error ? <p className="monitor-state">{error}</p> : null}
            {!feed && !error ? (
              <p aria-live="polite" className="monitor-state">
                Loading this month's updates…
              </p>
            ) : null}

            <div className="monitor-event-list">
              {filteredEvents.map((event) => (
                <article className="monitor-event" key={event.id}>
                  <button
                    className="monitor-event-open"
                    onClick={() => setSelected({ event, mode: "brief" })}
                    type="button"
                  >
                    <span className="monitor-event-meta">
                      <strong>{event.source.authority}</strong>
                      <span>{displayDate(event.source.publishedAt)}</span>
                      <span>{event.classification.eventType}</span>
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
                    <Sparkles aria-hidden="true" size={14} /> Explain with AI
                  </button>
                </article>
              ))}
            </div>

            {feed && filteredEvents.length === 0 ? (
              <div className="monitor-empty">
                <CalendarDays aria-hidden="true" size={21} />
                <p>No updates match these filters.</p>
                <button
                  onClick={() =>
                    setFilters({ source: ALL, topic: ALL, entity: ALL })
                  }
                  type="button"
                >
                  Clear filters
                </button>
              </div>
            ) : null}
          </section>

          <aside className="monitor-summary-rail" id="summary">
            <section>
              <h2>This month</h2>
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
          month={feed?.month ?? ""}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </main>
  );
}
