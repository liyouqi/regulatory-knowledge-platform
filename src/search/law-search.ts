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

function hasEditDistanceAtMostOne(left: string, right: string): boolean {
  if (Math.abs(left.length - right.length) > 1) return false;
  let leftIndex = 0;
  let rightIndex = 0;
  let differences = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }
    differences += 1;
    if (differences > 1) return false;
    if (left.length > right.length) leftIndex += 1;
    else if (right.length > left.length) rightIndex += 1;
    else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }
  return true;
}

function editDistance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] +
          (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function typoDistanceLimit(term: string, candidate: string): number {
  const longest = Math.max(term.length, candidate.length);
  if (Math.min(term.length, candidate.length) < 4) return 0;
  return Math.min(3, Math.floor(longest * 0.34));
}

function normalizedAliases(record: LawSearchRecord): string[] {
  return [record.shortName, ...record.aliases].map(normalizeLawQuery);
}

function typoAliasRank(
  record: LawSearchRecord,
  query: string,
): Pick<LawSearchResult, "matchReason" | "score"> | null {
  if (!/^[a-z0-9]+$/u.test(query) || query.length < 4) return null;
  return normalizedAliases(record).some(
    (alias) =>
      /^[a-z0-9]+$/u.test(alias) &&
      alias.length >= 4 &&
      hasEditDistanceAtMostOne(query, alias),
  )
    ? { matchReason: "typo-alias", score: 450 }
    : null;
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

  const aliases = normalizedAliases(record);
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
  const hasExactTermMatch = (term: string, termIndex: number) =>
    haystackTerms.some(
      (candidate) =>
        candidate === term ||
        (/^[a-z]+$/u.test(term) &&
          candidate.startsWith(term) &&
          (term.length >= 3 ||
            (terms.length > 1 && termIndex === terms.length - 1))),
    );
  if (terms.length > 0 && terms.every(hasExactTermMatch)) {
    return { matchReason: "title-terms", score: 500 + terms.length };
  }
  let totalTypoDistance = 0;
  const hasTypoTerms =
    terms.length > 0 &&
    terms.every((term, termIndex) => {
      if (hasExactTermMatch(term, termIndex)) return true;
      if (!/^[a-z]+$/u.test(term)) return false;
      const bestDistance = haystackTerms.reduce((best, candidate) => {
        if (!/^[a-z]+$/u.test(candidate)) return best;
        const limit = typoDistanceLimit(term, candidate);
        if (limit === 0 || Math.abs(term.length - candidate.length) > limit) {
          return best;
        }
        const distance = editDistance(term, candidate);
        return distance <= limit ? Math.min(best, distance) : best;
      }, Number.POSITIVE_INFINITY);
      const accepted = Number.isFinite(bestDistance);
      if (accepted) totalTypoDistance += bestDistance;
      return accepted;
    });
  if (hasTypoTerms) {
    return {
      matchReason: "typo-alias",
      score: Math.max(400, 480 + terms.length - totalTypoDistance * 10),
    };
  }
  return typoAliasRank(record, query);
}

function rankLawAnchor(
  record: LawSearchRecord,
  lawQuery: string,
): Pick<LawSearchResult, "matchReason" | "score"> | null {
  const directRank = rankRecord(record, lawQuery);
  if (directRank) return directRank;
  const paddedQuery = ` ${lawQuery} `;
  return normalizedAliases(record).some((alias) =>
    paddedQuery.includes(` ${alias} `),
  )
    ? { matchReason: "law-anchor", score: 850 }
    : null;
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
          const rank = provisionIntent
            ? rankLawAnchor(record, lawQuery)
            : rankRecord(record, lawQuery);
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
