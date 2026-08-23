import {
  ArrowRight,
  BookOpen,
  FileSearch,
  LoaderCircle,
  Search,
  X,
} from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type {
  FullTextSearchResponse,
  FullTextSearchResult,
  LawSearchResponse,
  LawSearchResult,
} from "../shared/legal";
import {
  fullTextSearchResponseSchema,
  lawSearchResponseSchema,
} from "../shared/legal";

type SearchMode = "laws" | "fulltext";

const reasonLabels: Record<LawSearchResult["matchReason"], string> = {
  catalog: "Available law",
  "exact-celex": "Exact CELEX",
  "exact-alias": "Exact name",
  "exact-citation": "Exact citation",
  "exact-title": "Exact title",
  "title-prefix": "Title prefix",
  "title-terms": "Title terms",
};

function LawResultRow({
  result,
  active,
  index,
  onOpen,
  onSelect,
}: {
  result: LawSearchResult;
  active: boolean;
  index: number;
  onOpen: (result: LawSearchResult) => void;
  onSelect: (index: number) => void;
}) {
  return (
    <button
      aria-current={active ? "true" : undefined}
      className={`law-search-result${active ? " active" : ""}`}
      onClick={() => onOpen(result)}
      onMouseEnter={() => onSelect(index)}
      ref={
        active
          ? (node) => node?.scrollIntoView({ block: "nearest" })
          : undefined
      }
      type="button"
    >
      <span className="law-result-mark">{result.shortName.slice(0, 2)}</span>
      <span className="law-result-copy">
        <span>
          <strong>
            {result.shortName}
            {result.target ? ` · ${result.target.label}` : ""}
          </strong>
          <em>{reasonLabels[result.matchReason]}</em>
        </span>
        <small>{result.target?.title ?? result.officialTitle}</small>
        <span className="law-result-meta">
          {result.target ? `${result.target.kind} · ` : ""}
          {result.familyId.replace("family:", "").replaceAll("-", " ")} family ·{" "}
          {result.documentType}
          {" · "}
          {result.publicationDate.slice(0, 4)} · CELEX {result.celex}
        </span>
      </span>
      <span className="law-result-action">
        {result.target ? "Read" : "Explore"}{" "}
        <ArrowRight aria-hidden="true" size={15} />
      </span>
    </button>
  );
}

function HighlightedSnippet({ result }: { result: FullTextSearchResult }) {
  let offset = 0;

  return (
    <span className="full-text-snippet">
      {result.snippet.map((segment) => {
        const key = `${offset}-${segment.highlighted ? "hit" : "text"}`;
        offset += segment.text.length;
        return segment.highlighted ? (
          <mark key={key}>{segment.text}</mark>
        ) : (
          <span key={key}>{segment.text}</span>
        );
      })}
    </span>
  );
}

function FullTextResultRow({
  result,
  active,
  index,
  onOpen,
  onSelect,
}: {
  result: FullTextSearchResult;
  active: boolean;
  index: number;
  onOpen: (result: FullTextSearchResult) => void;
  onSelect: (index: number) => void;
}) {
  return (
    <button
      aria-current={active ? "true" : undefined}
      className={`law-search-result full-text-search-result${active ? " active" : ""}`}
      onClick={() => onOpen(result)}
      onMouseEnter={() => onSelect(index)}
      ref={
        active
          ? (node) => node?.scrollIntoView({ block: "nearest" })
          : undefined
      }
      type="button"
    >
      <span className="law-result-mark">{result.shortName.slice(0, 2)}</span>
      <span className="law-result-copy">
        <span>
          <strong>
            {result.shortName} · {result.label}
            {result.marker ? ` · ${result.marker}` : ""}
          </strong>
          <em>{result.kind}</em>
        </span>
        {result.title ? <small>{result.title}</small> : null}
        <HighlightedSnippet result={result} />
        <span className="law-result-meta">
          Full text · CELEX {result.celex}
        </span>
      </span>
      <span className="law-result-action">
        Read <ArrowRight aria-hidden="true" size={15} />
      </span>
    </button>
  );
}

export function GlobalLawSearch({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<SearchMode>("laws");
  const [query, setQuery] = useState("");
  const [lawResponse, setLawResponse] = useState<LawSearchResponse | null>(
    null,
  );
  const [fullTextResponse, setFullTextResponse] =
    useState<FullTextSearchResponse | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const lawResults = lawResponse?.results ?? [];
  const fullTextResults = fullTextResponse?.results ?? [];
  const resultCount =
    mode === "laws" ? lawResults.length : fullTextResults.length;

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    const previousOverflow = globalThis.document.body.style.overflow;
    globalThis.document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(frame);
      globalThis.document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (mode === "fulltext" && query.trim().length < 2) {
      setFullTextResponse(null);
      setLoading(false);
      setError("");
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError("");
    const endpoint =
      mode === "laws"
        ? `/api/search/laws?q=${encodeURIComponent(query)}`
        : `/api/search/full-text?q=${encodeURIComponent(query)}&limit=20`;

    void fetch(endpoint, { signal: controller.signal })
      .then(async (fetchResponse) => {
        if (!fetchResponse.ok) {
          throw new Error(
            mode === "laws"
              ? "Unable to search laws"
              : "Unable to search legal text",
          );
        }
        const payload: unknown = await fetchResponse.json();
        if (mode === "laws") {
          setLawResponse(lawSearchResponseSchema.parse(payload));
        } else {
          setFullTextResponse(fullTextSearchResponseSchema.parse(payload));
        }
        setSelectedIndex(0);
      })
      .catch((caught: unknown) => {
        if ((caught as DOMException).name !== "AbortError") {
          setError(caught instanceof Error ? caught.message : "Search failed");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [mode, open, query]);

  useEffect(() => {
    if (selectedIndex >= resultCount) {
      setSelectedIndex(Math.max(0, resultCount - 1));
    }
  }, [resultCount, selectedIndex]);

  if (!open) return null;

  function openLawResult(result: LawSearchResult) {
    onClose();
    navigate(result.target?.path ?? result.explorerPath);
  }

  function openFullTextResult(result: FullTextSearchResult) {
    onClose();
    navigate(result.path);
  }

  function selectMode(nextMode: SearchMode) {
    setMode(nextMode);
    setSelectedIndex(0);
    setError("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      selectMode(mode === "laws" ? "fulltext" : "laws");
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((index) =>
        Math.min(index + 1, Math.max(resultCount - 1, 0)),
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      if (mode === "laws") {
        const result = lawResults[selectedIndex];
        if (!result) return;
        event.preventDefault();
        openLawResult(result);
      } else {
        const result = fullTextResults[selectedIndex];
        if (!result) return;
        event.preventDefault();
        openFullTextResult(result);
      }
    }
  }

  return (
    <div
      className="search-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <dialog
        aria-label="Regulatory search"
        aria-modal="true"
        className="global-search"
        open
      >
        <header className="global-search-input">
          {loading ? (
            <LoaderCircle
              aria-hidden="true"
              className="search-spinner"
              size={20}
            />
          ) : (
            <Search aria-hidden="true" size={20} />
          )}
          <input
            aria-controls="law-search-results"
            aria-label={
              mode === "laws"
                ? "Find laws by name, CELEX, or citation"
                : "Search full text across loaded laws"
            }
            maxLength={200}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              mode === "laws"
                ? "DORA, DORA article 3, 32022R2554…"
                : 'Operational risk, "management body"…'
            }
            ref={inputRef}
            value={query}
          />
          <button aria-label="Close search" onClick={onClose} type="button">
            <X aria-hidden="true" size={18} />
          </button>
        </header>

        <div className="search-mode-bar">
          <div
            aria-label="Search mode"
            className="search-mode-tabs"
            role="tablist"
          >
            <button
              aria-selected={mode === "laws"}
              className={mode === "laws" ? "active" : ""}
              onClick={() => selectMode("laws")}
              role="tab"
              type="button"
            >
              <BookOpen aria-hidden="true" size={14} /> Find laws
            </button>
            <button
              aria-selected={mode === "fulltext"}
              className={mode === "fulltext" ? "active" : ""}
              onClick={() => selectMode("fulltext")}
              role="tab"
              type="button"
            >
              <FileSearch aria-hidden="true" size={14} /> Full text
            </button>
          </div>
          <small>
            {mode === "laws"
              ? "Name · alias · CELEX · citation"
              : "SQLite FTS5 · all laws"}
          </small>
        </div>

        <div className="law-search-results" id="law-search-results">
          {error ? <p className="search-empty error-state">{error}</p> : null}

          {!error && mode === "fulltext" && query.trim().length < 2 ? (
            <div className="search-empty full-text-intro">
              <FileSearch aria-hidden="true" size={25} />
              <strong>Search every loaded provision</strong>
              <span>
                Try <code>operational risk</code> or the exact phrase{" "}
                <code>"management body"</code>.
              </span>
            </div>
          ) : null}

          {!error &&
          mode === "laws" &&
          lawResponse &&
          lawResults.length === 0 ? (
            <p className="search-empty">
              No available law matches “{lawResponse.query}”.
            </p>
          ) : null}

          {!error &&
          mode === "fulltext" &&
          fullTextResponse &&
          fullTextResults.length === 0 ? (
            <p className="search-empty">
              No provision matches all of these terms.
            </p>
          ) : null}

          {mode === "laws" && lawResults.length > 0 ? (
            <>
              <p className="search-section-label">
                {lawResponse?.normalizedQuery ? "BEST MATCH" : "AVAILABLE LAWS"}
              </p>
              <LawResultRow
                active={selectedIndex === 0}
                index={0}
                onOpen={openLawResult}
                onSelect={setSelectedIndex}
                result={lawResults[0]}
              />
              {lawResults.length > 1 ? (
                <>
                  {lawResponse?.normalizedQuery ? (
                    <p className="search-section-label secondary">
                      ALL RESULTS
                    </p>
                  ) : null}
                  {lawResults.slice(1).map((result, index) => (
                    <LawResultRow
                      active={selectedIndex === index + 1}
                      index={index + 1}
                      key={result.id}
                      onOpen={openLawResult}
                      onSelect={setSelectedIndex}
                      result={result}
                    />
                  ))}
                </>
              ) : null}
            </>
          ) : null}

          {mode === "fulltext" && fullTextResults.length > 0 ? (
            <>
              <p className="search-section-label">
                BEST MATCHES · ALL LOADED LAWS
              </p>
              {fullTextResults.map((result, index) => (
                <FullTextResultRow
                  active={selectedIndex === index}
                  index={index}
                  key={result.id}
                  onOpen={openFullTextResult}
                  onSelect={setSelectedIndex}
                  result={result}
                />
              ))}
            </>
          ) : null}
        </div>

        <footer className="search-help">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>↵</kbd> open
          </span>
          <span>
            <kbd>⇥</kbd> mode
          </span>
          <span>
            <kbd>esc</kbd> close
          </span>
        </footer>
      </dialog>
    </div>
  );
}
