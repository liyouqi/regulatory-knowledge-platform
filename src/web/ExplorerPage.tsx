import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  ExternalLink,
  Landmark,
  Layers3,
  ListTree,
  Network,
  Route,
  Search,
  ShieldCheck,
} from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  type DocumentSummary,
  type ExplorerDocument,
  type ExplorerNode,
  type FamilyLevel2Response,
  documentCatalogSchema,
  explorerDocumentSchema,
  familyLevel2ResponseSchema,
} from "../shared/legal";
import {
  applicabilityPath,
  documentRelationshipGraphPath,
  explorerPath,
  implementationTimelinePath,
  level2LibraryPath,
  regulatoryDomainPath,
  supervisoryDecisionsPath,
  topicCatalogPath,
} from "../shared/reader-route";
import {
  type DocumentRegulatoryContext,
  documentRegulatoryContextSchema,
} from "../shared/regulatory-context";
import { type ThemeMode, ThemeToggle } from "./ThemeToggle";
import { recordOpenedLaw } from "./opened-laws";

function flattenProvisions(nodes: ExplorerNode[]): ExplorerNode[] {
  return nodes.flatMap((node) =>
    node.type === "article" || node.type === "provision"
      ? [node]
      : flattenProvisions(node.children),
  );
}

function rememberScroll(slug: string) {
  sessionStorage.setItem(`explorer-scroll:${slug}`, String(globalThis.scrollY));
}

function ExplorerTree({
  nodes,
  depth = 0,
  slug,
}: {
  nodes: ExplorerNode[];
  depth?: number;
  slug: string;
}) {
  return nodes.map((node) => {
    if (
      (node.type === "article" || node.type === "provision") &&
      node.readerPath
    ) {
      return (
        <Link
          className="explorer-article"
          id={node.anchor}
          key={node.id}
          onClick={() => rememberScroll(slug)}
          to={node.readerPath}
        >
          <span>{node.label}</span>
          <strong>{node.title ?? "Untitled provision"}</strong>
          <ArrowRight aria-hidden="true" size={17} />
        </Link>
      );
    }

    return (
      <section
        className="explorer-group"
        id={node.anchor}
        key={node.id}
        style={{ "--explorer-depth": depth } as CSSProperties}
      >
        <header className="explorer-group-heading">
          <div>
            <p>{node.label}</p>
            {node.title ? <h2>{node.title}</h2> : null}
          </div>
          {node.range ? <span>{node.range}</span> : null}
        </header>
        <div className="explorer-group-children">
          <ExplorerTree depth={depth + 1} nodes={node.children} slug={slug} />
        </div>
      </section>
    );
  });
}

export function ExplorerPage({
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
  const location = useLocation();
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<DocumentSummary[]>([]);
  const [document, setDocument] = useState<ExplorerDocument | null>(null);
  const [level2, setLevel2] = useState<FamilyLevel2Response | null>(null);
  const [regulatoryContext, setRegulatoryContext] =
    useState<DocumentRegulatoryContext | null>(null);
  const [loadError, setLoadError] = useState("");

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
    setDocument(null);
    setLoadError("");
    void fetch(`/api/explorer/${encodeURIComponent(slug)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load Act Explorer");
        return explorerDocumentSchema.parse(await response.json());
      })
      .then(setDocument)
      .catch((error: unknown) => {
        if ((error as DOMException).name !== "AbortError") {
          setLoadError(
            error instanceof Error ? error.message : "Unable to load Explorer",
          );
        }
      });
    return () => controller.abort();
  }, [slug]);

  useEffect(() => {
    if (!document) return;
    const controller = new AbortController();
    setRegulatoryContext(null);
    void fetch(
      `/api/documents/${encodeURIComponent(document.id)}/regulatory-context`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load regulatory context");
        return documentRegulatoryContextSchema.parse(await response.json());
      })
      .then(setRegulatoryContext)
      .catch(() => setRegulatoryContext(null));
    return () => controller.abort();
  }, [document]);

  const documentSummary = catalog.find((item) => item.slug === slug);

  useEffect(() => {
    if (documentSummary?.regulatoryLevel !== "level-1") {
      setLevel2(null);
      return;
    }
    const controller = new AbortController();
    const familySlug = documentSummary.familyId.slice("family:".length);
    void fetch(`/api/families/${encodeURIComponent(familySlug)}/level-2`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load Level 2 summary");
        return familyLevel2ResponseSchema.parse(await response.json());
      })
      .then(setLevel2)
      .catch(() => setLevel2(null));
    return () => controller.abort();
  }, [documentSummary]);

  useEffect(() => {
    if (!document) return;
    const frame = requestAnimationFrame(() => {
      if (location.hash) {
        const anchor = decodeURIComponent(location.hash.slice(1));
        globalThis.document
          .getElementById(anchor)
          ?.scrollIntoView({ block: "center" });
        return;
      }
      const saved = Number(sessionStorage.getItem(`explorer-scroll:${slug}`));
      if (Number.isFinite(saved) && saved > 0) globalThis.scrollTo(0, saved);
      else globalThis.scrollTo(0, 0);
    });
    return () => cancelAnimationFrame(frame);
  }, [document, location.hash, slug]);

  useEffect(() => {
    if (!document) return;
    recordOpenedLaw({
      documentId: document.id,
      path: `${explorerPath(document.slug)}${location.hash}`,
    });
  }, [document, location.hash]);

  const provisions = useMemo(
    () => flattenProvisions(document?.roots ?? []),
    [document],
  );

  if (loadError)
    return (
      <main className="loading error-state" role="alert">
        {loadError}
      </main>
    );
  if (!document)
    return (
      <main aria-busy="true" aria-live="polite" className="loading">
        Loading Act Explorer…
      </main>
    );

  return (
    <main className="explorer-shell">
      <a className="skip-link" href="#main-content">
        Skip to Explorer content
      </a>
      <header className="topbar explorer-topbar">
        <Link className="brand" to={explorerPath(document.slug)}>
          <BookOpen aria-hidden="true" size={18} />
          Regulatory Knowledge
        </Link>
        <div className="topbar-actions">
          <ThemeToggle onToggle={onToggleTheme} theme={theme} />
          <span className="view-switch active">
            <ListTree aria-hidden="true" size={15} />
            Explore
          </span>
          <Link
            className="view-switch"
            to={documentRelationshipGraphPath(document.slug)}
          >
            <Network aria-hidden="true" size={15} />
            Relationships
          </Link>
          {documentSummary?.hasImplementationTimeline ? (
            <Link
              className="view-switch"
              to={implementationTimelinePath(document.slug)}
            >
              <CalendarDays aria-hidden="true" size={15} />
              Timeline
            </Link>
          ) : null}
          {documentSummary?.hasSupervisoryDecisions ? (
            <Link
              className="view-switch"
              to={supervisoryDecisionsPath(document.slug)}
            >
              <Landmark aria-hidden="true" size={15} />
              Decisions
            </Link>
          ) : null}
          {documentSummary?.hasApplicabilityRules ? (
            <Link className="view-switch" to={applicabilityPath(document.slug)}>
              <ShieldCheck aria-hidden="true" size={15} /> Applicability
            </Link>
          ) : null}
          {documentSummary?.hasTopicAssignments ? (
            <Link className="view-switch" to={topicCatalogPath()}>
              <Layers3 aria-hidden="true" size={15} /> Topics
            </Link>
          ) : null}
          {regulatoryContext?.domainAssignments[0] ? (
            <Link
              className="view-switch"
              to={regulatoryDomainPath(
                regulatoryContext.domainAssignments[0].domain.id.replace(
                  /^domain:/u,
                  "",
                ),
              )}
            >
              <Route aria-hidden="true" size={15} /> Domain path
            </Link>
          ) : null}
          {provisions[0]?.readerPath ? (
            <Link className="view-switch" to={provisions[0].readerPath}>
              <BookOpen aria-hidden="true" size={15} />
              Read
            </Link>
          ) : null}
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

      <section className="explorer-hero">
        <div className="explorer-hero-topline">
          <label className="explorer-law-switcher">
            <span>ACT EXPLORER</span>
            <select
              aria-label="Choose regulation"
              onChange={(event) =>
                navigate(explorerPath(event.currentTarget.value))
              }
              value={document.slug}
            >
              {catalog.map((item) => (
                <option key={item.id} value={item.slug}>
                  {item.shortName}
                </option>
              ))}
            </select>
          </label>
          <a href={document.sourceUrl} rel="noreferrer" target="_blank">
            Official source <ExternalLink aria-hidden="true" size={14} />
          </a>
        </div>
        <p className="explorer-kicker">
          {document.jurisdiction} {document.documentType.toUpperCase()} ·{" "}
          {document.celex
            ? `CELEX ${document.celex}`
            : `CSSF ${document.localId ?? "local document"}`}
        </p>
        <h1>{document.shortName}</h1>
        <p className="explorer-official-title">{document.officialTitle}</p>
        <dl className="explorer-stats">
          <div>
            <dt>Articles</dt>
            <dd>{document.articleCount}</dd>
          </div>
          <div>
            <dt>Recitals</dt>
            <dd>{document.recitalCount}</dd>
          </div>
          <div>
            <dt>Annexes</dt>
            <dd>{document.annexCount}</dd>
          </div>
          {document.provisionCount > 0 ? (
            <div>
              <dt>Provisions</dt>
              <dd>{document.provisionCount}</dd>
            </div>
          ) : null}
          <div>
            <dt>Last checked</dt>
            <dd>{document.lastChecked.slice(0, 10)}</dd>
          </div>
        </dl>
        {level2 &&
        level2.counts.rts + level2.counts.its + level2.counts.guidelines > 0 ? (
          <section className="explorer-level2-summary">
            <p>LEVEL 2</p>
            <div>
              <Link to={level2LibraryPath(slug, "rts")}>
                RTS <b>{level2.counts.rts}</b>
              </Link>
              <Link to={level2LibraryPath(slug, "its")}>
                ITS <b>{level2.counts.its}</b>
              </Link>
              <Link to={level2LibraryPath(slug)}>
                View library <ArrowRight aria-hidden="true" size={14} />
              </Link>
            </div>
          </section>
        ) : null}
      </section>

      <div className="explorer-layout">
        <aside className="explorer-outline" aria-label="Act outline">
          <p>Structure</p>
          <nav>
            {document.roots.map((node) => (
              <a href={`#${node.anchor}`} key={node.id}>
                <span>{node.label}</span>
                {node.title ? <small>{node.title}</small> : null}
              </a>
            ))}
          </nav>
        </aside>
        <article className="explorer-map" id="main-content" tabIndex={-1}>
          <ExplorerTree nodes={document.roots} slug={document.slug} />
        </article>
      </div>
    </main>
  );
}
