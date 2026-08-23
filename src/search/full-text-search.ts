import { existsSync } from "node:fs";
import { resolve } from "node:path";
import Database from "better-sqlite3";
import type {
  DefinitionSearchResponse,
  DefinitionSearchResult,
  FullTextSearchResponse,
  FullTextSearchResult,
  SearchSnippetSegment,
} from "../shared/legal";
import { normalizeSearchText } from "./current-document-search";
import {
  DEFAULT_SEARCH_INDEX_PATH,
  SEARCH_INDEX_SCHEMA_VERSION,
} from "./sqlite-search-index";

interface ParsedFullTextQuery {
  normalizedQuery: string;
  matchExpression: string;
}

interface SearchRow {
  id: string;
  documentId: string;
  slug: string;
  shortName: string;
  celex: string;
  provisionId: string;
  kind: FullTextSearchResult["kind"];
  label: string;
  title: string | null;
  marker: string | null;
  path: string;
  markedSnippet: string;
  rank: number;
}

interface DefinitionRow {
  id: string;
  documentId: string;
  jurisdiction: DefinitionSearchResult["jurisdiction"];
  slug: string;
  shortName: string;
  celex: string;
  term: string;
  normalizedTerm: string;
  definitionText: string;
  definitionType: DefinitionSearchResult["definitionType"];
  provisionId: string;
  label: string;
  title: string | null;
  marker: string | null;
  path: string;
}

const START_HIGHLIGHT = "\u0001";
const END_HIGHLIGHT = "\u0002";

export function parseFullTextQuery(
  rawQuery: string,
): ParsedFullTextQuery | null {
  const query = rawQuery.slice(0, 200);
  const rawPhrases = [...query.matchAll(/"([^"]+)"/gu)].map(
    (match) => match[1],
  );
  const phraseTokens = rawPhrases
    .map((phrase) => normalizeSearchText(phrase).split(" ").filter(Boolean))
    .filter((phrase) => phrase.length > 0)
    .slice(0, 3);
  const withoutPhrases = query.replace(/"[^"]+"/gu, " ");
  const terms = normalizeSearchText(withoutPhrases)
    .split(" ")
    .filter((term) => term.length >= 2)
    .slice(0, 8);
  const tokenCount =
    terms.length +
    phraseTokens.reduce((count, phrase) => count + phrase.length, 0);
  if (tokenCount === 0 || tokenCount > 16) return null;
  const parts = [
    ...phraseTokens.map((phrase) => `"${phrase.join(" ")}"`),
    ...terms.map((term) => `"${term}"*`),
  ];
  return {
    normalizedQuery: [
      ...phraseTokens.map((phrase) => `"${phrase.join(" ")}"`),
      ...terms,
    ].join(" "),
    matchExpression: parts.join(" AND "),
  };
}

export function parseMarkedSnippet(value: string): SearchSnippetSegment[] {
  const segments: SearchSnippetSegment[] = [];
  let highlighted = false;
  let buffer = "";
  const flush = () => {
    if (!buffer) return;
    segments.push({ text: buffer, highlighted });
    buffer = "";
  };
  for (const character of value) {
    if (character === START_HIGHLIGHT) {
      flush();
      highlighted = true;
    } else if (character === END_HIGHLIGHT) {
      flush();
      highlighted = false;
    } else {
      buffer += character;
    }
  }
  flush();
  return segments.length > 0 ? segments : [{ text: value, highlighted: false }];
}

export function parseDefinitionQuery(
  rawQuery: string,
): ParsedFullTextQuery | null {
  const query = rawQuery.trim().slice(0, 120);
  const quotedMatch = query.match(/^"([^"]+)"$/u);
  const normalizedQuery = normalizeSearchText(quotedMatch?.[1] ?? query);
  const terms = normalizedQuery.split(" ").filter(Boolean).slice(0, 6);
  if (terms.length === 0) return null;
  return {
    normalizedQuery,
    matchExpression: quotedMatch
      ? `term : "${terms.join(" ")}"`
      : `term : (${terms.map((term) => `"${term}"*`).join(" AND ")})`,
  };
}

function manifestValue(database: Database.Database, key: string): string {
  const row = database
    .prepare("SELECT value FROM build_manifest WHERE key = ?")
    .get(key) as { value?: string } | undefined;
  if (!row?.value) throw new Error(`Search index manifest is missing ${key}`);
  return row.value;
}

export class SearchService {
  readonly buildId: string;
  readonly definitionCount: number;
  readonly documentCount: number;
  readonly recordCount: number;
  private readonly database: Database.Database;

  constructor(indexPath = DEFAULT_SEARCH_INDEX_PATH) {
    const resolvedPath = resolve(indexPath);
    if (!existsSync(resolvedPath)) {
      throw new Error(`Search index does not exist: ${resolvedPath}`);
    }
    this.database = new Database(resolvedPath, {
      readonly: true,
      fileMustExist: true,
    });
    try {
      this.database.pragma("query_only = ON");
      const schemaVersion = manifestValue(this.database, "schemaVersion");
      if (schemaVersion !== SEARCH_INDEX_SCHEMA_VERSION) {
        throw new Error(
          `Unsupported search index schema ${schemaVersion}; expected ${SEARCH_INDEX_SCHEMA_VERSION}`,
        );
      }
      const integrity = this.database.pragma("integrity_check") as Array<{
        integrity_check: string;
      }>;
      if (
        integrity.length !== 1 ||
        integrity[0]?.integrity_check.toLowerCase() !== "ok"
      ) {
        throw new Error("Search index failed SQLite integrity_check");
      }
      this.database
        .prepare(
          "SELECT count(*) AS count FROM provisions_fts WHERE provisions_fts MATCH ?",
        )
        .get("__fts5_capability_probe__");
      this.database
        .prepare("SELECT definition_type FROM definitions LIMIT 1")
        .get();
      this.buildId = manifestValue(this.database, "buildId");
      this.documentCount = Number.parseInt(
        manifestValue(this.database, "documentCount"),
        10,
      );
      this.recordCount = Number.parseInt(
        manifestValue(this.database, "recordCount"),
        10,
      );
      this.definitionCount = Number.parseInt(
        manifestValue(this.database, "definitionCount"),
        10,
      );
      if (
        !Number.isSafeInteger(this.documentCount) ||
        this.documentCount < 1 ||
        !Number.isSafeInteger(this.recordCount) ||
        this.recordCount < 1 ||
        !Number.isSafeInteger(this.definitionCount) ||
        this.definitionCount < 0
      ) {
        throw new Error("Search index manifest has invalid corpus counts");
      }
    } catch (error) {
      this.database.close();
      throw error;
    }
  }

  search(
    rawQuery: string,
    options: { documentId?: string; limit?: number } = {},
  ): FullTextSearchResponse {
    const query = rawQuery.trim();
    const parsed = parseFullTextQuery(query);
    const limit = Math.max(1, Math.min(options.limit ?? 20, 50));
    if (!parsed) {
      return {
        query,
        normalizedQuery: "",
        scopeDocumentId: options.documentId,
        indexBuildId: this.buildId,
        results: [],
      };
    }
    const scopeClause = options.documentId
      ? "AND p.document_id = @documentId"
      : "";
    const rows = this.database
      .prepare(`
        SELECT
          p.record_id AS id,
          p.document_id AS documentId,
          d.slug AS slug,
          d.short_name AS shortName,
          d.celex AS celex,
          p.provision_id AS provisionId,
          p.kind AS kind,
          p.label AS label,
          p.title AS title,
          p.marker AS marker,
          p.path AS path,
          snippet(provisions_fts, -1, char(1), char(2), '…', 28) AS markedSnippet,
          bm25(provisions_fts, 5.0, 1.0) AS rank
        FROM provisions_fts
        JOIN provisions p ON p.rowid = provisions_fts.rowid
        JOIN documents d ON d.id = p.document_id
        WHERE provisions_fts MATCH @matchExpression
        ${scopeClause}
        ORDER BY rank ASC, p.document_id ASC, p.rowid ASC
        LIMIT @limit
      `)
      .all({
        matchExpression: parsed.matchExpression,
        documentId: options.documentId,
        limit,
      }) as SearchRow[];
    return {
      query,
      normalizedQuery: parsed.normalizedQuery,
      scopeDocumentId: options.documentId,
      indexBuildId: this.buildId,
      results: rows.map(
        (row): FullTextSearchResult => ({
          id: row.id,
          documentId: row.documentId,
          slug: row.slug,
          shortName: row.shortName,
          celex: row.celex,
          provisionId: row.provisionId,
          kind: row.kind,
          label: row.label,
          title: row.title ?? undefined,
          marker: row.marker ?? undefined,
          path: row.path,
          snippet: parseMarkedSnippet(row.markedSnippet),
        }),
      ),
    };
  }

  searchDefinitions(rawQuery: string, limit = 20): DefinitionSearchResponse {
    const query = rawQuery.trim();
    const parsed = parseDefinitionQuery(query);
    const boundedLimit = Math.max(1, Math.min(limit, 50));
    if (!parsed) {
      return {
        query,
        normalizedQuery: "",
        indexBuildId: this.buildId,
        results: [],
      };
    }
    const rows = this.database
      .prepare(`
        SELECT
          df.definition_id AS id,
          df.document_id AS documentId,
          d.jurisdiction AS jurisdiction,
          d.slug AS slug,
          d.short_name AS shortName,
          d.celex AS celex,
          df.term AS term,
          df.normalized_term AS normalizedTerm,
          df.definition_text AS definitionText,
          df.definition_type AS definitionType,
          df.provision_id AS provisionId,
          df.label AS label,
          df.title AS title,
          df.marker AS marker,
          df.path AS path
        FROM definitions_fts
        JOIN definitions df ON df.rowid = definitions_fts.rowid
        JOIN documents d ON d.id = df.document_id
        WHERE definitions_fts MATCH @matchExpression
        ORDER BY
          CASE
            WHEN df.normalized_term = @normalizedQuery THEN 0
            WHEN df.normalized_term LIKE @termPrefix THEN 1
            ELSE 2
          END ASC,
          CASE df.definition_type WHEN 'direct' THEN 0 ELSE 1 END ASC,
          bm25(definitions_fts, 8.0, 0.2) ASC,
          df.document_id ASC,
          df.rowid ASC
        LIMIT @limit
      `)
      .all({
        matchExpression: parsed.matchExpression,
        normalizedQuery: parsed.normalizedQuery,
        termPrefix: `${parsed.normalizedQuery}%`,
        limit: boundedLimit,
      }) as DefinitionRow[];
    return {
      query,
      normalizedQuery: parsed.normalizedQuery,
      indexBuildId: this.buildId,
      results: rows.map(
        (row): DefinitionSearchResult => ({
          id: row.id,
          documentId: row.documentId,
          jurisdiction: row.jurisdiction,
          slug: row.slug,
          shortName: row.shortName,
          celex: row.celex,
          term: row.term,
          normalizedTerm: row.normalizedTerm,
          definitionText: row.definitionText,
          definitionType: row.definitionType,
          provisionId: row.provisionId,
          label: row.label,
          title: row.title ?? undefined,
          marker: row.marker ?? undefined,
          path: row.path,
        }),
      ),
    };
  }

  close(): void {
    this.database.close();
  }
}

export { SearchService as FullTextSearchService };
