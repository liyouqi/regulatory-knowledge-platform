import type { SourceDefinition } from "../ingestion/source-registry";
import type {
  DocumentView,
  LawSearchResponse,
  LawSearchResult,
} from "../shared/legal";
import { explorerPath } from "../shared/reader-route";

type SearchableProvision = Pick<
  DocumentView["provisions"][number],
  "kind" | "number" | "label" | "title" | "path"
>;

export type LawSearchRecord = Omit<
  LawSearchResult,
  "matchReason" | "score" | "target"
> & {
  provisions: SearchableProvision[];
};

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
  const citation = citationParts(record.celex ?? "");
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
  if (record.celex && compactQuery === record.celex.toUpperCase()) {
    return { matchReason: "exact-celex", score: 1000 };
  }
  if (record.localId && normalizeLawQuery(record.localId) === query) {
    return { matchReason: "exact-local-id", score: 1000 };
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

function parseProvisionIntent(query: string) {
  const match =
    /^(.*?)\s+(articles?|art|recitals?|rec|annex(?:es)?|ann)\s+([a-z0-9]+)$/u.exec(
      query,
    );
  if (!match?.[1]) return null;
  const token = match[2];
  const kind = token.startsWith("art")
    ? "article"
    : token.startsWith("rec")
      ? "recital"
      : "annex";
  return { lawQuery: match[1], kind, number: match[3] } as const;
}

function parseIncompleteProvisionIntent(query: string) {
  const match =
    /^(.*?)\s+(articles?|art|recitals?|rec|annex(?:es)?|ann)$/u.exec(query);
  return match?.[1] ? { lawQuery: match[1] } : null;
}

function toResult(
  record: LawSearchRecord,
  rank: Pick<LawSearchResult, "matchReason" | "score">,
  target?: LawSearchResult["target"],
): LawSearchResult {
  const { provisions: _provisions, ...law } = record;
  return { ...law, ...rank, target };
}

export function createLawSearchRecords(
  documents: DocumentView[],
  sources: Array<
    Pick<
      SourceDefinition,
      "familyId" | "aliases" | "regulatoryLevel" | "measureType"
    > & { celex?: string; localId?: string }
  >,
): LawSearchRecord[] {
  const sourceByIdentifier = new Map(
    sources.flatMap((source) => {
      const identifier = source.celex ?? source.localId;
      return identifier ? [[identifier, source] as const] : [];
    }),
  );
  return documents.flatMap((document) => {
    const identifier = document.celex ?? document.localId;
    const source = identifier ? sourceByIdentifier.get(identifier) : undefined;
    const readerPath = document.provisions[0]?.path;
    if (!source || !readerPath) return [];
    return [
      {
        id: document.id,
        familyId: source.familyId,
        regulatoryLevel: source.regulatoryLevel,
        measureType: source.measureType,
        slug: document.slug,
        shortName: document.shortName,
        officialTitle: document.officialTitle,
        documentType: document.documentType,
        publicationDate: document.asOf,
        celex: document.celex,
        localId: document.localId,
        aliases: source.aliases,
        readerPath,
        explorerPath: explorerPath(document.slug),
        provenance: document.provenance,
        provisions: document.provisions.map((provision) => ({
          kind: provision.kind,
          number: provision.number,
          label: provision.label,
          title: provision.title,
          path: provision.path,
        })),
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
  const provisionIntent = parseProvisionIntent(normalizedQuery);
  const incompleteProvisionIntent =
    parseIncompleteProvisionIntent(normalizedQuery);
  const lawQuery =
    provisionIntent?.lawQuery ??
    incompleteProvisionIntent?.lawQuery ??
    normalizedQuery;
  const results = normalizedQuery
    ? records
        .flatMap((record) => {
          const rank = rankRecord(record, lawQuery);
          if (!rank) return [];
          if (!provisionIntent) return [toResult(record, rank)];
          const provision = record.provisions.find(
            (candidate) =>
              candidate.kind === provisionIntent.kind &&
              normalizeLawQuery(candidate.number) === provisionIntent.number,
          );
          return provision
            ? [
                toResult(record, rank, {
                  kind: provision.kind,
                  number: provision.number,
                  label: provision.label,
                  title: provision.title,
                  path: provision.path,
                }),
              ]
            : [];
        })
        .sort(
          (left, right) =>
            right.score - left.score ||
            left.shortName.localeCompare(right.shortName),
        )
    : records
        .map(
          (record): LawSearchResult =>
            toResult(record, { matchReason: "catalog", score: 0 }),
        )
        .sort((left, right) => left.shortName.localeCompare(right.shortName));

  return {
    query,
    normalizedQuery,
    bestMatch: normalizedQuery ? results[0] : undefined,
    results,
  };
}
