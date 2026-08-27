import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Building2,
  Landmark,
  Network,
  Route,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  explorerPath,
  globalRelationshipGraphPath,
} from "../shared/reader-route";
import {
  type RegulatoryPathResponse,
  regulatoryPathResponseSchema,
} from "../shared/regulatory-path";
import { type ThemeMode, ThemeToggle } from "./ThemeToggle";

type PathDocument = RegulatoryPathResponse["documents"][number];

const LANES = [
  {
    id: "eu-law",
    eyebrow: "EU LEGISLATION",
    title: "Legal basis",
    description: "Loaded EU legislation assigned to this reviewed Domain.",
    icon: Landmark,
  },
  {
    id: "authority-guidance",
    eyebrow: "AUTHORITY GUIDANCE",
    title: "Supervisory guidance",
    description: "Reviewed authority instruments connected to the legal basis.",
    icon: ShieldCheck,
  },
  {
    id: "national-material",
    eyebrow: "NATIONAL MATERIAL",
    title: "Luxembourg implementation",
    description: "Loaded national material with exact implementation evidence.",
    icon: Building2,
  },
] as const;

type LaneId = (typeof LANES)[number]["id"];

function laneFor(document: PathDocument): LaneId {
  if (document.jurisdiction !== "EU") return "national-material";
  if (
    document.measureType === "guideline" ||
    document.documentType === "guidance"
  ) {
    return "authority-guidance";
  }
  return "eu-law";
}

function readable(value: string): string {
  return value.replaceAll("-", " ");
}

export function RegulatoryPathPage({
  domainSlug,
  onOpenSearch,
  onToggleTheme,
  theme,
}: {
  domainSlug: string;
  onOpenSearch: () => void;
  onToggleTheme: () => void;
  theme: ThemeMode;
}) {
  const [response, setResponse] = useState<RegulatoryPathResponse | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setResponse(null);
    setLoadError("");
    void fetch(`/api/regulatory-paths/${encodeURIComponent(domainSlug)}`, {
      signal: controller.signal,
    })
      .then(async (result) => {
        if (!result.ok) throw new Error("Regulatory path not found");
        return regulatoryPathResponseSchema.parse(await result.json());
      })
      .then(setResponse)
      .catch((error: unknown) => {
        if ((error as DOMException).name !== "AbortError") {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Unable to load regulatory path",
          );
        }
      });
    return () => controller.abort();
  }, [domainSlug]);

  const documentsByLane = useMemo(() => {
    const lanes = new Map<LaneId, PathDocument[]>();
    for (const document of response?.documents ?? []) {
      const lane = laneFor(document);
      lanes.set(lane, [...(lanes.get(lane) ?? []), document]);
    }
    return lanes;
  }, [response]);

  if (loadError) {
    return (
      <main className="loading error-state" role="alert">
        {loadError}
      </main>
    );
  }
  if (!response) {
    return (
      <main aria-busy="true" aria-live="polite" className="loading">
        Loading regulatory path…
      </main>
    );
  }

  const firstDocument = response.documents[0];
  return (
    <main className="regulatory-path-shell">
      <a className="skip-link" href="#regulatory-path">
        Skip to regulatory path
      </a>
      <header className="topbar explorer-topbar">
        <Link
          className="brand"
          to={firstDocument ? explorerPath(firstDocument.slug) : "/"}
        >
          <BookOpen aria-hidden="true" size={18} /> Regulatory Knowledge
        </Link>
        <div className="topbar-actions">
          <ThemeToggle onToggle={onToggleTheme} theme={theme} />
          {firstDocument ? (
            <Link className="view-switch" to={explorerPath(firstDocument.slug)}>
              <ArrowLeft aria-hidden="true" size={15} /> Explore
            </Link>
          ) : null}
          <Link className="view-switch" to={globalRelationshipGraphPath()}>
            <Network aria-hidden="true" size={15} /> Network
          </Link>
          <button
            className="search-button"
            onClick={onOpenSearch}
            type="button"
          >
            <Search aria-hidden="true" size={16} /> Find laws <kbd>⌘ K</kbd>
          </button>
        </div>
      </header>

      <section className="regulatory-path-hero">
        <nav aria-label="Regulatory Domain hierarchy">
          {[...response.ancestors, response.domain].map((domain, index) => (
            <span key={domain.id}>
              {index > 0 ? <ArrowRight aria-hidden="true" size={12} /> : null}
              {domain.label}
            </span>
          ))}
        </nav>
        <div className="regulatory-path-heading">
          <span>
            <Route aria-hidden="true" size={30} /> REVIEWED REGULATORY PATH
          </span>
          <h1>{response.domain.label}</h1>
          <p>{response.domain.description}</p>
        </div>
        <dl>
          <div>
            <dt>Documents</dt>
            <dd>{response.documents.length}</dd>
          </div>
          <div>
            <dt>Mapped links</dt>
            <dd>{response.relationships.length}</dd>
          </div>
          <div>
            <dt>Edition</dt>
            <dd>{response.runtime.profileDisplayName}</dd>
          </div>
        </dl>
      </section>

      <section className="regulatory-path-scope" aria-label="Path scope">
        <ShieldCheck aria-hidden="true" size={20} />
        <div>
          <strong>Traceable navigation, not an applicability decision</strong>
          <p>
            Domain membership is reviewed editorial classification. Every legal
            connection below is an existing OFFICIAL_MAPPING edge with exact
            evidence; the selected Edition controls corpus visibility only.
          </p>
        </div>
        <span>{response.runtime.profileId}</span>
      </section>

      <section className="regulatory-path-lanes" id="regulatory-path">
        {LANES.map((lane) => {
          const Icon = lane.icon;
          const documents = documentsByLane.get(lane.id) ?? [];
          return (
            <article
              className={`regulatory-path-lane ${lane.id}`}
              key={lane.id}
            >
              <header>
                <Icon aria-hidden="true" size={20} />
                <div>
                  <span>{lane.eyebrow}</span>
                  <h2>{lane.title}</h2>
                  <p>{lane.description}</p>
                </div>
              </header>
              <div className="regulatory-path-documents">
                {documents.map((document) => {
                  const provisions = document.assignments.filter(
                    (assignment) => assignment.targetKind === "provision",
                  );
                  return (
                    <section key={document.id}>
                      <div className="path-document-meta">
                        <span>{document.jurisdiction}</span>
                        <span>{readable(document.documentType)}</span>
                        <span>
                          {document.authorityRelationships
                            .map(
                              (relationship) =>
                                relationship.target.acronym ??
                                relationship.target.officialName,
                            )
                            .join(" · ")}
                        </span>
                      </div>
                      <h3>{document.shortName}</h3>
                      <p>{document.officialTitle}</p>
                      {document.legalNature ? (
                        <small>
                          {readable(document.legalNature.instrumentType)} ·{" "}
                          {readable(document.legalNature.complianceExpectation)}{" "}
                          · {readable(document.legalNature.currentStatus)}
                        </small>
                      ) : null}
                      {provisions.length > 0 ? (
                        <ul>
                          {provisions.map((assignment) => (
                            <li key={assignment.id}>
                              <Link to={assignment.targetPath}>
                                {assignment.targetLabel}
                                <ArrowUpRight aria-hidden="true" size={13} />
                              </Link>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      <footer>
                        <Link to={explorerPath(document.slug)}>
                          Explore document{" "}
                          <ArrowRight aria-hidden="true" size={14} />
                        </Link>
                        <a
                          href={document.sourceUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Official source
                          <ArrowUpRight aria-hidden="true" size={14} />
                        </a>
                      </footer>
                    </section>
                  );
                })}
              </div>
            </article>
          );
        })}
      </section>

      <section className="regulatory-path-evidence">
        <header>
          <span>RELATIONSHIP EVIDENCE</span>
          <h2>Every direction stays explicit</h2>
          <p>
            The page does not reverse or merge legal relationships to create a
            cleaner-looking chain.
          </p>
        </header>
        <div>
          {response.relationships.map((relationship, index) => (
            <article key={relationship.id}>
              <span className="path-edge-number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="path-edge-direction">
                <Link to={relationship.source.path}>
                  <small>{relationship.source.documentShortName}</small>
                  <strong>
                    {relationship.source.label}
                    {relationship.source.title
                      ? ` — ${relationship.source.title}`
                      : ""}
                  </strong>
                </Link>
                <span>
                  {relationship.relationType}
                  <ArrowRight aria-hidden="true" size={17} />
                </span>
                <Link to={relationship.target.path}>
                  <small>{relationship.target.documentShortName}</small>
                  <strong>
                    {relationship.target.label}
                    {relationship.target.title
                      ? ` — ${relationship.target.title}`
                      : ""}
                  </strong>
                </Link>
              </div>
              <blockquote>{relationship.evidence.text}</blockquote>
              <footer>
                <span>
                  {relationship.provenance} · {relationship.evidence.locator}
                </span>
                <a
                  href={relationship.evidence.sourceUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Evidence source <ArrowUpRight aria-hidden="true" size={13} />
                </a>
              </footer>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
