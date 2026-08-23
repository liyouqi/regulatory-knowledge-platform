import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  Copy,
  Map as MapIcon,
  Search,
} from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  type CurrentDocumentSearchResult,
  buildCurrentDocumentSearchIndex,
  searchCurrentDocument,
} from "../search/current-document-search";
import type {
  BodyBlock,
  ContentCollection,
  DocumentSummary,
  DocumentView,
  ProvisionView,
  TocNode,
} from "../shared/legal";
import { documentCatalogSchema } from "../shared/legal";
import {
  explorerPath,
  parseExplorerPath,
  parseQuickGo,
  parseReaderPath,
} from "../shared/reader-route";
import { ExplorerPage } from "./ExplorerPage";
import { GlobalLawSearch } from "./GlobalLawSearch";

function containsProvision(node: TocNode, provisionId: string): boolean {
  return (
    node.provisionId === provisionId ||
    node.children.some((child) => containsProvision(child, provisionId))
  );
}

function TocTree({
  nodes,
  activeId,
  provisions,
  onSelect,
}: {
  nodes: TocNode[];
  activeId: string;
  provisions: Map<string, ProvisionView>;
  onSelect: (provision: ProvisionView) => void;
}) {
  return (
    <div className="toc-tree">
      {nodes.map((node) => {
        if (node.type === "group") {
          return (
            <details
              className="toc-group"
              key={node.id}
              open={containsProvision(node, activeId)}
            >
              <summary>
                <span>
                  <small>{node.label}</small>
                  {node.title ? <strong>{node.title}</strong> : null}
                </span>
                {node.range ? <em>{node.range}</em> : null}
              </summary>
              <TocTree
                activeId={activeId}
                nodes={node.children}
                onSelect={onSelect}
                provisions={provisions}
              />
            </details>
          );
        }
        const provision = node.provisionId
          ? provisions.get(node.provisionId)
          : undefined;
        if (!provision) return null;
        return (
          <button
            className={
              provision.id === activeId ? "toc-item active" : "toc-item"
            }
            data-provision-id={provision.id}
            key={node.id}
            onClick={() => onSelect(provision)}
            type="button"
          >
            <span>{node.label}</span>
            {node.title ? <small>{node.title}</small> : null}
          </button>
        );
      })}
    </div>
  );
}

function LegalBlock({
  block,
  provisionPath,
}: { block: BodyBlock; provisionPath: string }) {
  return (
    <div className={`legal-block ${block.kind}`} id={block.anchor}>
      <div className="block-copy">
        <a
          aria-label={`Link to ${block.marker ?? block.kind}`}
          href={`${provisionPath}#${block.anchor}`}
        >
          {block.marker ?? "¶"}
        </a>
        {block.text ? <p>{block.text}</p> : null}
      </div>
      {block.children.length > 0 ? (
        <div className="nested-blocks">
          {block.children.map((child) => (
            <LegalBlock
              block={child}
              key={child.id}
              provisionPath={provisionPath}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function escapePattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function HighlightText({
  text,
  highlights,
}: {
  text: string;
  highlights: string[];
}) {
  if (highlights.length === 0) return text;
  const pattern = new RegExp(
    `(${highlights.map(escapePattern).join("|")})`,
    "giu",
  );
  const normalized = new Set(highlights.map((term) => term.toLowerCase()));
  let offset = 0;
  return text.split(pattern).map((part) => {
    const start = offset;
    offset += part.length;
    return normalized.has(part.toLowerCase()) ? (
      <mark key={`${start}-${part}`}>{part}</mark>
    ) : (
      part
    );
  });
}

function CurrentSearchResultRow({
  result,
  active,
  onOpen,
}: {
  result: CurrentDocumentSearchResult;
  active: boolean;
  onOpen: (path: string) => void;
}) {
  return (
    <button
      aria-current={active ? "true" : undefined}
      className={`current-search-result${active ? " active" : ""}`}
      onClick={() => onOpen(result.path)}
      onMouseDown={(event) => event.preventDefault()}
      type="button"
    >
      <span>
        <strong>{result.label}</strong>
        {result.marker ? <em>{result.marker}</em> : null}
        <small>{result.kind}</small>
      </span>
      {result.title ? <b>{result.title}</b> : null}
      <p>
        <HighlightText highlights={result.highlights} text={result.snippet} />
      </p>
    </button>
  );
}

function CurrentDocumentSearch({
  legalDocument,
}: {
  legalDocument: DocumentView;
}) {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const index = useMemo(
    () => buildCurrentDocumentSearchIndex(legalDocument),
    [legalDocument],
  );
  const locator = useMemo(() => parseQuickGo(value), [value]);
  const exactTarget = useMemo(
    () =>
      locator
        ? legalDocument.provisions.find(
            (provision) =>
              provision.collectionId === locator.collectionId &&
              provision.number.toLowerCase() === locator.number,
          )
        : undefined,
    [legalDocument, locator],
  );
  const results = useMemo(
    () =>
      value.trim().length >= 2 && !locator
        ? searchCurrentDocument(index, value, 10)
        : [],
    [index, locator, value],
  );

  useEffect(() => {
    const rows = formRef.current?.querySelectorAll<HTMLElement>(
      ".current-search-result",
    );
    rows?.[selectedIndex]?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  function openPath(path: string) {
    setMessage("");
    setValue("");
    setOpen(false);
    navigate(path);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (exactTarget) return openPath(exactTarget.path);
    if (results[selectedIndex]) return openPath(results[selectedIndex].path);
    setMessage(
      locator
        ? "That provision does not exist in this law"
        : "No title or text match in this law",
    );
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && results.length > 0) {
      event.preventDefault();
      setSelectedIndex((current) => Math.min(current + 1, results.length - 1));
    } else if (event.key === "ArrowUp" && results.length > 0) {
      event.preventDefault();
      setSelectedIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Escape") {
      setOpen(false);
      event.currentTarget.blur();
    }
  }

  return (
    <form
      className="quick-go"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onFocus={() => setOpen(true)}
      onSubmit={submit}
      ref={formRef}
    >
      <Search aria-hidden="true" size={14} />
      <input
        aria-describedby="quick-go-message"
        aria-label="Go to provision or search current law"
        maxLength={200}
        onChange={(event) => {
          setValue(event.target.value);
          setMessage("");
          setOpen(true);
          setSelectedIndex(0);
        }}
        onKeyDown={handleKeyDown}
        placeholder="Art. 23 or search this law…"
        value={value}
      />
      <span aria-live="polite" className="sr-only" id="quick-go-message">
        {message}
      </span>
      {open && value.trim() ? (
        <div className="current-search-results">
          {exactTarget ? (
            <button
              className="current-search-result active exact"
              onClick={() => openPath(exactTarget.path)}
              onMouseDown={(event) => event.preventDefault()}
              type="button"
            >
              <span>
                <strong>{exactTarget.label}</strong>
                <small>Exact locator</small>
              </span>
              {exactTarget.title ? <b>{exactTarget.title}</b> : null}
            </button>
          ) : null}
          {!locator
            ? results.map((result, resultIndex) => (
                <CurrentSearchResultRow
                  active={selectedIndex === resultIndex}
                  key={result.id}
                  onOpen={openPath}
                  result={result}
                />
              ))
            : null}
          {!exactTarget &&
          results.length === 0 &&
          (value.trim().length >= 2 || message) ? (
            <p className="current-search-empty">
              {message ||
                (locator
                  ? "No such provision in this law"
                  : "No title or text matches")}
            </p>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}

function ReaderPage({ onOpenSearch }: { onOpenSearch: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const selection = parseReaderPath(location.pathname);
  const requestedSlug = selection?.slug ?? "dora";
  const [legalDocument, setLegalDocument] = useState<DocumentView | null>(null);
  const [catalog, setCatalog] = useState<DocumentSummary[]>([]);
  const [loadError, setLoadError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/documents", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load document catalog");
        return documentCatalogSchema.parse(await response.json()).documents;
      })
      .then(setCatalog)
      .catch((error: unknown) => {
        if ((error as DOMException).name !== "AbortError") {
          setLoadError(
            error instanceof Error ? error.message : "Unable to load catalog",
          );
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLegalDocument(null);
    setLoadError("");
    void fetch(`/api/documents/by-slug/${encodeURIComponent(requestedSlug)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load regulatory document");
        return (await response.json()) as DocumentView;
      })
      .then(setLegalDocument)
      .catch((error: unknown) => {
        if ((error as DOMException).name !== "AbortError") {
          setLoadError(
            error instanceof Error ? error.message : "Unable to load",
          );
        }
      });
    return () => controller.abort();
  }, [requestedSlug]);

  const activeProvision = useMemo(() => {
    if (!legalDocument || !selection || selection.slug !== legalDocument.slug) {
      return null;
    }
    return (
      legalDocument.provisions.find(
        (provision) =>
          provision.collectionId === selection.collectionId &&
          provision.number.toLowerCase() === selection.number,
      ) ?? null
    );
  }, [legalDocument, selection]);

  useEffect(() => {
    if (!legalDocument || activeProvision) return;
    const firstArticle = legalDocument.provisions.find(
      (provision) => provision.collectionId === "articles",
    );
    const fallback = firstArticle ?? legalDocument.provisions[0];
    if (fallback) navigate(fallback.path, { replace: true });
  }, [activeProvision, legalDocument, navigate]);

  useEffect(() => {
    if (!activeProvision || !location.hash) return;
    const anchor = decodeURIComponent(location.hash.slice(1));
    const frame = requestAnimationFrame(() => {
      const target = globalThis.document.getElementById(anchor);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.classList.add("deep-link-target");
    });
    return () => {
      cancelAnimationFrame(frame);
      globalThis.document
        .getElementById(anchor)
        ?.classList.remove("deep-link-target");
    };
  }, [activeProvision, location.hash]);

  useEffect(() => {
    if (!activeProvision) return;
    const frame = requestAnimationFrame(() => {
      const container =
        globalThis.document.querySelector<HTMLElement>(".toc-scroll");
      const target = globalThis.document.querySelector<HTMLElement>(
        ".toc-scroll .toc-item.active",
      );
      if (!container || !target) return;
      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      container.scrollTo({
        behavior: "smooth",
        top:
          container.scrollTop +
          targetRect.top -
          containerRect.top -
          container.clientHeight / 2 +
          target.clientHeight / 2,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeProvision]);

  if (loadError)
    return <main className="loading error-state">{loadError}</main>;
  if (!legalDocument || !activeProvision) {
    return <main className="loading">Loading regulatory reader…</main>;
  }

  const provisions = new Map(
    legalDocument.provisions.map((provision) => [provision.id, provision]),
  );
  const activeCollection = legalDocument.collections.find(
    (collection) => collection.id === activeProvision.collectionId,
  ) as ContentCollection;
  const previous = activeProvision.previousId
    ? provisions.get(activeProvision.previousId)
    : undefined;
  const next = activeProvision.nextId
    ? provisions.get(activeProvision.nextId)
    : undefined;

  async function copyPermalink() {
    await navigator.clipboard.writeText(globalThis.location.href);
    setCopied(true);
    globalThis.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <main className="reader-shell">
      <header className="topbar">
        <Link className="brand" to={activeProvision.path}>
          <BookOpen aria-hidden="true" size={18} />
          Regulatory Knowledge
        </Link>
        <div className="topbar-actions">
          <Link
            className="view-switch"
            to={`${explorerPath(legalDocument.slug)}#${activeProvision.explorerAnchor}`}
          >
            <MapIcon aria-hidden="true" size={15} />
            Explore
          </Link>
          <button
            className="search-button"
            onClick={onOpenSearch}
            type="button"
          >
            <Search aria-hidden="true" size={16} />
            Find laws
            <kbd>⌘ K</kbd>
          </button>
        </div>
      </header>

      <aside className="toc" aria-label="Table of contents">
        <div className="toc-document">
          {catalog.length > 1 ? (
            <label className="law-switcher">
              <span className="sr-only">Choose regulation</span>
              <select
                onChange={(event) => {
                  const target = catalog.find(
                    (document) => document.slug === event.currentTarget.value,
                  );
                  if (target) navigate(target.defaultPath);
                }}
                value={legalDocument.slug}
              >
                {catalog.map((document) => (
                  <option key={document.id} value={document.slug}>
                    {document.shortName}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <p className="eyebrow">
            EU {legalDocument.documentType.toUpperCase()}
          </p>
          <h1>{legalDocument.shortName}</h1>
          <p className="toc-title">{legalDocument.officialTitle}</p>
        </div>
        <CurrentDocumentSearch legalDocument={legalDocument} />
        <div className="collection-tabs" role="tablist">
          {legalDocument.collections.map((collection) => {
            const first = legalDocument.provisions.find(
              (provision) => provision.collectionId === collection.id,
            );
            return (
              <button
                aria-selected={collection.id === activeCollection.id}
                className={
                  collection.id === activeCollection.id ? "active" : undefined
                }
                key={collection.id}
                onClick={() => first && navigate(first.path)}
                role="tab"
                type="button"
              >
                {collection.label}
                <span>{collection.count}</span>
              </button>
            );
          })}
        </div>
        <nav className="toc-scroll">
          <TocTree
            activeId={activeProvision.id}
            nodes={activeCollection.roots}
            onSelect={(provision) => navigate(provision.path)}
            provisions={provisions}
          />
        </nav>
      </aside>

      <article className="legal-text" aria-labelledby="provision-title">
        <div className="breadcrumb">
          <span>{legalDocument.shortName}</span>
          {activeProvision.breadcrumbs.map((entry) => (
            <span key={entry.id}>{entry.title ?? entry.label}</span>
          ))}
        </div>
        <p className="provision-label">{activeProvision.label}</p>
        {activeProvision.title ? (
          <h2 id="provision-title">{activeProvision.title}</h2>
        ) : (
          <h2 id="provision-title" className="sr-only">
            {activeProvision.label}
          </h2>
        )}
        <div className="provision-body">
          {activeProvision.blocks.map((block) => (
            <LegalBlock
              block={block}
              key={block.id}
              provisionPath={activeProvision.path}
            />
          ))}
        </div>
        <nav className="provision-pagination" aria-label="Provision navigation">
          {previous ? (
            <button onClick={() => navigate(previous.path)} type="button">
              <ArrowLeft aria-hidden="true" size={16} />
              <span>
                <small>Previous</small>
                {previous.label}
              </span>
            </button>
          ) : (
            <span />
          )}
          {next ? (
            <button onClick={() => navigate(next.path)} type="button">
              <span>
                <small>Next</small>
                {next.label}
              </span>
              <ArrowRight aria-hidden="true" size={16} />
            </button>
          ) : null}
        </nav>
      </article>

      <aside className="context-panel" aria-label="Document context">
        <p className="eyebrow">CURRENT PROVISION</p>
        <strong className="context-title">{activeProvision.label}</strong>
        {activeProvision.title ? <p>{activeProvision.title}</p> : null}
        <button className="copy-button" onClick={copyPermalink} type="button">
          {copied ? (
            <Check aria-hidden="true" size={14} />
          ) : (
            <Copy aria-hidden="true" size={14} />
          )}
          {copied ? "Copied" : "Copy permalink"}
        </button>
        <div className="context-divider" />
        <p className="eyebrow">SOURCE</p>
        <dl>
          <div>
            <dt>CELEX</dt>
            <dd>{legalDocument.celex}</dd>
          </div>
          <div>
            <dt>Published</dt>
            <dd>{legalDocument.asOf}</dd>
          </div>
          <div>
            <dt>Last checked</dt>
            <dd>{legalDocument.lastChecked.slice(0, 10)}</dd>
          </div>
          <div>
            <dt>Source version</dt>
            <dd>{legalDocument.sourceVersion}</dd>
          </div>
          <div>
            <dt>Build</dt>
            <dd>{legalDocument.buildId}</dd>
          </div>
        </dl>
        <a href={legalDocument.sourceUrl} rel="noreferrer" target="_blank">
          Open official source <ArrowUpRight aria-hidden="true" size={15} />
        </a>
        {legalDocument.provenance === "fixture" ? (
          <p className="fixture-notice">
            This screen uses a temporary UI fixture, not production legal text.
          </p>
        ) : null}
      </aside>
    </main>
  );
}

export function App() {
  const location = useLocation();
  const explorer = parseExplorerPath(location.pathname);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      } else if (event.key === "Escape") {
        setSearchOpen(false);
      }
    };
    globalThis.addEventListener("keydown", handleShortcut);
    return () => globalThis.removeEventListener("keydown", handleShortcut);
  }, []);

  return (
    <>
      {explorer ? (
        <ExplorerPage
          onOpenSearch={() => setSearchOpen(true)}
          slug={explorer.slug}
        />
      ) : (
        <ReaderPage onOpenSearch={() => setSearchOpen(true)} />
      )}
      <GlobalLawSearch onClose={() => setSearchOpen(false)} open={searchOpen} />
    </>
  );
}
