import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  ExternalLink,
  Network,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  type ApplicabilityResponse,
  applicabilityResponseSchema,
} from "../shared/applicability";
import {
  documentRelationshipGraphPath,
  explorerPath,
} from "../shared/reader-route";
import { type ThemeMode, ThemeToggle } from "./ThemeToggle";

function roleLabel(
  role: ApplicabilityResponse["result"]["evidence"][number]["role"],
) {
  switch (role) {
    case "scope-intro":
      return "Scope introduction";
    case "entity-listing":
      return "Entity listing";
    case "qualification":
      return "Qualification to review";
  }
}

export function ApplicabilityPage({
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
  const [response, setResponse] = useState<ApplicabilityResponse | null>(null);
  const [entityType, setEntityType] = useState("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setResponse(null);
    setLoadError("");
    const query = entityType
      ? `?${new URLSearchParams({ entityType }).toString()}`
      : "";
    void fetch(`/api/applicability/${encodeURIComponent(slug)}${query}`, {
      signal: controller.signal,
    })
      .then(async (result) => {
        if (!result.ok) throw new Error("Applicability rule not found");
        return applicabilityResponseSchema.parse(await result.json());
      })
      .then((result) => {
        setResponse(result);
        setEntityType(result.entityType.id);
      })
      .catch((error: unknown) => {
        if ((error as DOMException).name !== "AbortError") {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Unable to load applicability rule",
          );
        }
      });
    return () => controller.abort();
  }, [entityType, slug]);

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
        Loading reviewed applicability evidence…
      </main>
    );
  }

  const scopeEvidence = response.result.evidence.filter(
    (item) => item.role !== "qualification",
  );
  const qualifications = response.result.evidence.filter(
    (item) => item.role === "qualification",
  );

  return (
    <main className="applicability-shell">
      <a className="skip-link" href="#applicability-evidence">
        Skip to applicability evidence
      </a>
      <header className="topbar explorer-topbar">
        <Link className="brand" to={explorerPath(response.document.slug)}>
          <BookOpen aria-hidden="true" size={18} /> Regulatory Knowledge
        </Link>
        <div className="topbar-actions">
          <ThemeToggle onToggle={onToggleTheme} theme={theme} />
          <Link
            className="view-switch"
            to={explorerPath(response.document.slug)}
          >
            <ArrowLeft aria-hidden="true" size={15} /> Explore
          </Link>
          <Link
            className="view-switch"
            to={documentRelationshipGraphPath(response.document.slug)}
          >
            <Network aria-hidden="true" size={15} /> Relationships
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

      <section className="applicability-hero">
        <div>
          <span>
            <ShieldCheck aria-hidden="true" size={22} /> REVIEWED LEGAL-TEXT
            EVIDENCE
          </span>
          <h1>{response.document.shortName} Applicability Navigator</h1>
          <p>{response.document.officialTitle}</p>
        </div>
        <label>
          <span>Entity type</span>
          <select
            onChange={(event) => setEntityType(event.currentTarget.value)}
            value={response.entityType.id}
          >
            {response.availableEntityTypes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="applicability-status" aria-label="Result status">
        <span>ARTICLE 2 RESULT</span>
        <h2>Listed in scope; qualifications require review</h2>
        <p>
          This result identifies an exact entity listing and preserves the
          qualifications attached to the same scope Article. It is not a final
          legal determination for a specific institution.
        </p>
        <Link to={response.result.scopeProvision.path}>
          Open {response.result.scopeProvision.label}
          <ArrowUpRight aria-hidden="true" size={14} />
        </Link>
      </section>

      <section className="applicability-evidence" id="applicability-evidence">
        <header>
          <span>01 · SCOPE LISTING</span>
          <h2>Why this entity type is surfaced</h2>
          <p>Exact text from the loaded official DORA source.</p>
        </header>
        <div>
          {scopeEvidence.map((item) => (
            <article key={`${item.role}:${item.sourceEntityId}`}>
              <span>{roleLabel(item.role)}</span>
              <blockquote>{item.evidenceText}</blockquote>
              <footer>
                <Link to={item.sourcePath}>{item.sourceLabel}</Link>
                <a href={item.sourceUrl} rel="noreferrer" target="_blank">
                  Official source <ExternalLink aria-hidden="true" size={12} />
                </a>
              </footer>
            </article>
          ))}
        </div>
      </section>

      <section className="applicability-evidence qualifications">
        <header>
          <span>02 · QUALIFICATIONS</span>
          <h2>Scope conditions retained for review</h2>
          <p>No qualification is hidden or collapsed into a binary answer.</p>
        </header>
        <div>
          {qualifications.map((item) => (
            <article key={item.sourceEntityId}>
              <span>{item.sourceLabel}</span>
              <blockquote>{item.evidenceText}</blockquote>
              <footer>
                <Link to={item.sourcePath}>Open exact paragraph</Link>
                <small>{item.evidenceLocator}</small>
              </footer>
            </article>
          ))}
        </div>
      </section>

      <section className="applicability-navigation">
        <header>
          <span>03 · RELATED DORA PROVISIONS</span>
          <h2>Continue into the reviewed RTS/ITS relationship map</h2>
          <p>
            These are navigation entries, not automatically applicable
            obligations. Their links reuse existing exact MANDATES evidence.
          </p>
        </header>
        <div>
          {response.result.navigation.map((item) => (
            <article key={item.provision.entityId}>
              <Link to={item.provision.path}>
                <span>{item.provision.label}</span>
                <h3>{item.provision.title}</h3>
                <ArrowUpRight aria-hidden="true" size={16} />
              </Link>
              <ul>
                {item.relationships.map((relationship) => (
                  <li key={relationship.id}>
                    <Link to={relationship.target.path}>
                      <strong>{relationship.target.documentShortName}</strong>
                      <span>{relationship.relationType}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <footer className="applicability-footer">
        <span>{response.runtime.profileDisplayName}</span>
        <span>{response.review.reviewStatus}</span>
        <span>
          {response.review.builderMethod}@{response.review.builderVersion}
        </span>
        <a href={response.document.sourceUrl} rel="noreferrer" target="_blank">
          EUR-Lex source <ExternalLink aria-hidden="true" size={12} />
        </a>
      </footer>
    </main>
  );
}
