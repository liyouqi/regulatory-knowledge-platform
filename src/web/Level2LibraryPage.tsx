import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ExternalLink,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  type FamilyLevel2Response,
  familyLevel2ResponseSchema,
} from "../shared/legal";
import { explorerPath, level2LibraryPath } from "../shared/reader-route";

const typeLabels = {
  rts: "RTS",
  its: "ITS",
} as const;

export function Level2LibraryPage({
  familySlug,
  measureType,
  onOpenSearch,
}: {
  familySlug: string;
  measureType?: "rts" | "its";
  onOpenSearch: () => void;
}) {
  const [library, setLibrary] = useState<FamilyLevel2Response | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLibrary(null);
    setLoadError("");
    const typePath = measureType ? `/${measureType}` : "";
    void fetch(
      `/api/families/${encodeURIComponent(familySlug)}/level-2${typePath}`,
      {
        signal: controller.signal,
      },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load Level 2 library");
        return familyLevel2ResponseSchema.parse(await response.json());
      })
      .then(setLibrary)
      .catch((error: unknown) => {
        if ((error as DOMException).name !== "AbortError") {
          setLoadError(
            error instanceof Error ? error.message : "Unable to load library",
          );
        }
      });
    return () => controller.abort();
  }, [familySlug, measureType]);

  const availableTypes = useMemo(
    () =>
      library
        ? (["rts", "its"] as const).filter((type) => library.counts[type] > 0)
        : [],
    [library],
  );

  if (loadError)
    return <main className="loading error-state">{loadError}</main>;
  if (!library)
    return <main className="loading">Loading Level 2 library…</main>;

  return (
    <main className="level2-library-shell">
      <header className="topbar explorer-topbar">
        <Link className="brand" to={explorerPath(familySlug)}>
          <BookOpen aria-hidden="true" size={18} />
          Regulatory Knowledge
        </Link>
        <div className="topbar-actions">
          <Link className="view-switch" to={explorerPath(familySlug)}>
            <ArrowLeft aria-hidden="true" size={15} />
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
      <section className="level2-library-hero">
        <p className="explorer-kicker">
          {library.familyShortName} REGULATORY FAMILY
        </p>
        <h1>Level 2 library</h1>
        <p>
          Officially loaded technical measures and their reviewed mandate
          Articles.
        </p>
        <nav aria-label="Level 2 measure types" className="level2-type-tabs">
          <Link
            aria-current={measureType ? undefined : "page"}
            to={level2LibraryPath(familySlug)}
          >
            All{" "}
            <b>
              {library.counts.rts +
                library.counts.its +
                library.counts.guidelines}
            </b>
          </Link>
          {availableTypes.map((type) => (
            <Link
              aria-current={measureType === type ? "page" : undefined}
              key={type}
              to={level2LibraryPath(familySlug, type)}
            >
              {typeLabels[type]} <b>{library.counts[type]}</b>
            </Link>
          ))}
        </nav>
      </section>
      <section className="level2-library-list">
        {library.measures.length === 0 ? (
          <p className="level2-empty">
            No loaded {measureType ? typeLabels[measureType] : "Level 2"}{" "}
            measures for this family.
          </p>
        ) : (
          library.measures.map((measure) => (
            <article className="level2-measure-card" key={measure.id}>
              <header>
                <span>{measure.measureType.toUpperCase()}</span>
                <span>Officially loaded</span>
                <time dateTime={measure.publicationDate}>
                  Published {measure.publicationDate}
                </time>
              </header>
              <h2>{measure.shortName}</h2>
              <p>{measure.officialTitle}</p>
              <dl>
                <div>
                  <dt>CELEX</dt>
                  <dd>{measure.celex}</dd>
                </div>
                <div>
                  <dt>Mandated by</dt>
                  <dd>
                    {measure.mandates.length > 0
                      ? measure.mandates.map((mandate, index) => (
                          <span key={mandate.articleEntityId}>
                            {index > 0 ? ", " : ""}
                            <Link to={mandate.path}>
                              {mandate.documentShortName} · {mandate.label}
                            </Link>
                          </span>
                        ))
                      : "No reviewed Article mapping yet"}
                  </dd>
                </div>
              </dl>
              <footer>
                <Link to={measure.readerPath}>
                  Read measure <ArrowRight aria-hidden="true" size={15} />
                </Link>
                <Link to={measure.explorerPath}>Explore</Link>
                <a href={measure.sourceUrl} rel="noreferrer" target="_blank">
                  Official source <ExternalLink aria-hidden="true" size={14} />
                </a>
              </footer>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
