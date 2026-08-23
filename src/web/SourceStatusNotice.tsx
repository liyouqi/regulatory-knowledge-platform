import type { SourceStatus } from "../shared/source-status";

export function SourceStatusNotice({ status }: { status: SourceStatus }) {
  const latestCorrection = status.corrections.at(-1);
  const basis =
    status.basis === "original-oj"
      ? "Original Official Journal text"
      : "Consolidated text";

  return (
    <aside className="source-status-notice" aria-label="Legal text status">
      <strong>{basis}</strong>
      <span>Text as of {status.textAsOf}</span>
      {status.checkedAt ? (
        <span>Status checked {status.checkedAt.slice(0, 10)}</span>
      ) : null}
      {latestCorrection ? (
        <span>
          {status.corrections.length} known{" "}
          {status.corrections.length === 1 ? "correction" : "corrections"}
          {"; latest "}
          <a href={latestCorrection.url} rel="noreferrer" target="_blank">
            {latestCorrection.date}
          </a>
          .
        </span>
      ) : null}
      <a href={status.currentVersionUrl} rel="noreferrer" target="_blank">
        View current EUR-Lex version
      </a>
    </aside>
  );
}
