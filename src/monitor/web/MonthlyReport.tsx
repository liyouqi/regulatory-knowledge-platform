import { ExternalLink, FileDown, X } from "lucide-react";
import { useEffect, useMemo } from "react";
import type { MonitorTimeline } from "../monitor-contract";
import { createMonthlyMonitorReport } from "../monitor-report";

function reportMonth(month: string): string {
  const [year, number] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year ?? 0, (number ?? 1) - 1, 1)));
}

function reportDate(date: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

export function MonthlyReport({
  timeline,
  month,
  months,
  onMonthChange,
  onClose,
}: {
  timeline: MonitorTimeline;
  month: string;
  months: string[];
  onMonthChange: (month: string) => void;
  onClose: () => void;
}) {
  const report = useMemo(
    () => createMonthlyMonitorReport(timeline, month),
    [month, timeline],
  );

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    globalThis.addEventListener("keydown", close);
    return () => globalThis.removeEventListener("keydown", close);
  }, [onClose]);

  return (
    <div className="monitor-report-layer">
      <button
        aria-label="Close monthly report"
        className="monitor-report-backdrop"
        onClick={onClose}
        type="button"
      />
      <dialog
        aria-label="Monthly regulatory report"
        aria-modal="true"
        className="monitor-report-dialog"
        open
      >
        <div className="monitor-report-controls">
          <label>
            Report month
            <select
              onChange={(event) => onMonthChange(event.target.value)}
              value={month}
            >
              {months.map((availableMonth) => (
                <option key={availableMonth} value={availableMonth}>
                  {reportMonth(availableMonth)}
                </option>
              ))}
            </select>
          </label>
          <button onClick={() => globalThis.print()} type="button">
            <FileDown aria-hidden="true" size={15} /> Print / save PDF
          </button>
          <button aria-label="Close report" onClick={onClose} type="button">
            <X aria-hidden="true" size={17} />
          </button>
        </div>

        <article className="monitor-report-sheet">
          <header>
            <p>Regulatory Monitor</p>
            <h1>{reportMonth(month)} monthly report</h1>
            <small>
              European financial regulatory intelligence · generated from the
              Monitor feed refreshed {reportDate(report.generatedAt)}
            </small>
          </header>

          <section className="monitor-report-summary">
            <div>
              <strong>{report.events.length}</strong>
              <span>updates</span>
            </div>
            <div>
              <strong>{report.authorityCount}</strong>
              <span>authorities</span>
            </div>
            <div>
              <strong>{report.topicCount}</strong>
              <span>topics</span>
            </div>
            <div>
              <strong>{report.importantDateCount}</strong>
              <span>important dates</span>
            </div>
          </section>

          <p className="monitor-report-notice">
            This report organises official publications with Monitor analysis
            for orientation. Open each official source before relying on an
            update as a legal record.
          </p>

          {report.sections.length > 0 ? (
            report.sections.map((section) => (
              <section className="monitor-report-topic" key={section.topic}>
                <h2>
                  {section.topic} <span>{section.events.length}</span>
                </h2>
                {section.events.map((event) => (
                  <article className="monitor-report-event" key={event.id}>
                    <p className="monitor-report-event-meta">
                      {event.source.authority} ·{" "}
                      {reportDate(event.source.publishedAt)} ·{" "}
                      {event.classification.eventType}
                      {event.classification.status
                        ? ` · ${event.classification.status}`
                        : ""}
                    </p>
                    <h3>{event.source.title}</h3>
                    <p>
                      {event.analysis.summary ??
                        "See the official publication for the full update."}
                    </p>
                    {event.analysis.keyPoints.length > 0 ? (
                      <div>
                        <h4>Change summary</h4>
                        <ul>
                          {event.analysis.keyPoints.map((point) => (
                            <li key={point}>{point}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {event.analysis.businessTakeaways?.length ? (
                      <div>
                        <h4>Business takeaways</h4>
                        <ul>
                          {event.analysis.businessTakeaways.map((point) => (
                            <li key={point}>{point}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {event.analysis.importantDates?.length ? (
                      <div>
                        <h4>Important dates</h4>
                        <ul>
                          {event.analysis.importantDates.map((item) => (
                            <li key={`${item.label}-${item.date}`}>
                              {reportDate(item.date)} — {item.label}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <a href={event.source.url} rel="noreferrer" target="_blank">
                      Official source
                      <ExternalLink aria-hidden="true" size={12} />
                    </a>
                  </article>
                ))}
              </section>
            ))
          ) : (
            <p className="monitor-report-empty">
              No Monitor updates are available for this month.
            </p>
          )}
        </article>
      </dialog>
    </div>
  );
}
