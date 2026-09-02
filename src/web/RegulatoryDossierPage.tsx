import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  FileStack,
  LibraryBig,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  dossierCatalogPath,
  dossierDetailPath,
  ebaQaCatalogPath,
} from "../shared/reader-route";
import {
  type DossierCatalogResponse,
  type DossierDetailResponse,
  dossierCatalogResponseSchema,
  dossierDetailResponseSchema,
} from "../shared/regulatory-dossier";
import { DossierModuleRenderer } from "./DossierModules";
import { type ThemeMode, ThemeToggle } from "./ThemeToggle";

interface RegulatoryDossierPageProps {
  selection: { scope: "catalog" } | { scope: "detail"; slug: string };
  onOpenSearch: () => void;
  onToggleTheme: () => void;
  theme: ThemeMode;
}

function DossierHeader({
  onOpenSearch,
  onToggleTheme,
  theme,
}: Omit<RegulatoryDossierPageProps, "selection">) {
  return (
    <header className="topbar qa-topbar">
      <Link className="brand" to={dossierCatalogPath()}>
        <BookOpen aria-hidden="true" size={18} /> Regulatory Intelligence
      </Link>
      <div className="topbar-actions">
        <ThemeToggle onToggle={onToggleTheme} theme={theme} />
        <Link className="view-switch" to={ebaQaCatalogPath()}>
          EBA Q&amp;A
        </Link>
        <Link className="view-switch active" to={dossierCatalogPath()}>
          <FileStack aria-hidden="true" size={15} /> Dossiers
        </Link>
        <button className="search-button" onClick={onOpenSearch} type="button">
          <Search aria-hidden="true" size={16} /> Find laws <kbd>⌘ K</kbd>
        </button>
      </div>
    </header>
  );
}

function Catalog(props: Omit<RegulatoryDossierPageProps, "selection">) {
  const [data, setData] = useState<DossierCatalogResponse | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/dossiers", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load Dossiers");
        return dossierCatalogResponseSchema.parse(await response.json());
      })
      .then(setData)
      .catch((reason: unknown) => {
        if ((reason as DOMException).name !== "AbortError") {
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load Dossiers",
          );
        }
      });
    return () => controller.abort();
  }, []);
  if (error) return <main className="loading error-state">{error}</main>;
  if (!data)
    return <main className="loading">Loading Regulatory Dossiers…</main>;
  return (
    <main className="qa-shell dossier-shell">
      <DossierHeader {...props} />
      <section className="dossier-catalog-hero">
        <span>
          <FileStack aria-hidden="true" size={18} /> REVIEWED PLATFORM ANALYSIS
        </span>
        <h1>Follow the issue, not the document list.</h1>
        <p>
          Dossiers connect controlling provisions with official EBA answers and
          turn them into a source-visible operating view. Analysis is editorial;
          the cited law and Q&amp;A remain authoritative.
        </p>
      </section>
      <section className="dossier-grid" aria-label="Regulatory Dossiers">
        {data.records.map((dossier, index) => (
          <Link
            className="dossier-card"
            key={dossier.id}
            to={dossierDetailPath(dossier.slug)}
          >
            <span>0{index + 1}</span>
            <small>{dossier.kicker}</small>
            <h2>{dossier.title}</h2>
            <p>{dossier.summary}</p>
            <footer>
              <span>{dossier.sectionCount} analysis steps</span>
              <span>{dossier.qaCount} official Q&amp;A</span>
              <ArrowRight aria-hidden="true" size={18} />
            </footer>
          </Link>
        ))}
      </section>
      <aside className="dossier-method-note">
        <ShieldCheck aria-hidden="true" size={20} />
        <div>
          <strong>Publication gate</strong>
          <p>
            Every analysis section has explicit sources. A Dossier is omitted
            from a runtime profile when any required source is unavailable.
          </p>
        </div>
      </aside>
    </main>
  );
}

function Detail({
  slug,
  ...props
}: Omit<RegulatoryDossierPageProps, "selection"> & { slug: string }) {
  const [data, setData] = useState<DossierDetailResponse | null>(null);
  const [error, setError] = useState("");
  const [selectedSectionId, setSelectedSectionId] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/dossiers/${encodeURIComponent(slug)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Regulatory Dossier not found");
        return dossierDetailResponseSchema.parse(await response.json());
      })
      .then(setData)
      .catch((reason: unknown) => {
        if ((reason as DOMException).name !== "AbortError") {
          setError(
            reason instanceof Error ? reason.message : "Unable to load Dossier",
          );
        }
      });
    return () => controller.abort();
  }, [slug]);
  const sourcesById = useMemo(
    () => new Map(data?.dossier.sources.map((source) => [source.id, source])),
    [data],
  );
  if (error) return <main className="loading error-state">{error}</main>;
  if (!data)
    return <main className="loading">Loading Regulatory Dossier…</main>;
  const { dossier } = data;
  const activeSectionId = dossier.sections.some(
    (section) => section.id === selectedSectionId,
  )
    ? selectedSectionId
    : dossier.presentation.items[0].sectionId;
  const activeSection = dossier.sections.find(
    (section) => section.id === activeSectionId,
  );
  if (!activeSection) {
    return (
      <main className="loading error-state">Dossier section not found</main>
    );
  }
  const activeSources = activeSection.sourceIds.flatMap((sourceId) => {
    const source = sourcesById.get(sourceId);
    return source ? [source] : [];
  });
  return (
    <main className="qa-shell dossier-shell dossier-detail-shell">
      <DossierHeader {...props} />
      <section className="dossier-detail-hero">
        <Link to={dossierCatalogPath()}>
          <ArrowLeft aria-hidden="true" size={14} /> All Dossiers
        </Link>
        <span>{dossier.kicker}</span>
        <h1>{dossier.title}</h1>
        <p>{dossier.summary}</p>
        <div>
          <span>For {dossier.audience}</span>
          <span>{dossier.sections.length} source-backed steps</span>
        </div>
      </section>
      <section className="dossier-detail-layout">
        <article className="dossier-analysis">
          <header>
            <small>PLATFORM ANALYSIS · EDITORIAL</small>
            <p>
              This synthesis helps navigate the issue. Use the linked official
              text and EBA answers for the controlling wording.
            </p>
          </header>
          <DossierModuleRenderer
            activeSectionId={activeSectionId}
            dossier={dossier}
            onSelect={setSelectedSectionId}
          />
          <section className="dossier-active-analysis" key={activeSection.id}>
            <small>{activeSection.eyebrow}</small>
            <h2>{activeSection.title}</h2>
            <p>{activeSection.body}</p>
            {activeSection.timeSensitivity ? (
              <aside className="dossier-time-warning">
                <ShieldCheck aria-hidden="true" size={17} />
                <span>{activeSection.timeSensitivity.note}</span>
              </aside>
            ) : null}
            <div className="dossier-inline-sources">
              {activeSources.map((source) => (
                <Link key={source.id} to={source.targetPath}>
                  {source.targetLabel} <ArrowUpRight size={12} />
                </Link>
              ))}
            </div>
          </section>
        </article>
        <aside className="dossier-source-rail">
          <span>
            <LibraryBig aria-hidden="true" size={18} /> CURRENT EVIDENCE
          </span>
          <h2>{activeSources.length} anchors for this step</h2>
          <p className="dossier-evidence-nature">
            {activeSection.nature === "source-synthesis"
              ? "Source synthesis"
              : "Platform workflow"}
          </p>
          {activeSources.map((source) => (
            <Link
              className="dossier-source"
              key={source.id}
              to={source.targetPath}
            >
              <small>
                {source.provenance === "OFFICIAL_QA"
                  ? "OFFICIAL EBA Q&A"
                  : "OFFICIAL LEGAL TEXT"}
              </small>
              <strong>{source.targetLabel}</strong>
              {source.targetTitle ? <span>{source.targetTitle}</span> : null}
              <ArrowRight aria-hidden="true" size={15} />
            </Link>
          ))}
          <details className="dossier-full-source-index">
            <summary>Full source index · {dossier.sources.length}</summary>
            <div>
              {dossier.sources.map((source) => (
                <Link key={source.id} to={source.targetPath}>
                  <small>
                    {source.provenance === "OFFICIAL_QA" ? "EBA Q&A" : "LAW"}
                  </small>
                  <span>{source.targetLabel}</span>
                </Link>
              ))}
            </div>
          </details>
          <p>
            Reviewed {new Date(dossier.reviewedAt).toLocaleDateString("en-GB")}
          </p>
        </aside>
      </section>
    </main>
  );
}

export function RegulatoryDossierPage({
  selection,
  ...props
}: RegulatoryDossierPageProps) {
  return selection.scope === "detail" ? (
    <Detail slug={selection.slug} {...props} />
  ) : (
    <Catalog {...props} />
  );
}
