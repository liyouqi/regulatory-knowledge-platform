import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  ExternalLink,
  FileQuestion,
  LibraryBig,
  Search,
  ShieldCheck,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  type EbaQaCatalogResponse,
  type EbaQaDetailResponse,
  type EbaQaFacet,
  ebaQaCatalogResponseSchema,
  ebaQaDetailResponseSchema,
} from "../shared/eba-qa";
import {
  dossierCatalogPath,
  dossierDetailPath,
  ebaQaCatalogPath,
} from "../shared/reader-route";
import { type ThemeMode, ThemeToggle } from "./ThemeToggle";

interface EbaQaPageProps {
  selection: { scope: "catalog" } | { scope: "detail"; publicId: string };
  onOpenSearch: () => void;
  onToggleTheme: () => void;
  theme: ThemeMode;
}

function QaHeader({
  onOpenSearch,
  onToggleTheme,
  theme,
}: Omit<EbaQaPageProps, "selection">) {
  return (
    <header className="topbar qa-topbar">
      <Link className="brand" to={ebaQaCatalogPath()}>
        <BookOpen aria-hidden="true" size={18} /> Regulatory Intelligence
      </Link>
      <div className="topbar-actions">
        <ThemeToggle onToggle={onToggleTheme} theme={theme} />
        <Link className="view-switch" to={dossierCatalogPath()}>
          Dossiers
        </Link>
        <Link className="view-switch active" to={ebaQaCatalogPath()}>
          <FileQuestion aria-hidden="true" size={15} /> EBA Q&amp;A
        </Link>
        <button className="search-button" onClick={onOpenSearch} type="button">
          <Search aria-hidden="true" size={16} /> Find laws <kbd>⌘ K</kbd>
        </button>
      </div>
    </header>
  );
}

function formatDate(value: string | null): string {
  if (!value) return "Not stated in catalogue";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00Z`));
}

function QaFacetList({
  eyebrow,
  facets,
  onSelect,
  title,
}: {
  eyebrow: string;
  facets: EbaQaFacet[];
  onSelect: (label: string) => void;
  title: string;
}) {
  return (
    <section className="qa-facet-panel">
      <header>
        <small>{eyebrow}</small>
        <h2>{title}</h2>
      </header>
      <ol>
        {facets.map((facet) => (
          <li key={facet.label}>
            <button onClick={() => onSelect(facet.label)} type="button">
              <span>{facet.label}</span>
              <strong>{facet.count.toLocaleString("en")}</strong>
              <ArrowRight aria-hidden="true" size={14} />
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Catalogue({
  onOpenSearch,
  onToggleTheme,
  theme,
}: Omit<EbaQaPageProps, "selection">) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [data, setData] = useState<EbaQaCatalogResponse | null>(null);
  const [error, setError] = useState("");
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const legalAct = params.get("legalAct") ?? "";
  const topic = params.get("topic") ?? "";
  const showOverview = page === 1 && !legalAct && !topic;
  const endpoint = useMemo(() => {
    const query = new URLSearchParams({ page: String(page), pageSize: "24" });
    if (legalAct) query.set("legalAct", legalAct);
    if (topic) query.set("topic", topic);
    return `/api/qa?${query}`;
  }, [legalAct, page, topic]);

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    void fetch(endpoint, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load EBA Q&A catalogue");
        return ebaQaCatalogResponseSchema.parse(await response.json());
      })
      .then(setData)
      .catch((reason: unknown) => {
        if ((reason as DOMException).name !== "AbortError") {
          setError(
            reason instanceof Error ? reason.message : "Unable to load Q&A",
          );
        }
      });
    return () => controller.abort();
  }, [endpoint]);

  function update(next: { page?: number; legalAct?: string; topic?: string }) {
    const query = new URLSearchParams();
    const nextLegalAct = next.legalAct ?? legalAct;
    const nextTopic = next.topic ?? topic;
    const nextPage = next.page ?? 1;
    if (nextLegalAct) query.set("legalAct", nextLegalAct);
    if (nextTopic) query.set("topic", nextTopic);
    if (nextPage > 1) query.set("page", String(nextPage));
    void navigate(`${ebaQaCatalogPath()}${query.size ? `?${query}` : ""}`);
  }

  if (error) return <main className="loading error-state">{error}</main>;
  if (!data) {
    return (
      <main className="loading">Loading the EBA Final Q&amp;A catalogue…</main>
    );
  }
  const detailCollection = data.overview.legalActs.find(
    (facet) => facet.detailCount > 0,
  );
  return (
    <main className="qa-shell">
      <QaHeader
        onOpenSearch={onOpenSearch}
        onToggleTheme={onToggleTheme}
        theme={theme}
      />
      <section className="qa-hero">
        <div>
          <span className="qa-eyebrow">
            <ShieldCheck aria-hidden="true" size={18} /> OFFICIAL REFERENCE
            LIBRARY
          </span>
          <h1>EBA Final Q&amp;A catalogue.</h1>
          <p>
            Browse every Final Q&amp;A in the imported EBA catalogue. DORA
            records open into evidence-linked platform views; the remaining
            catalogue keeps you one click from the official source.
          </p>
        </div>
        <dl>
          <div>
            <dt>Final Q&amp;As</dt>
            <dd>{data.total.toLocaleString("en")}</dd>
          </div>
          <div>
            <dt>Internal DORA views</dt>
            <dd>{data.overview.detailTotal.toLocaleString("en")}</dd>
          </div>
          <div>
            <dt>Legal acts</dt>
            <dd>{data.overview.legalActs.length.toLocaleString("en")}</dd>
          </div>
          <div>
            <dt>Topics</dt>
            <dd>{data.overview.topics.length.toLocaleString("en")}</dd>
          </div>
          <div>
            <dt>Imported</dt>
            <dd>{formatDate(data.importedAt.slice(0, 10))}</dd>
          </div>
        </dl>
      </section>
      <section className="qa-currency-notice">
        <ShieldCheck aria-hidden="true" size={20} />
        <p>
          <strong>Final status at import, not a currentness conclusion.</strong>{" "}
          EBA does not systematically reassess published Q&amp;As after
          legislation changes. Verify the official page before relying on an
          answer.
        </p>
        <a href={data.sourceUrl} rel="noreferrer" target="_blank">
          Official catalogue <ArrowUpRight aria-hidden="true" size={14} />
        </a>
      </section>
      {showOverview ? (
        <section className="qa-overview" aria-label="Browse EBA Q&A">
          <header className="qa-overview-heading">
            <span>CATALOGUE MAP</span>
            <h2>Browse by legal act or topic.</h2>
            <p>
              These lists are calculated from the imported Final Q&amp;A
              catalogue. Counts describe this snapshot, not editorial popularity
              or legal importance.
            </p>
          </header>
          {detailCollection ? (
            <button
              className="qa-detail-collection"
              onClick={() => update({ legalAct: detailCollection.label })}
              type="button"
            >
              <small>FULL PLATFORM COLLECTION</small>
              <strong>DORA questions with complete answer views</strong>
              <span>
                {detailCollection.detailCount} official questions, final answers
                and declared legal anchors available inside the platform.
              </span>
              <em>
                Open collection <ArrowRight aria-hidden="true" size={16} />
              </em>
            </button>
          ) : null}
          <div className="qa-facet-grid">
            <QaFacetList
              eyebrow="BY RULEBOOK"
              facets={data.overview.legalActs.slice(0, 8)}
              onSelect={(label) => update({ legalAct: label })}
              title={`${data.overview.legalActs.length} legal acts`}
            />
            <QaFacetList
              eyebrow="BY SUBJECT"
              facets={data.overview.topics.slice(0, 10)}
              onSelect={(label) => update({ topic: label })}
              title="Largest topic collections"
            />
          </div>
        </section>
      ) : null}
      <section className="qa-directory-heading">
        <span>{showOverview ? "LATEST FINAL Q&A" : "FILTERED DIRECTORY"}</span>
        <h2>
          {showOverview
            ? "Recent entries in the official catalogue"
            : `${data.total.toLocaleString("en")} matching questions`}
        </h2>
      </section>
      <section className="qa-controls" aria-label="Filter EBA Q&A catalogue">
        <label>
          Legal act
          <select
            onChange={(event) => update({ legalAct: event.target.value })}
            value={legalAct}
          >
            <option value="">All legal acts</option>
            {data.filters.legalActs.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          Topic
          <select
            onChange={(event) => update({ topic: event.target.value })}
            value={topic}
          >
            <option value="">All topics</option>
            {data.filters.topics.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <div>
          <span>{data.total.toLocaleString("en")} results</span>
          {(legalAct || topic) && (
            <button
              onClick={() => void navigate(ebaQaCatalogPath())}
              type="button"
            >
              Clear filters
            </button>
          )}
        </div>
      </section>
      <section className="qa-grid" aria-label="EBA Q&A results">
        {data.records.map((record) => {
          const content = (
            <Fragment key={`${record.id}:content`}>
              <header>
                <span>{record.publicId}</span>
                <span>
                  {record.detailAvailable ? "PLATFORM VIEW" : "EBA SOURCE"}
                </span>
              </header>
              <h2>{record.title}</h2>
              <p>{record.question}</p>
              <dl>
                <div>
                  <dt>Legal act</dt>
                  <dd>{record.legalActLabel}</dd>
                </div>
                <div>
                  <dt>Topic</dt>
                  <dd>{record.topicLabel}</dd>
                </div>
              </dl>
              <footer>
                <span>Final at import · {formatDate(record.publishedAt)}</span>
                {record.detailAvailable ? (
                  <ArrowRight aria-hidden="true" size={18} />
                ) : (
                  <ExternalLink aria-hidden="true" size={17} />
                )}
              </footer>
            </Fragment>
          );
          return record.internalPath ? (
            <Link
              className="qa-card featured"
              key={record.id}
              to={record.internalPath}
            >
              {content}
            </Link>
          ) : (
            <a
              className="qa-card"
              href={record.officialUrl}
              key={record.id}
              rel="noreferrer"
              target="_blank"
            >
              {content}
            </a>
          );
        })}
      </section>
      <nav className="qa-pagination" aria-label="Q&A result pages">
        <button
          disabled={data.page <= 1}
          onClick={() => update({ page: data.page - 1 })}
          type="button"
        >
          <ArrowLeft aria-hidden="true" size={15} /> Previous
        </button>
        <span>
          Page {data.page} of {data.pageCount}
        </span>
        <button
          disabled={data.page >= data.pageCount}
          onClick={() => update({ page: data.page + 1 })}
          type="button"
        >
          Next <ArrowRight aria-hidden="true" size={15} />
        </button>
      </nav>
    </main>
  );
}

function Detail({
  publicId,
  onOpenSearch,
  onToggleTheme,
  theme,
}: Omit<EbaQaPageProps, "selection"> & { publicId: string }) {
  const [data, setData] = useState<EbaQaDetailResponse | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/qa/${encodeURIComponent(publicId)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("EBA Q&A detail not found");
        return ebaQaDetailResponseSchema.parse(await response.json());
      })
      .then(setData)
      .catch((reason: unknown) => {
        if ((reason as DOMException).name !== "AbortError") {
          setError(
            reason instanceof Error ? reason.message : "Unable to load Q&A",
          );
        }
      });
    return () => controller.abort();
  }, [publicId]);
  if (error) return <main className="loading error-state">{error}</main>;
  if (!data) return <main className="loading">Loading official Q&amp;A…</main>;
  return (
    <main className="qa-shell qa-detail-shell">
      <QaHeader
        onOpenSearch={onOpenSearch}
        onToggleTheme={onToggleTheme}
        theme={theme}
      />
      <section className="qa-detail-hero">
        <Link to={ebaQaCatalogPath()}>
          <ArrowLeft aria-hidden="true" size={14} /> All EBA Q&amp;A
        </Link>
        <span>
          <FileQuestion aria-hidden="true" size={18} /> OFFICIAL EBA Q&amp;A ·{" "}
          {data.catalog.publicId}
        </span>
        <h1>{data.catalog.title}</h1>
        <div>
          <span>{data.catalog.legalActLabel}</span>
          <span>{data.catalog.topicLabel}</span>
          <span>Final at import · {formatDate(data.catalog.publishedAt)}</span>
        </div>
      </section>
      <section className="qa-evidence-layout">
        <article className="qa-answer">
          <section>
            <small>THE QUESTION</small>
            <h2>{data.catalog.question}</h2>
          </section>
          {data.detail.background ? (
            <details>
              <summary>Background submitted with the question</summary>
              <p>{data.detail.background}</p>
            </details>
          ) : null}
          <section className="qa-final-answer">
            <small>FINAL ANSWER</small>
            <p>{data.detail.finalAnswer}</p>
          </section>
          <aside>
            <ShieldCheck aria-hidden="true" size={18} />
            <p>{data.detail.nonBindingNotice}</p>
          </aside>
        </article>
        <aside className="qa-source-rail">
          <section>
            <span>
              <LibraryBig aria-hidden="true" size={18} /> EVIDENCE MAP
            </span>
            <h2>Declared legal anchors</h2>
            {data.references.map((reference) =>
              reference.targetPath ? (
                <Link
                  className="qa-reference"
                  key={`${reference.role}:${reference.citationLabel}`}
                  to={reference.targetPath}
                >
                  <small>{reference.role.replaceAll("-", " ")}</small>
                  <strong>
                    {reference.targetDocumentShortName ??
                      reference.citationLabel}
                  </strong>
                  {reference.targetLabel &&
                  reference.targetLabel !==
                    reference.targetDocumentShortName ? (
                    <span>{reference.targetLabel}</span>
                  ) : null}
                  <ArrowRight aria-hidden="true" size={15} />
                </Link>
              ) : (
                <div
                  className="qa-reference external"
                  key={`${reference.role}:${reference.citationLabel}`}
                >
                  <small>{reference.role.replaceAll("-", " ")}</small>
                  <strong>{reference.citationLabel}</strong>
                  <span>{reference.resolutionStatus}</span>
                </div>
              ),
            )}
          </section>
          <section className="qa-source-card">
            <small>ANSWER SOURCE</small>
            <strong>
              {data.detail.answerPreparedBy ?? "Not stated by EBA"}
            </strong>
            <span>Imported {formatDate(data.importedAt.slice(0, 10))}</span>
            <a href={data.catalog.officialUrl} rel="noreferrer" target="_blank">
              Open official Q&amp;A{" "}
              <ArrowUpRight aria-hidden="true" size={14} />
            </a>
          </section>
          {data.dossiers.length > 0 ? (
            <section className="qa-source-card qa-dossier-links">
              <small>USED IN DOSSIER</small>
              {data.dossiers.map((dossier) => (
                <Link key={dossier.id} to={dossierDetailPath(dossier.slug)}>
                  <strong>{dossier.title}</strong>
                  <span>{dossier.kicker}</span>
                  <ArrowRight aria-hidden="true" size={14} />
                </Link>
              ))}
            </section>
          ) : null}
        </aside>
      </section>
    </main>
  );
}

export function EbaQaPage({ selection, ...props }: EbaQaPageProps) {
  return selection.scope === "detail" ? (
    <Detail publicId={selection.publicId} {...props} />
  ) : (
    <Catalogue {...props} />
  );
}
