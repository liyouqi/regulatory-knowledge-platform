import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Layers3,
  Network,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  explorerPath,
  globalRelationshipGraphPath,
  topicCatalogPath,
} from "../shared/reader-route";
import {
  type RegulatoryTopicResponse,
  type TopicCatalogResponse,
  regulatoryTopicResponseSchema,
  topicCatalogResponseSchema,
} from "../shared/regulatory-topic";
import { type ThemeMode, ThemeToggle } from "./ThemeToggle";

function readable(value: string): string {
  return value.replaceAll("-", " ");
}

function TopicHeader({
  onOpenSearch,
  onToggleTheme,
  theme,
}: {
  onOpenSearch: () => void;
  onToggleTheme: () => void;
  theme: ThemeMode;
}) {
  return (
    <header className="topbar explorer-topbar">
      <Link className="brand" to={topicCatalogPath()}>
        <BookOpen aria-hidden="true" size={18} /> Regulatory Knowledge
      </Link>
      <div className="topbar-actions">
        <ThemeToggle onToggle={onToggleTheme} theme={theme} />
        <Link className="view-switch active" to={topicCatalogPath()}>
          <Layers3 aria-hidden="true" size={15} /> Topics
        </Link>
        <Link className="view-switch" to={globalRelationshipGraphPath()}>
          <Network aria-hidden="true" size={15} /> Network
        </Link>
        <button className="search-button" onClick={onOpenSearch} type="button">
          <Search aria-hidden="true" size={16} /> Find laws <kbd>⌘ K</kbd>
        </button>
      </div>
    </header>
  );
}

export function RegulatoryTopicPage({
  slug,
  onOpenSearch,
  onToggleTheme,
  theme,
}: {
  slug?: string;
  onOpenSearch: () => void;
  onToggleTheme: () => void;
  theme: ThemeMode;
}) {
  const [catalog, setCatalog] = useState<TopicCatalogResponse | null>(null);
  const [detail, setDetail] = useState<RegulatoryTopicResponse | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setCatalog(null);
    setDetail(null);
    setLoadError("");
    const endpoint = slug
      ? `/api/topics/${encodeURIComponent(slug)}`
      : "/api/topics";
    void fetch(endpoint, { signal: controller.signal })
      .then(async (result) => {
        if (!result.ok) throw new Error("Regulatory Topic not found");
        const payload: unknown = await result.json();
        return slug
          ? regulatoryTopicResponseSchema.parse(payload)
          : topicCatalogResponseSchema.parse(payload);
      })
      .then((result) => {
        if (slug) setDetail(result as RegulatoryTopicResponse);
        else setCatalog(result as TopicCatalogResponse);
      })
      .catch((error: unknown) => {
        if ((error as DOMException).name !== "AbortError") {
          setLoadError(
            error instanceof Error ? error.message : "Unable to load Topics",
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
  if (!catalog && !detail) {
    return (
      <main aria-busy="true" aria-live="polite" className="loading">
        Loading reviewed regulatory Topics…
      </main>
    );
  }

  if (catalog) {
    return (
      <main className="topic-shell">
        <TopicHeader
          onOpenSearch={onOpenSearch}
          onToggleTheme={onToggleTheme}
          theme={theme}
        />
        <section className="topic-hero">
          <span>
            <Layers3 aria-hidden="true" size={26} /> REVIEWED EDITORIAL TAXONOMY
          </span>
          <h1>Regulatory Topics</h1>
          <p>
            Cross-file navigation from a business or compliance subject to the
            loaded primary law, technical standards and supervisory material.
          </p>
          <dl>
            <div>
              <dt>Topics</dt>
              <dd>{catalog.topics.length}</dd>
            </div>
            <div>
              <dt>Edition</dt>
              <dd>{catalog.runtime.profileDisplayName}</dd>
            </div>
            <div>
              <dt>Taxonomy</dt>
              <dd>v{catalog.taxonomy.version}</dd>
            </div>
          </dl>
        </section>
        <section className="topic-catalog" aria-label="Regulatory Topics">
          {catalog.topics.map((topic, index) => (
            <Link key={topic.id} to={topic.path}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <small>REVIEWED TOPIC</small>
                <h2>{topic.label}</h2>
                <p>{topic.description}</p>
                <footer>
                  {topic.documentCount} documents · {topic.provisionCount}{" "}
                  provision {topic.provisionCount === 1 ? "entry" : "entries"}
                </footer>
              </div>
              <ArrowRight aria-hidden="true" size={22} />
            </Link>
          ))}
        </section>
      </main>
    );
  }

  if (!detail) return null;
  return (
    <main className="topic-shell">
      <a className="skip-link" href="#topic-documents">
        Skip to Topic documents
      </a>
      <TopicHeader
        onOpenSearch={onOpenSearch}
        onToggleTheme={onToggleTheme}
        theme={theme}
      />
      <section className="topic-hero detail">
        <Link className="topic-back" to={topicCatalogPath()}>
          <ArrowLeft aria-hidden="true" size={14} /> All Topics
        </Link>
        <span>
          <Layers3 aria-hidden="true" size={26} /> CROSS-FILE REGULATORY TOPIC
        </span>
        <h1>{detail.topic.label}</h1>
        <p>{detail.topic.description}</p>
        <dl>
          <div>
            <dt>Documents</dt>
            <dd>{detail.documents.length}</dd>
          </div>
          <div>
            <dt>Official links</dt>
            <dd>{detail.relationships.length}</dd>
          </div>
          <div>
            <dt>Edition</dt>
            <dd>{detail.runtime.profileDisplayName}</dd>
          </div>
        </dl>
      </section>
      <section className="topic-scope">
        <ShieldCheck aria-hidden="true" size={20} />
        <div>
          <strong>Classification, not an applicability conclusion</strong>
          <p>
            Topic membership is reviewed editorial navigation. Legal links are
            reused from existing OFFICIAL_MAPPING relationships with exact
            evidence; open the cited provision for the loaded legal text.
          </p>
        </div>
        <span>{detail.runtime.profileId}</span>
      </section>
      <section className="topic-documents" id="topic-documents">
        {detail.documents.map((document) => (
          <article key={document.id}>
            <header>
              <span>{document.regulatoryLevel.toUpperCase()}</span>
              <span>{readable(document.measureType)}</span>
              <span>{document.jurisdiction}</span>
            </header>
            <h2>{document.shortName}</h2>
            <p>{document.officialTitle}</p>
            <ul>
              {document.assignments.map((assignment) => (
                <li key={assignment.id}>
                  <Link to={assignment.targetPath}>
                    <span>{assignment.role}</span>
                    <strong>{assignment.targetLabel}</strong>
                    {assignment.targetTitle ? (
                      <small>{assignment.targetTitle}</small>
                    ) : null}
                    <ArrowUpRight aria-hidden="true" size={14} />
                  </Link>
                </li>
              ))}
            </ul>
            <footer>
              <Link to={explorerPath(document.slug)}>Explore document</Link>
              <Link to={document.defaultPath}>Open legal text</Link>
            </footer>
          </article>
        ))}
      </section>
      {detail.relationships.length > 0 ? (
        <section className="topic-relationships">
          <header>
            <span>OFFICIAL MAPPINGS</span>
            <h2>How these materials connect</h2>
          </header>
          <div>
            {detail.relationships.map((relationship) => (
              <article key={relationship.id}>
                <div>
                  <Link to={relationship.source.path}>
                    {relationship.source.documentShortName} ·{" "}
                    {relationship.source.label}
                  </Link>
                  <span>{relationship.relationType}</span>
                  <Link to={relationship.target.path}>
                    {relationship.target.documentShortName} ·{" "}
                    {relationship.target.label}
                  </Link>
                </div>
                <blockquote>{relationship.evidence.text}</blockquote>
                <small>{relationship.evidence.locator}</small>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
