import { ArrowRight, BookOpen, ExternalLink, ListTree } from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  type DocumentSummary,
  type ExplorerDocument,
  type ExplorerNode,
  documentCatalogSchema,
  explorerDocumentSchema,
} from "../shared/legal";
import { explorerPath } from "../shared/reader-route";

function flattenArticles(nodes: ExplorerNode[]): ExplorerNode[] {
  return nodes.flatMap((node) =>
    node.type === "article" ? [node] : flattenArticles(node.children),
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
    if (node.type === "article" && node.readerPath) {
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

export function ExplorerPage({ slug }: { slug: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<DocumentSummary[]>([]);
  const [document, setDocument] = useState<ExplorerDocument | null>(null);
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

  const articles = useMemo(
    () => flattenArticles(document?.roots ?? []),
    [document],
  );

  if (loadError)
    return <main className="loading error-state">{loadError}</main>;
  if (!document) return <main className="loading">Loading Act Explorer…</main>;

  return (
    <main className="explorer-shell">
      <header className="topbar explorer-topbar">
        <Link className="brand" to={explorerPath(document.slug)}>
          <BookOpen aria-hidden="true" size={18} />
          Regulatory Knowledge
        </Link>
        <div className="topbar-actions">
          <span className="view-switch active">
            <ListTree aria-hidden="true" size={15} />
            Explore
          </span>
          {articles[0]?.readerPath ? (
            <Link className="view-switch" to={articles[0].readerPath}>
              <BookOpen aria-hidden="true" size={15} />
              Read
            </Link>
          ) : null}
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
          EU {document.documentType.toUpperCase()} · CELEX {document.celex}
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
          <div>
            <dt>Last checked</dt>
            <dd>{document.lastChecked.slice(0, 10)}</dd>
          </div>
        </dl>
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
        <article className="explorer-map">
          <ExplorerTree nodes={document.roots} slug={document.slug} />
        </article>
      </div>
    </main>
  );
}
