import type { BodyBlock, DocumentView, ProvisionView } from "../shared/legal";

export interface CurrentDocumentSearchRecord {
  id: string;
  provisionId: string;
  kind: ProvisionView["kind"];
  label: string;
  title?: string;
  marker?: string;
  path: string;
  text: string;
  normalizedText: string;
  tokens: string[];
  scope: "heading" | "body";
}

export interface CurrentDocumentSearchIndex {
  schemaVersion: "1.0.0";
  documentId: string;
  buildId: string;
  records: CurrentDocumentSearchRecord[];
  postings: Record<string, number[]>;
}

export interface CurrentDocumentSearchResult {
  id: string;
  provisionId: string;
  kind: ProvisionView["kind"];
  label: string;
  title?: string;
  marker?: string;
  path: string;
  snippet: string;
  highlights: string[];
  score: number;
  scope: "heading" | "body";
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[’']/gu, "")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function tokens(value: string): string[] {
  return normalizeSearchText(value).split(" ").filter(Boolean);
}

function record(
  input: Omit<CurrentDocumentSearchRecord, "normalizedText" | "tokens">,
): CurrentDocumentSearchRecord {
  return {
    ...input,
    normalizedText: normalizeSearchText(input.text),
    tokens: tokens(input.text),
  };
}

function blockRecords(
  provision: ProvisionView,
  blocks: BodyBlock[],
): CurrentDocumentSearchRecord[] {
  return blocks.flatMap((block) => {
    const current = block.text.trim()
      ? [
          record({
            id: block.id,
            provisionId: provision.id,
            kind: provision.kind,
            label: provision.label,
            title: provision.title,
            marker: block.marker,
            path: `${provision.path}#${block.anchor}`,
            text: block.text,
            scope: "body",
          }),
        ]
      : [];
    return [...current, ...blockRecords(provision, block.children)];
  });
}

export function buildCurrentDocumentSearchIndex(
  document: DocumentView,
): CurrentDocumentSearchIndex {
  const records = document.provisions.flatMap((provision) => {
    const headingText = [provision.label, provision.title]
      .filter(Boolean)
      .join(" ");
    return [
      record({
        id: `${provision.id}:heading`,
        provisionId: provision.id,
        kind: provision.kind,
        label: provision.label,
        title: provision.title,
        path: provision.path,
        text: headingText,
        scope: "heading",
      }),
      ...blockRecords(provision, provision.blocks),
    ];
  });
  const postings: Record<string, number[]> = Object.create(null);
  records.forEach((candidate, recordIndex) => {
    for (const token of new Set(candidate.tokens)) {
      const tokenPostings = postings[token] ?? [];
      tokenPostings.push(recordIndex);
      postings[token] = tokenPostings;
    }
  });
  return {
    schemaVersion: "1.0.0",
    documentId: document.id,
    buildId: document.buildId,
    records,
    postings,
  };
}

interface ParsedQuery {
  phrases: string[];
  terms: string[];
}

export function parseCurrentDocumentQuery(rawQuery: string): ParsedQuery {
  const query = rawQuery.slice(0, 200);
  const phrases = [...query.matchAll(/"([^"]+)"/gu)]
    .map((match) => normalizeSearchText(match[1]))
    .filter(Boolean)
    .slice(0, 3);
  const withoutPhrases = query.replace(/"[^"]+"/gu, " ");
  return {
    phrases,
    terms: tokens(withoutPhrases).slice(0, 8),
  };
}

function snippet(text: string, needles: string[]): string {
  const lower = text.toLowerCase();
  const positions = needles
    .map((needle) => lower.indexOf(needle.toLowerCase()))
    .filter((position) => position >= 0);
  const first = positions.length > 0 ? Math.min(...positions) : 0;
  const roughStart = Math.max(0, first - 70);
  const startBoundary = roughStart > 0 ? text.indexOf(" ", roughStart) : 0;
  const start = startBoundary >= 0 ? startBoundary : roughStart;
  const roughEnd = Math.min(text.length, Math.max(first + 150, start + 190));
  const endBoundary =
    roughEnd < text.length ? text.lastIndexOf(" ", roughEnd) : text.length;
  const end = endBoundary > start ? endBoundary : roughEnd;
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${
    end < text.length ? "…" : ""
  }`;
}

function scoreRecord(record: CurrentDocumentSearchRecord, query: ParsedQuery) {
  if (
    !query.phrases.every((phrase) => record.normalizedText.includes(phrase)) ||
    !query.terms.every((term) =>
      record.tokens.some((token) => token.startsWith(term)),
    )
  ) {
    return null;
  }
  const exactTerms = query.terms.filter((term) => record.tokens.includes(term));
  return (
    (record.scope === "heading" ? 100 : 0) +
    query.phrases.length * 200 +
    exactTerms.length * 10 +
    (query.terms.length - exactTerms.length) * 5
  );
}

function candidateRecordIndexes(
  index: CurrentDocumentSearchIndex,
  terms: string[],
): number[] {
  if (terms.length === 0)
    return index.records.map((_, recordIndex) => recordIndex);
  const vocabulary = Object.keys(index.postings);
  let candidates: Set<number> | null = null;
  for (const term of terms) {
    const matches = new Set(
      vocabulary
        .filter((token) => token.startsWith(term))
        .flatMap((token) => index.postings[token]),
    );
    if (candidates === null) {
      candidates = matches;
    } else {
      const intersection = new Set<number>();
      for (const recordIndex of candidates) {
        if (matches.has(recordIndex)) intersection.add(recordIndex);
      }
      candidates = intersection;
    }
    if (candidates.size === 0) break;
  }
  return [...(candidates ?? [])].sort((left, right) => left - right);
}

export function searchCurrentDocument(
  index: CurrentDocumentSearchIndex,
  rawQuery: string,
  limit = 12,
): CurrentDocumentSearchResult[] {
  const query = parseCurrentDocumentQuery(rawQuery);
  if (query.phrases.length === 0 && query.terms.length === 0) return [];
  const highlights = [...query.phrases, ...query.terms].sort(
    (left, right) => right.length - left.length,
  );
  return candidateRecordIndexes(index, query.terms)
    .map((recordIndex) => index.records[recordIndex])
    .flatMap((candidate) => {
      const score = scoreRecord(candidate, query);
      return score === null
        ? []
        : [
            {
              id: candidate.id,
              provisionId: candidate.provisionId,
              kind: candidate.kind,
              label: candidate.label,
              title: candidate.title,
              marker: candidate.marker,
              path: candidate.path,
              snippet: snippet(candidate.text, highlights),
              highlights,
              score,
              scope: candidate.scope,
            },
          ];
    })
    .sort(
      (left, right) =>
        right.score - left.score || left.path.localeCompare(right.path),
    )
    .slice(0, Math.max(1, Math.min(limit, 50)));
}
