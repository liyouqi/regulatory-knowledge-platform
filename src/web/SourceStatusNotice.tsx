import type { SourceStatus } from "../shared/source-status";

export function SourceStatusNotice({ status }: { status: SourceStatus }) {
  const latestCorrection = status.corrections.at(-1);
  const basis =
    status.basis === "original-oj"
      ? "Original Official Journal text"
      : "Consolidated text";
  const currentSourceIsEurLex = new URL(
    status.currentVersionUrl,
  ).hostname.endsWith("eur-lex.europa.eu");

  return (
    <aside className="source-status-notice" aria-label="Legal text status">
      <strong>{basis}</strong>
      <span>
        {status.textAsOfBasis === "last-amendment-act-date"
          ? "Last amendment act date"
          : status.textAsOfBasis === "publisher-version-date"
            ? "Publisher version date"
            : "Text as of"}{" "}
        {status.textAsOf}
      </span>
      {status.textAuthorityStatus === "non-authoritative-consolidation" ? (
        <span>
          Non-authoritative consolidation
          {status.authorityNote ? `: ${status.authorityNote}` : ""}
        </span>
      ) : status.authorityNote ? (
        <span>{status.authorityNote}</span>
      ) : null}
      {status.textAuthorityStatus === "publisher-consolidation" ? (
        <span>
          Publisher consolidation; aggregate publication date is not recorded.
        </span>
      ) : null}
      {status.sourceNotes?.map((note, index) => (
        <span key={`${index}-${note}`}>{note}</span>
      ))}
      <span>
        A loaded text date is not a latest-version certification. Check the
        current official source before relying on this text.
      </span>
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
        {currentSourceIsEurLex
          ? "View current EUR-Lex version"
          : "View current source text"}
      </a>
    </aside>
  );
}
