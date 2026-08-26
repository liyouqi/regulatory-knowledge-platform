import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Landmark,
  Search,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { explorerPath } from "../shared/reader-route";
import {
  type DocumentSupervisoryDecisionsResponse,
  documentSupervisoryDecisionsResponseSchema,
} from "../shared/supervisory-decision";
import { type ThemeMode, ThemeToggle } from "./ThemeToggle";

function displayDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function displayOutcome(
  amountMinor: number | null,
  currency: string | null,
): string | null {
  if (amountMinor === null || currency === null) return null;
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

export function SupervisoryDecisionsPage({
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
  const [response, setResponse] =
    useState<DocumentSupervisoryDecisionsResponse | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setResponse(null);
    setLoadError("");
    void fetch(`/api/supervisory-decisions/${encodeURIComponent(slug)}`, {
      signal: controller.signal,
    })
      .then(async (result) => {
        if (!result.ok) throw new Error("Supervisory decisions not found");
        return documentSupervisoryDecisionsResponseSchema.parse(
          await result.json(),
        );
      })
      .then(setResponse)
      .catch((error: unknown) => {
        if ((error as DOMException).name !== "AbortError") {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Unable to load supervisory decisions",
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
  if (!response) {
    return (
      <main aria-busy="true" aria-live="polite" className="loading">
        Loading supervisory decisions…
      </main>
    );
  }

  return (
    <main className="supervisory-decisions-shell">
      <a className="skip-link" href="#supervisory-decisions">
        Skip to supervisory decisions
      </a>
      <header className="topbar explorer-topbar">
        <Link className="brand" to={explorerPath(response.document.slug)}>
          <BookOpen aria-hidden="true" size={18} /> Regulatory Knowledge
        </Link>
        <div className="topbar-actions">
          <ThemeToggle onToggle={onToggleTheme} theme={theme} />
          <Link
            className="view-switch"
            to={explorerPath(response.document.slug)}
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

      <section className="supervisory-decisions-hero">
        <p className="explorer-kicker">SUPERVISORY DECISIONS</p>
        <div>
          <Landmark aria-hidden="true" size={34} />
          <h1>{response.document.shortName}</h1>
        </div>
        <p>{response.document.officialTitle}</p>
        <small>
          {response.decisions.length} reviewed decision
          {response.decisions.length === 1 ? "" : "s"} · Runtime{" "}
          {response.runtime.buildId}
        </small>
      </section>

      <section className="supervisory-decisions" id="supervisory-decisions">
        {response.decisions.length === 0 ? (
          <p className="relationships-status">
            No reviewed supervisory decisions are published for this document.
          </p>
        ) : null}
        {response.decisions.map((decision) => {
          const fine = displayOutcome(
            decision.outcome.amountMinor,
            decision.outcome.currency,
          );
          return (
            <article id={decision.slug} key={decision.id}>
              <header>
                <div>
                  <span>{decision.authority.acronym ?? "Authority"}</span>
                  <h2>{decision.officialTitle}</h2>
                  <p>{decision.subject}</p>
                </div>
                <dl>
                  <div>
                    <dt>Date</dt>
                    <dd>{displayDate(decision.decisionDate)}</dd>
                  </div>
                  <div>
                    <dt>Decision</dt>
                    <dd>{decision.decisionNumber}</dd>
                  </div>
                  <div>
                    <dt>Outcome</dt>
                    <dd>
                      {fine ?? decision.decisionType.replaceAll("-", " ")}
                    </dd>
                  </div>
                </dl>
              </header>

              <section aria-label="Findings" className="decision-findings">
                <p className="eyebrow">FINDINGS</p>
                <ul>
                  {decision.findings.map((finding) => (
                    <li key={finding.id}>
                      <Link to={finding.target.path}>
                        {finding.target.reference}
                        <ArrowUpRight aria-hidden="true" size={14} />
                      </Link>
                      <span>{finding.relationType.replaceAll("_", " ")}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section
                aria-label="Official evidence"
                className="decision-evidence"
              >
                <p className="eyebrow">OPERATIVE PART · PAGE 30</p>
                <blockquote>{decision.findings[0]?.evidence.text}</blockquote>
                <blockquote>{decision.outcome.evidenceText}</blockquote>
              </section>

              <footer>
                <a
                  href={decision.sourceDocumentUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Official decision PDF
                  <ArrowUpRight aria-hidden="true" size={14} />
                </a>
                <a
                  href={decision.sourcePageUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  CNPD decision page
                  <ArrowUpRight aria-hidden="true" size={14} />
                </a>
                <span>
                  DECISION_TEXT · reviewed · {decision.sourceDocument.pageCount}{" "}
                  pages
                </span>
              </footer>
            </article>
          );
        })}
      </section>
    </main>
  );
}
