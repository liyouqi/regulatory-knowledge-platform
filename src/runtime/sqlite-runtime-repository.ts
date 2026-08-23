import { existsSync } from "node:fs";
import { resolve } from "node:path";
import Database from "better-sqlite3";
import type { SourceDefinition } from "../ingestion/source-registry";
import {
  DEFAULT_RUNTIME_DATABASE_PATH,
  RUNTIME_DATABASE_SCHEMA_VERSION,
} from "../search/sqlite-search-index";
import {
  type DocumentSummary,
  type DocumentView,
  type ExplorerDocument,
  documentViewSchema,
  explorerDocumentSchema,
} from "../shared/legal";

type LawSearchSource = Pick<SourceDefinition, "celex" | "familyId" | "aliases">;

interface DocumentPayloadRow {
  readerPayload: string;
}

interface ExplorerPayloadRow {
  explorerPayload: string;
}

interface LawSourceRow {
  documentId: string;
  celex: string;
  familyId: string;
  alias: string | null;
}

function manifestValue(database: Database.Database, key: string): string {
  const row = database
    .prepare("SELECT value FROM build_manifest WHERE key = ?")
    .get(key) as { value?: string } | undefined;
  if (!row?.value)
    throw new Error(`Runtime database manifest is missing ${key}`);
  return row.value;
}

export class SqliteRuntimeRepository {
  readonly buildId: string;
  private readonly database: Database.Database;

  constructor(databasePath = DEFAULT_RUNTIME_DATABASE_PATH) {
    const resolvedPath = resolve(databasePath);
    if (!existsSync(resolvedPath)) {
      throw new Error(`Runtime database does not exist: ${resolvedPath}`);
    }
    this.database = new Database(resolvedPath, {
      readonly: true,
      fileMustExist: true,
    });
    try {
      this.database.pragma("query_only = ON");
      const schemaVersion = manifestValue(this.database, "schemaVersion");
      if (schemaVersion !== RUNTIME_DATABASE_SCHEMA_VERSION) {
        throw new Error(
          `Unsupported runtime database schema ${schemaVersion}; expected ${RUNTIME_DATABASE_SCHEMA_VERSION}`,
        );
      }
      this.buildId = manifestValue(this.database, "buildId");
      this.database
        .prepare("SELECT reader_payload_json FROM document_views LIMIT 1")
        .get();
    } catch (error) {
      this.database.close();
      throw error;
    }
  }

  listDocumentSummaries(): DocumentSummary[] {
    return this.database
      .prepare(`
        SELECT
          id,
          slug,
          short_name AS shortName,
          official_title AS officialTitle,
          default_path AS defaultPath,
          provenance
        FROM documents
        ORDER BY display_order ASC
      `)
      .all() as DocumentSummary[];
  }

  listDocumentViews(): DocumentView[] {
    const rows = this.database
      .prepare(`
        SELECT dv.reader_payload_json AS readerPayload
        FROM document_views dv
        JOIN documents d ON d.id = dv.document_id
        ORDER BY d.display_order ASC
      `)
      .all() as DocumentPayloadRow[];
    return rows.map((row) =>
      documentViewSchema.parse(JSON.parse(row.readerPayload)),
    );
  }

  findDocument(documentId: string): DocumentView | null {
    const row = this.database
      .prepare(`
        SELECT reader_payload_json AS readerPayload
        FROM document_views
        WHERE document_id = ?
      `)
      .get(documentId) as DocumentPayloadRow | undefined;
    return row ? documentViewSchema.parse(JSON.parse(row.readerPayload)) : null;
  }

  findDocumentBySlug(slug: string): DocumentView | null {
    const row = this.database
      .prepare(`
        SELECT dv.reader_payload_json AS readerPayload
        FROM document_views dv
        JOIN documents d ON d.id = dv.document_id
        WHERE d.slug = ?
      `)
      .get(slug) as DocumentPayloadRow | undefined;
    return row ? documentViewSchema.parse(JSON.parse(row.readerPayload)) : null;
  }

  findExplorerBySlug(slug: string): ExplorerDocument | null {
    const row = this.database
      .prepare(`
        SELECT dv.explorer_payload_json AS explorerPayload
        FROM document_views dv
        JOIN documents d ON d.id = dv.document_id
        WHERE d.slug = ?
      `)
      .get(slug) as ExplorerPayloadRow | undefined;
    return row
      ? explorerDocumentSchema.parse(JSON.parse(row.explorerPayload))
      : null;
  }

  listLawSearchSources(): LawSearchSource[] {
    const rows = this.database
      .prepare(`
        SELECT
          d.id AS documentId,
          d.celex AS celex,
          d.family_id AS familyId,
          da.alias AS alias
        FROM documents d
        LEFT JOIN document_aliases da ON da.document_id = d.id
        ORDER BY d.id ASC, da.display_order ASC
      `)
      .all() as LawSourceRow[];
    const sources = new Map<string, LawSearchSource>();
    for (const row of rows) {
      const source = sources.get(row.documentId) ?? {
        celex: row.celex,
        familyId: row.familyId,
        aliases: [],
      };
      if (row.alias) source.aliases.push(row.alias);
      sources.set(row.documentId, source);
    }
    return [...sources.values()];
  }

  close(): void {
    this.database.close();
  }
}
