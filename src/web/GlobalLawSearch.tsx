import { ArrowRight, BookOpen, LoaderCircle, Search, X } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { LawSearchResponse, LawSearchResult } from "../shared/legal";
import { lawSearchResponseSchema } from "../shared/legal";

const reasonLabels: Record<LawSearchResult["matchReason"], string> = {
  catalog: "Available law",
  "exact-celex": "Exact CELEX",
  "exact-alias": "Exact name",
  "exact-citation": "Exact citation",
  "exact-title": "Exact title",
  "title-prefix": "Title prefix",
  "title-terms": "Title terms",
};

function ResultRow({
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
      type="button"
    >
      <span className="law-result-mark">{result.shortName.slice(0, 2)}</span>
      <span className="law-result-copy">
        <span>
          <strong>{result.shortName}</strong>
          <em>{reasonLabels[result.matchReason]}</em>
        </span>
        <small>{result.officialTitle}</small>
        <span className="law-result-meta">
          {result.familyId.replace("family:", "")} family ·{" "}
          {result.documentType}
          {" · "}
          {result.publicationDate.slice(0, 4)} · CELEX {result.celex}
        </span>
      </span>
      <span className="law-result-action">
        Explore <ArrowRight aria-hidden="true" size={15} />
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
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<LawSearchResponse | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void fetch(`/api/search/laws?q=${encodeURIComponent(query)}`, {
      signal: controller.signal,
    })
      .then(async (fetchResponse) => {
        if (!fetchResponse.ok) throw new Error("Unable to search laws");
        return lawSearchResponseSchema.parse(await fetchResponse.json());
      })
      .then((result) => {
        setResponse(result);
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
  }, [open, query]);

  if (!open) return null;
  const results = response?.results ?? [];

  function openResult(result: LawSearchResult) {
    onClose();
    navigate(result.explorerPath);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((index) => Math.min(index + 1, results.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === "Enter" && results[selectedIndex]) {
      event.preventDefault();
      openResult(results[selectedIndex]);
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
        aria-label="Find laws"
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
            aria-label="Find laws by name, CELEX, or citation"
            maxLength={200}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="DORA, 32022R2554, Regulation 2022/2554…"
            ref={inputRef}
            value={query}
          />
          <button aria-label="Close search" onClick={onClose} type="button">
            <X aria-hidden="true" size={18} />
          </button>
        </header>

        <div className="search-mode-bar">
          <span className="active">
            <BookOpen aria-hidden="true" size={14} /> Find laws
          </span>
          <small>Name · alias · CELEX · year/number</small>
        </div>

        <div className="law-search-results" id="law-search-results">
          {error ? <p className="search-empty error-state">{error}</p> : null}
          {!error && response && results.length === 0 ? (
            <p className="search-empty">
              No available law matches “{response.query}”.
            </p>
          ) : null}
          {results.length > 0 ? (
            <>
              <p className="search-section-label">
                {response?.normalizedQuery ? "BEST MATCH" : "AVAILABLE LAWS"}
              </p>
              <ResultRow
                active={selectedIndex === 0}
                index={0}
                onOpen={openResult}
                onSelect={setSelectedIndex}
                result={results[0]}
              />
              {results.length > 1 ? (
                <>
                  {response?.normalizedQuery ? (
                    <p className="search-section-label secondary">
                      ALL RESULTS
                    </p>
                  ) : null}
                  {results.slice(1).map((result, index) => (
                    <ResultRow
                      active={selectedIndex === index + 1}
                      index={index + 1}
                      key={result.id}
                      onOpen={openResult}
                      onSelect={setSelectedIndex}
                      result={result}
                    />
                  ))}
                </>
              ) : null}
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
            <kbd>esc</kbd> close
          </span>
        </footer>
      </dialog>
    </div>
  );
}
