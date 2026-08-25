import { ArrowLeft, ArrowUpRight, BookOpen, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  type DocumentView,
  type Level2MandateQueryResponse,
  documentViewSchema,
  level2MandateQueryResponseSchema,
} from "../shared/legal";
import { explorerPath, provisionPath } from "../shared/reader-route";
import { type ThemeMode, ThemeToggle } from "./ThemeToggle";

const DORA_DOCUMENT_ID = "eu:32022R2554";
const DORA_ARTICLE_28_ID = "eu:32022R2554:article:28";

export function Level2MandateQueryPage({
  onOpenSearch,
  onToggleTheme,
  theme,
}: {
  onOpenSearch: () => void;
  onToggleTheme: () => void;
  theme: ThemeMode;
}) {
  const [document, setDocument] = useState<DocumentView | null>(null);
  const [provisionId, setProvisionId] = useState(DORA_ARTICLE_28_ID);
  const [result, setResult] = useState<Level2MandateQueryResponse | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoadError("");
    void fetch("/api/documents/by-slug/dora", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load DORA");
        return documentViewSchema.parse(await response.json());
      })
      .then(setDocument)
      .catch((error: unknown) => {
        if ((error as DOMException).name !== "AbortError") {
          setLoadError(
            error instanceof Error ? error.message : "Unable to load DORA",
          );
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    if (!document) return () => controller.abort();
    const query = new URLSearchParams({
      documentId: DORA_DOCUMENT_ID,
      provisionId,
    });
    void fetch(`/api/relationship-queries/level-2-mandates?${query}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to query reviewed mandates");
        return level2MandateQueryResponseSchema.parse(await response.json());
      })
      .then(setResult)
      .catch((error: unknown) => {
        if ((error as DOMException).name !== "AbortError") {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Unable to query reviewed mandates",
          );
        }
      });
    return () => controller.abort();
  }, [document, provisionId]);

  const articles = useMemo(
    () =>
      document?.provisions.filter((item) => item.collectionId === "articles") ??
      [],
    [document],
  );
  const selected = articles.find((item) => item.id === provisionId);

  if (loadError) {
    return (
      <main className="loading error-state" role="alert">
        {loadError}
      </main>
    );
  }
  if (!document || !result) {
    return (
      <main aria-busy="true" aria-live="polite" className="loading">
        Loading deterministic relationship query…
      </main>
    );
  }

  return (
    <main className="relationship-query-shell">
      <a className="skip-link" href="#query-results">
        Skip to query results
      </a>
      <header className="topbar relationship-query-topbar">
        <Link className="brand" to={explorerPath("dora")}>
          <BookOpen aria-hidden="true" size={18} /> Regulatory Knowledge
        </Link>
        <div className="topbar-actions">
          <ThemeToggle onToggle={onToggleTheme} theme={theme} />
          <Link className="view-switch" to={explorerPath("dora")}>
            <ArrowLeft aria-hidden="true" size={15} /> Explore DORA
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

      <section className="relationship-query-hero">
        <p className="explorer-kicker">DETERMINISTIC RELATIONSHIP QUERY</p>
        <h1>Which RTS/ITS are mandated by a DORA Article?</h1>
        <p>
          This is a fixed relationship query over reviewed mappings. It does not
          interpret free text or infer legal relationships.
        </p>
      </section>

      <section
        className="relationship-query-form"
        aria-label="Level 2 mandate query"
      >
        <span>From</span>
        <strong>DORA</strong>
        <label>
          <span className="sr-only">DORA Article</span>
          <select
            onChange={(event) => setProvisionId(event.target.value)}
            value={provisionId}
          >
            {articles.map((article) => (
              <option key={article.id} value={article.id}>
                {article.label}
                {article.title ? ` — ${article.title}` : ""}
              </option>
            ))}
          </select>
        </label>
        <span>→ mandates →</span>
        <strong>reviewed RTS / ITS</strong>
      </section>

      <section
        className="relationship-query-results"
        id="query-results"
        tabIndex={-1}
      >
        <header>
          <div>
            <p className="explorer-kicker">QUERY RESULT</p>
            <h2>{selected?.label ?? "Selected Article"}</h2>
          </div>
          {selected ? (
            <Link to={selected.path}>
              Read Article <ArrowUpRight aria-hidden="true" size={15} />
            </Link>
          ) : null}
        </header>
        {result.relationships.length === 0 ? (
          <p className="relationship-query-empty">
            No reviewed RTS or ITS mapping is currently published for this
            Article.
          </p>
        ) : (
          <div className="relationship-query-cards">
            {result.relationships.map((relationship) => (
              <article key={relationship.id}>
                <span>{relationship.target.documentShortName}</span>
                <h3>
                  {relationship.target.title ?? relationship.target.label}
                </h3>
                <p>Reviewed mapping: “{relationship.evidence.text}”</p>
                <footer>
                  <Link to={relationship.target.path}>Read measure</Link>
                  <a
                    href={relationship.evidence.sourceUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Official evidence{" "}
                    <ArrowUpRight aria-hidden="true" size={13} />
                  </a>
                </footer>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
