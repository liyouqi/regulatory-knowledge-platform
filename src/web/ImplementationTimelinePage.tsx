import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Search,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  type ImplementationTimeline,
  implementationTimelineSchema,
} from "../shared/implementation-timeline";
import { explorerPath } from "../shared/reader-route";
import { type ThemeMode, ThemeToggle } from "./ThemeToggle";

const dateBasisLabels = {
  "official-metadata": "Official metadata",
  "explicit-legal-text": "Explicit legal text",
  "calculated-from-publication": "Deterministic date calculation",
} as const;

function displayDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

export function ImplementationTimelinePage({
  slug,
  onOpenSearch,
  onToggleTheme,
  theme,
}: {
  slug: string;
  onOpenSearch: () => void;
  onToggleTheme: () => void;
  theme: ThemeMode;
}) {
  const [timeline, setTimeline] = useState<ImplementationTimeline | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setTimeline(null);
    setLoadError("");
    void fetch(`/api/timelines/${encodeURIComponent(slug)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Implementation timeline not found");
        return implementationTimelineSchema.parse(await response.json());
      })
      .then(setTimeline)
      .catch((error: unknown) => {
        if ((error as DOMException).name !== "AbortError") {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Unable to load implementation timeline",
          );
        }
      });
    return () => controller.abort();
  }, [slug]);

  if (loadError) {
    return (
      <main className="loading error-state" role="alert">
        {loadError}
      </main>
    );
  }
  if (!timeline) {
    return (
      <main aria-busy="true" aria-live="polite" className="loading">
        Loading implementation timeline…
      </main>
    );
  }

  return (
    <main className="implementation-timeline-shell">
      <a className="skip-link" href="#timeline-events">
        Skip to timeline events
      </a>
      <header className="topbar explorer-topbar">
        <Link className="brand" to={explorerPath(timeline.document.slug)}>
          <BookOpen aria-hidden="true" size={18} /> Regulatory Knowledge
        </Link>
        <div className="topbar-actions">
          <ThemeToggle onToggle={onToggleTheme} theme={theme} />
          <Link
            className="view-switch"
            to={explorerPath(timeline.document.slug)}
          >
            <ArrowLeft aria-hidden="true" size={15} /> Explore
          </Link>
          <button
            className="search-button"
            onClick={onOpenSearch}
            type="button"
          >
            <Search aria-hidden="true" size={16} /> Find laws <kbd>⌘ K</kbd>
          </button>
        </div>
      </header>

      <section className="implementation-timeline-hero">
        <p className="explorer-kicker">IMPLEMENTATION TIMELINE</p>
        <div>
          <CalendarDays aria-hidden="true" size={34} />
          <h1>{timeline.document.shortName}</h1>
        </div>
        <p>{timeline.document.officialTitle}</p>
        <small>
          {timeline.events.length} reviewed milestones · Runtime{" "}
          {timeline.runtime.buildId}
        </small>
      </section>

      <ol className="implementation-timeline" id="timeline-events">
        {timeline.events.map((event) => (
          <li key={event.id}>
            <div className="timeline-date">
              <time dateTime={event.date}>{displayDate(event.date)}</time>
              <span>{dateBasisLabels[event.dateBasis]}</span>
            </div>
            <article>
              <header>
                <span>{event.eventType.replaceAll("-", " ")}</span>
                <h2>{event.label}</h2>
                <p>{event.scopeLabel}</p>
              </header>
              <blockquote>{event.source.evidenceText}</blockquote>
              {event.derivation ? (
                <p className="timeline-derivation">
                  Calculated as {event.derivation.days} calendar days after the
                  reviewed publication date {event.derivation.baseDate}.
                </p>
              ) : null}
              <footer>
                <Link to={event.source.path}>
                  Read source <ArrowUpRight aria-hidden="true" size={13} />
                </Link>
                <a
                  href={event.source.sourceUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Official source <ArrowUpRight aria-hidden="true" size={13} />
                </a>
                <span>{event.provenance} · reviewed</span>
              </footer>
            </article>
          </li>
        ))}
      </ol>
    </main>
  );
}
