import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Globe2,
  Search,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  type CountryCatalogResponse,
  type CountryDetailResponse,
  countryCatalogResponseSchema,
  countryDetailResponseSchema,
} from "../shared/country";
import { type ThemeMode, ThemeToggle } from "./ThemeToggle";

export function CountryPage({
  code,
  onOpenSearch,
  onToggleTheme,
  theme,
}: {
  code?: string;
  onOpenSearch: () => void;
  onToggleTheme: () => void;
  theme: ThemeMode;
}) {
  const [catalog, setCatalog] = useState<CountryCatalogResponse | null>(null);
  const [detail, setDetail] = useState<CountryDetailResponse | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");

  useEffect(() => {
    const controller = new AbortController();
    setCatalog(null);
    setDetail(null);
    setError("");
    void fetch(
      code ? `/api/countries/${encodeURIComponent(code)}` : "/api/countries",
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            response.status === 404
              ? "Country not found"
              : "Unable to load countries",
          );
        const payload: unknown = await response.json();
        if (code) setDetail(countryDetailResponseSchema.parse(payload));
        else setCatalog(countryCatalogResponseSchema.parse(payload));
      })
      .catch((reason: unknown) => {
        if ((reason as DOMException).name !== "AbortError")
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load countries",
          );
      });
    return () => controller.abort();
  }, [code]);

  const country = detail?.entry.country;
  const entries =
    catalog?.countries.filter(
      (entry) =>
        (group === "all" || entry.country.group === group) &&
        `${entry.country.name} ${entry.country.nameZh} ${entry.country.code}`
          .toLowerCase()
          .includes(query.toLowerCase().trim()),
    ) ?? [];

  return (
    <main className="topic-shell country-shell">
      <header className="topbar explorer-topbar">
        <Link className="brand" to="/countries">
          <Globe2 aria-hidden="true" size={18} /> Regulatory Knowledge
        </Link>
        <div className="topbar-actions">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <Link className="view-switch active" to="/countries">
            Countries
          </Link>
          <Link className="view-switch" to="/topics">
            Topics
          </Link>
          <button
            type="button"
            className="search-button"
            onClick={onOpenSearch}
          >
            <Search aria-hidden="true" size={16} /> Find laws <kbd>⌘ K</kbd>
          </button>
        </div>
      </header>
      {error ? (
        <section className="loading error-state" role="alert">
          {error}
          <Link to="/countries">Back to countries</Link>
        </section>
      ) : null}
      {!error && !catalog && !detail ? (
        <section className="loading" aria-busy="true">
          Loading countries…
        </section>
      ) : null}
      {catalog ? (
        <>
          <section className="topic-hero">
            <span>
              <Globe2 aria-hidden="true" size={26} /> EUROPEAN COUNTRY DIRECTORY
            </span>
            <h1>Financial regulation by country</h1>
            <p>
              Browse local Reader material and national legislation sources.
              Country entries also show where local text is still to be added.
            </p>
            <dl>
              <div>
                <dt>Countries</dt>
                <dd>{catalog.countries.length}</dd>
              </div>
              <div>
                <dt>Local Reader documents</dt>
                <dd>
                  {catalog.countries.reduce(
                    (sum, entry) => sum + entry.localDocumentCount,
                    0,
                  )}
                </dd>
              </div>
              <div>
                <dt>EU documents, listed separately</dt>
                <dd>{catalog.euDocumentCount}</dd>
              </div>
            </dl>
          </section>
          <section className="country-filters" aria-label="Filter countries">
            <label>
              Country
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name or country code"
              />
            </label>
            <label>
              Region
              <select
                value={group}
                onChange={(event) => setGroup(event.target.value)}
              >
                <option value="all">All countries</option>
                <option value="EU">EU members</option>
                <option value="EEA-EFTA">EEA EFTA states</option>
                <option value="OTHER">United Kingdom and Switzerland</option>
              </select>
            </label>
          </section>
          <section className="country-grid" aria-label="Countries">
            {entries.map((entry) => (
              <Link
                className="country-card"
                to={entry.path}
                key={entry.country.code}
              >
                <span className="country-code">{entry.country.code}</span>
                <h2>{entry.country.name}</h2>
                <p>
                  {entry.country.nameZh} ·{" "}
                  {entry.country.group === "OTHER"
                    ? "Non-EU"
                    : entry.country.group}
                </p>
                <strong>
                  {entry.localDocumentCount} local Reader{" "}
                  {entry.localDocumentCount === 1 ? "document" : "documents"}
                </strong>
                <small>
                  {entry.readerAvailability === "none"
                    ? "Local Reader text to be added"
                    : "Open loaded local material"}
                </small>
              </Link>
            ))}
            {entries.length === 0 ? (
              <p>No countries match these filters.</p>
            ) : null}
          </section>
        </>
      ) : null}
      {detail && country ? (
        <>
          <section className="topic-hero">
            <Link to="/countries">
              <ArrowLeft aria-hidden="true" size={14} /> All countries
            </Link>
            <span>
              {country.code} ·{" "}
              {country.group === "OTHER" ? "NON-EU" : country.group}
            </span>
            <h1>{country.name}</h1>
            <p>{country.nameZh}</p>
            <dl>
              <div>
                <dt>Local Reader documents</dt>
                <dd>{detail.entry.localDocumentCount}</dd>
              </div>
              <div>
                <dt>Edition</dt>
                <dd>{detail.runtime.profileDisplayName}</dd>
              </div>
            </dl>
          </section>
          <section
            className="country-detail"
            aria-labelledby="local-material-heading"
          >
            <h2 id="local-material-heading">Local Reader material</h2>
            {detail.localDocuments.length === 0 ? (
              <p>
                No local Reader text is loaded for {country.name} in this
                edition yet.
              </p>
            ) : (
              <div className="country-grid">
                {detail.localDocuments.map((document) => (
                  <Link
                    className="country-card"
                    key={document.id}
                    to={document.defaultPath}
                  >
                    <BookOpen aria-hidden="true" size={20} />
                    <h3>{document.shortName}</h3>
                    <p>{document.officialTitle}</p>
                    <small>
                      {document.regulatoryLevel.replaceAll("-", " ")}
                    </small>
                  </Link>
                ))}
              </div>
            )}
          </section>
          <section className="country-detail">
            <h2>National legislation source</h2>
            <a
              href={country.legislationPortal.url}
              target="_blank"
              rel="noreferrer"
            >
              {country.legislationPortal.label}{" "}
              <ArrowUpRight aria-hidden="true" size={15} />
            </a>
            <p>
              {country.legislationPortal.reviewStatus === "pending"
                ? "Candidate source link — verification pending."
                : `Source identity checked ${country.legislationPortal.checkedAt?.slice(0, 10)}.`}
            </p>
          </section>
          <section className="country-detail">
            <h2>EU common framework</h2>
            <p>
              {detail.euFramework.documentCount} EU documents are available in
              this edition. This separate collection does not establish their
              applicability to a particular institution or this country's
              implementing measures.
            </p>
            <Link to={detail.euFramework.path}>
              Explore regulatory topics{" "}
              <ArrowUpRight aria-hidden="true" size={15} />
            </Link>
          </section>
        </>
      ) : null}
    </main>
  );
}
