import type { SourceDefinition } from "../ingestion/source-registry";
import type {
  DocumentView,
  LawSearchResponse,
  LawSearchResult,
} from "../shared/legal";
import { explorerPath } from "../shared/reader-route";

export type LawSearchRecord = Omit<LawSearchResult, "matchReason" | "score">;

export function normalizeLawQuery(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/gu, " and ")
    .replace(/[’']/gu, "")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function citationParts(celex: string) {
  const match = /^3(\d{4})([RLD])0*(\d+)$/u.exec(celex);
  if (!match) return null;
  const type =
    match[2] === "R"
      ? "regulation"
      : match[2] === "L"
        ? "directive"
        : "decision";
  return { type, year: match[1], number: match[3] };
}

function isExactCitation(query: string, record: LawSearchRecord): boolean {
  const citation = citationParts(record.celex);
  if (!citation) return false;
  const shortType = citation.type === "regulation" ? "reg" : "dir";
  return new Set([
    `${citation.year} ${citation.number}`,
    `${citation.type} ${citation.year} ${citation.number}`,
    `${shortType} ${citation.year} ${citation.number}`,
    `${citation.type} eu ${citation.year} ${citation.number}`,
    `${citation.type} eu no ${citation.year} ${citation.number}`,
  ]).has(query);
}

function rankRecord(
  record: LawSearchRecord,
  query: string,
): Pick<LawSearchResult, "matchReason" | "score"> | null {
  const compactQuery = query.replace(/\s/gu, "").toUpperCase();
  if (compactQuery === record.celex.toUpperCase()) {
    return { matchReason: "exact-celex", score: 1000 };
  }

  const aliases = [record.shortName, ...record.aliases].map(normalizeLawQuery);
  if (aliases.includes(query)) {
    return { matchReason: "exact-alias", score: 900 };
  }
  if (isExactCitation(query, record)) {
    return { matchReason: "exact-citation", score: 800 };
  }

  const title = normalizeLawQuery(record.officialTitle);
  if (title === query) {
    return { matchReason: "exact-title", score: 700 };
  }
  if ([title, ...aliases].some((candidate) => candidate.startsWith(query))) {
    return { matchReason: "title-prefix", score: 600 };
  }

  const haystack = normalizeLawQuery(
    [record.shortName, ...record.aliases, record.officialTitle].join(" "),
  );
  const haystackTerms = haystack.split(" ").filter(Boolean);
  const terms = query.split(" ").filter(Boolean);
  const hasTerm = (term: string) =>
    haystackTerms.some(
      (candidate) =>
        candidate === term ||
        (/^[a-z]{3,}$/u.test(term) && candidate.startsWith(term)),
    );
  if (terms.length > 0 && terms.every(hasTerm)) {
    return { matchReason: "title-terms", score: 500 + terms.length };
  }
  return null;
}

export function createLawSearchRecords(
  documents: DocumentView[],
  sources: SourceDefinition[],
): LawSearchRecord[] {
  const sourceByCelex = new Map(
    sources.map((source) => [source.celex, source]),
  );
  return documents.flatMap((document) => {
    const source = sourceByCelex.get(document.celex);
    const readerPath = document.provisions[0]?.path;
    if (!source || !readerPath) return [];
    return [
      {
        id: document.id,
        familyId: source.familyId,
        slug: document.slug,
        shortName: document.shortName,
        officialTitle: document.officialTitle,
        documentType: document.documentType,
        publicationDate: document.asOf,
        celex: document.celex,
        aliases: source.aliases,
        readerPath,
        explorerPath: explorerPath(document.slug),
        provenance: document.provenance,
      },
    ];
  });
}

export function searchLaws(
  records: LawSearchRecord[],
  rawQuery: string,
): LawSearchResponse {
  const query = rawQuery.trim();
  const normalizedQuery = normalizeLawQuery(query);
  const results = normalizedQuery
    ? records
        .flatMap((record) => {
          const rank = rankRecord(record, normalizedQuery);
          return rank ? [{ ...record, ...rank }] : [];
        })
        .sort(
          (left, right) =>
            right.score - left.score ||
            left.shortName.localeCompare(right.shortName),
        )
    : records
        .map(
          (record): LawSearchResult => ({
            ...record,
            matchReason: "catalog",
            score: 0,
          }),
        )
        .sort((left, right) => left.shortName.localeCompare(right.shortName));

  return {
    query,
    normalizedQuery,
    bestMatch: normalizedQuery ? results[0] : undefined,
    results,
  };
}
