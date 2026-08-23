import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  Copy,
  Link2,
  Map as MapIcon,
  Search,
  Undo2,
  X,
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
  ProvisionRelationship,
  ProvisionRelationshipsResponse,
  ProvisionView,
  RelationshipPreview,
  TocNode,
} from "../shared/legal";
import {
  documentCatalogSchema,
  provisionRelationshipsResponseSchema,
  relationshipPreviewSchema,
} from "../shared/legal";
import {
  explorerPath,
  parseExplorerPath,
  parseLevel2LibraryPath,
  parseQuickGo,
  parseReaderPath,
} from "../shared/reader-route";
import { ExplorerPage } from "./ExplorerPage";
import { GlobalLawSearch } from "./GlobalLawSearch";
import { Level2LibraryPage } from "./Level2LibraryPage";
import { inlineReferenceRanges } from "./inline-references";
import { recordOpenedLaw } from "./opened-laws";

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
  relationships,
  onPreview,
}: {
  block: BodyBlock;
  provisionPath: string;
  relationships: ProvisionRelationship[];
  onPreview: (relationship: ProvisionRelationship) => void;
}) {
  return (
    <div className={`legal-block ${block.kind}`} id={block.anchor}>
      <div className="block-copy">
        <a
          aria-label={`Link to ${block.marker ?? block.kind}`}
          href={`${provisionPath}#${block.anchor}`}
        >
          {block.marker ?? "¶"}
        </a>
        {block.text ? (
          <p>
            <InlineReferenceText
              onPreview={onPreview}
              relationships={relationships}
              sourceEntityId={block.id}
              text={block.text}
            />
          </p>
        ) : null}
      </div>
      {block.children.length > 0 ? (
        <div className="nested-blocks">
          {block.children.map((child) => (
            <LegalBlock
              block={child}
              key={child.id}
              onPreview={onPreview}
              provisionPath={provisionPath}
              relationships={relationships}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function InlineReferenceText({
  text,
  sourceEntityId,
  relationships,
  onPreview,
}: {
  text: string;
  sourceEntityId: string;
  relationships: ProvisionRelationship[];
  onPreview: (relationship: ProvisionRelationship) => void;
}) {
  const ranges = inlineReferenceRanges(text, sourceEntityId, relationships);
  if (ranges.length === 0) return text;

  let cursor = 0;
  return ranges
    .flatMap((range) => {
      const before = text.slice(cursor, range.start);
      cursor = range.end;
      return [
        before,
        <button
          aria-label={`Preview ${range.relationship.target.documentShortName} ${range.relationship.target.label}`}
          className="inline-reference"
          key={range.relationship.id}
          onClick={() => onPreview(range.relationship)}
          type="button"
        >
          {text.slice(range.start, range.end)}
        </button>,
      ];
    })
    .concat(text.slice(cursor));
}

function ReferencePeek({
  relationship,
  onClose,
}: {
  relationship: ProvisionRelationship;
  onClose: () => void;
}) {
  const [preview, setPreview] = useState<RelationshipPreview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setPreview(null);
    setError("");
    void fetch(
      `/api/relationship-previews/${encodeURIComponent(relationship.target.entityId)}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load reference preview");
        return relationshipPreviewSchema.parse(await response.json());
      })
      .then(setPreview)
      .catch((caught: unknown) => {
        if ((caught as DOMException).name !== "AbortError") {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load reference preview",
          );
        }
      });
    return () => controller.abort();
  }, [relationship]);

  const target = preview ?? relationship.target;
  return (
    <dialog
      aria-label="Reference preview"
      className="reference-peek"
      onCancel={onClose}
      open
    >
      <header>
        <p className="eyebrow">REFERENCE PREVIEW</p>
        <button
          aria-label="Close reference preview"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" size={17} />
        </button>
      </header>
      <p className="reference-peek-law">{target.documentShortName}</p>
      <h2>{target.label}</h2>
      {target.title ? <h3>{target.title}</h3> : null}
      <p className="reference-peek-evidence">
        Cited here as “{relationship.evidence.text}”
      </p>
      {preview?.excerpt ? (
        <blockquote>{preview.excerpt}</blockquote>
      ) : error ? (
        <p className="reference-peek-status error-state">{error}</p>
      ) : (
        <p className="reference-peek-status">Loading official excerpt…</p>
      )}
      <div className="reference-peek-actions">
        <Link onClick={onClose} to={relationship.target.path}>
          Open full {relationship.target.kind}
          <ArrowRight aria-hidden="true" size={15} />
        </Link>
        {preview ? (
          <a href={preview.sourceUrl} rel="noreferrer" target="_blank">
            Official source <ArrowUpRight aria-hidden="true" size={14} />
          </a>
        ) : null}
      </div>
    </dialog>
  );
}

function uniqueRelationships(
  relationships: ProvisionRelationship[],
  direction: "references" | "citedBy",
) {
  const grouped = new Map<
    string,
    { relationship: ProvisionRelationship; mentions: number }
  >();
  for (const relationship of relationships) {
    const endpoint =
      direction === "references" ? relationship.target : relationship.source;
    const key = endpoint.provisionId ?? endpoint.entityId;
    const existing = grouped.get(key);
    if (existing) existing.mentions += 1;
    else grouped.set(key, { relationship, mentions: 1 });
  }
  return [...grouped.values()];
}

function RelationshipList({
  relationships,
  loading,
  error,
  className = "",
}: {
  relationships: ProvisionRelationshipsResponse | null;
  loading: boolean;
  error: string;
  className?: string;
}) {
  const references = uniqueRelationships(
    relationships?.references ?? [],
    "references",
  );
  const citedBy = uniqueRelationships(relationships?.citedBy ?? [], "citedBy");
  const groups = [
    {
      key: "references",
      label: "References",
      direction: "references" as const,
      items: references,
    },
    {
      key: "mandates",
      label: "Level 2 measures",
      direction: "references" as const,
      items: uniqueRelationships(relationships?.mandates ?? [], "references"),
    },
    {
      key: "adopted-under",
      label: "Adopted under",
      direction: "references" as const,
      items: uniqueRelationships(
        relationships?.adoptedUnder ?? [],
        "references",
      ),
    },
    {
      key: "supplements",
      label: "Supplements",
      direction: "references" as const,
      items: uniqueRelationships(
        relationships?.supplements ?? [],
        "references",
      ),
    },
    {
      key: "related-documents",
      label: "Related documents",
      direction: "references" as const,
      items: uniqueRelationships(
        relationships?.relatedDocuments ?? [],
        "references",
      ),
    },
    {
      key: "related-recitals",
      label: "Related recitals",
      direction: "references" as const,
      items: uniqueRelationships(
        relationships?.relatedRecitals ?? [],
        "references",
      ),
    },
    {
      key: "cited-by",
      label: "Cited by",
      direction: "citedBy" as const,
      items: citedBy,
    },
  ];
  const relationshipCount = groups.reduce(
    (total, group) => total + group.items.length,
    0,
  );

  return (
    <section className={`relationships-panel ${className}`.trim()}>
      <p className="eyebrow">RELATIONSHIPS</p>
      {loading ? (
        <p className="relationships-status">Loading references…</p>
      ) : null}
      {error ? (
        <p className="relationships-status error-state">{error}</p>
      ) : null}
      {!loading && !error && relationshipCount === 0 ? (
        <p className="relationships-status">
          No resolved relationships for this provision.
        </p>
      ) : null}
      {groups.map((group) =>
        group.items.length > 0 ? (
          <details
            key={group.key}
            open={["references", "mandates", "adopted-under"].includes(
              group.key,
            )}
          >
            <summary>
              <span>
                {group.direction === "citedBy" ? (
                  <Undo2 aria-hidden="true" size={13} />
                ) : (
                  <Link2 aria-hidden="true" size={13} />
                )}
                {group.label}
              </span>
              <b>{group.items.length}</b>
            </summary>
            <div className="relationship-items">
              {group.items.map(({ relationship, mentions }) => {
                const endpoint =
                  group.direction === "citedBy"
                    ? relationship.source
                    : relationship.target;
                return (
                  <div className="relationship-item" key={relationship.id}>
                    <Link to={endpoint.path}>
                      <strong>
                        {endpoint.documentShortName} · {endpoint.label}
                      </strong>
                      {endpoint.title ? <span>{endpoint.title}</span> : null}
                      <small>
                        “{relationship.evidence.text}”
                        {mentions > 1 ? ` · ${mentions} mentions` : ""}
                      </small>
                    </Link>
                    <a
                      className="relationship-evidence"
                      href={relationship.evidence.sourceUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {relationship.provenance === "OFFICIAL_MAPPING"
                        ? "Official mapping"
                        : "Official text"}{" "}
                      <ArrowUpRight aria-hidden="true" size={11} />
                    </a>
                  </div>
                );
              })}
            </div>
          </details>
        ) : null,
      )}
    </section>
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
  const [relationships, setRelationships] =
    useState<ProvisionRelationshipsResponse | null>(null);
  const [relationshipsLoading, setRelationshipsLoading] = useState(false);
  const [relationshipsError, setRelationshipsError] = useState("");
  const [previewRelationship, setPreviewRelationship] =
    useState<ProvisionRelationship | null>(null);

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
    if (selection && selection.slug !== legalDocument.slug) return;
    const firstArticle = legalDocument.provisions.find(
      (provision) => provision.collectionId === "articles",
    );
    const fallback = firstArticle ?? legalDocument.provisions[0];
    if (fallback) navigate(fallback.path, { replace: true });
  }, [activeProvision, legalDocument, navigate, selection]);

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
    if (!legalDocument || !activeProvision) return;
    const controller = new AbortController();
    setRelationships(null);
    setPreviewRelationship(null);
    setRelationshipsLoading(true);
    setRelationshipsError("");
    void fetch(
      `/api/relationships/${encodeURIComponent(legalDocument.id)}/${encodeURIComponent(activeProvision.id)}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load relationships");
        return provisionRelationshipsResponseSchema.parse(
          await response.json(),
        );
      })
      .then(setRelationships)
      .catch((error: unknown) => {
        if ((error as DOMException).name !== "AbortError") {
          setRelationshipsError(
            error instanceof Error
              ? error.message
              : "Unable to load relationships",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setRelationshipsLoading(false);
      });
    return () => controller.abort();
  }, [activeProvision, legalDocument]);

  useEffect(() => {
    if (!legalDocument || !activeProvision) return;
    recordOpenedLaw({
      documentId: legalDocument.id,
      path: `${activeProvision.path}${location.hash}`,
    });
  }, [activeProvision, legalDocument, location.hash]);

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
              onPreview={setPreviewRelationship}
              provisionPath={activeProvision.path}
              relationships={relationships?.references ?? []}
            />
          ))}
        </div>
        <RelationshipList
          className="mobile-relationships"
          error={relationshipsError}
          loading={relationshipsLoading}
          relationships={relationships}
        />
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
        <RelationshipList
          error={relationshipsError}
          loading={relationshipsLoading}
          relationships={relationships}
        />
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
      {previewRelationship ? (
        <ReferencePeek
          onClose={() => setPreviewRelationship(null)}
          relationship={previewRelationship}
        />
      ) : null}
    </main>
  );
}

export function App() {
  const location = useLocation();
  const explorer = parseExplorerPath(location.pathname);
  const level2Library = parseLevel2LibraryPath(location.pathname);
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
      {level2Library ? (
        <Level2LibraryPage
          familySlug={level2Library.familySlug}
          measureType={level2Library.measureType}
          onOpenSearch={() => setSearchOpen(true)}
        />
      ) : explorer ? (
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
