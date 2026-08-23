import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import type { BodyBlock, DocumentView, ProvisionView } from "../shared/legal";

export const SEARCH_INDEX_SCHEMA_VERSION = "1.0.0";
export const DEFAULT_SEARCH_INDEX_PATH = resolve(
  process.cwd(),
  "data/artifacts/search/global-search.sqlite",
);

export interface SearchIndexManifest {
  schemaVersion: typeof SEARCH_INDEX_SCHEMA_VERSION;
  buildId: string;
  builtAt: string;
  documentCount: number;
  recordCount: number;
  documentBuilds: Array<{ documentId: string; buildId: string }>;
  outputPath: string;
  byteCount: number;
}

interface IndexRow {
  recordId: string;
  provisionId: string;
  documentId: string;
  kind: ProvisionView["kind"];
  label: string;
  title: string | null;
  marker: string | null;
  path: string;
  heading: string;
  body: string;
  scope: "heading" | "body";
}

function blockRows(
  document: DocumentView,
  provision: ProvisionView,
  blocks: BodyBlock[],
): IndexRow[] {
  return blocks.flatMap((block) => {
    const current: IndexRow[] = block.text.trim()
      ? [
          {
            recordId: block.id,
            provisionId: provision.id,
            documentId: document.id,
            kind: provision.kind,
            label: provision.label,
            title: provision.title ?? null,
            marker: block.marker ?? null,
            path: `${provision.path}#${block.anchor}`,
            heading: [provision.label, provision.title]
              .filter(Boolean)
              .join(" "),
            body: block.text,
            scope: "body",
          },
        ]
      : [];
    return [...current, ...blockRows(document, provision, block.children)];
  });
}

function indexRows(documents: DocumentView[]): IndexRow[] {
  return documents.flatMap((document) =>
    document.provisions.flatMap((provision) => [
      {
        recordId: `${provision.id}:heading`,
        provisionId: provision.id,
        documentId: document.id,
        kind: provision.kind,
        label: provision.label,
        title: provision.title ?? null,
        marker: null,
        path: provision.path,
        heading: [provision.label, provision.title].filter(Boolean).join(" "),
        body: "",
        scope: "heading" as const,
      },
      ...blockRows(document, provision, provision.blocks),
    ]),
  );
}

function searchBuildId(documents: DocumentView[]): string {
  const input = documents
    .map((document) => `${document.id}@${document.buildId}`)
    .sort()
    .join("\n");
  const hash = createHash("sha256")
    .update(`${SEARCH_INDEX_SCHEMA_VERSION}\n${input}`)
    .digest("hex")
    .slice(0, 16);
  return `search-${SEARCH_INDEX_SCHEMA_VERSION}-${hash}`;
}

export function assertFts5(database: Database.Database): void {
  database.exec(
    "CREATE VIRTUAL TABLE temp.fts5_probe USING fts5(body, tokenize='unicode61 remove_diacritics 2')",
  );
  database.prepare("INSERT INTO fts5_probe(body) VALUES (?)").run("probe text");
  const result = database
    .prepare(
      "SELECT count(*) AS count FROM fts5_probe WHERE fts5_probe MATCH ?",
    )
    .get("probe") as { count: number };
  database.exec("DROP TABLE fts5_probe");
  if (result.count !== 1)
    throw new Error("SQLite FTS5 capability check failed");
}

export function buildSearchIndex(
  documents: DocumentView[],
  outputPath = DEFAULT_SEARCH_INDEX_PATH,
): SearchIndexManifest {
  if (documents.length === 0)
    throw new Error("Cannot build an empty search index");
  const resolvedOutput = resolve(outputPath);
  mkdirSync(dirname(resolvedOutput), { recursive: true });
  const temporaryPath = `${resolvedOutput}.${process.pid}.tmp`;
  if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  const database = new Database(temporaryPath);
  const rows = indexRows(documents);
  const buildId = searchBuildId(documents);
  const builtAt = new Date().toISOString();
  let completed = false;

  try {
    database.pragma("journal_mode = OFF");
    database.pragma("synchronous = OFF");
    assertFts5(database);
    database.exec(`
      CREATE TABLE build_manifest (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      ) STRICT;
      CREATE TABLE documents (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        celex TEXT NOT NULL UNIQUE,
        short_name TEXT NOT NULL,
        official_title TEXT NOT NULL,
        document_type TEXT NOT NULL,
        publication_date TEXT NOT NULL,
        source_version TEXT NOT NULL,
        build_id TEXT NOT NULL
      ) STRICT;
      CREATE TABLE provisions (
        rowid INTEGER PRIMARY KEY,
        record_id TEXT NOT NULL UNIQUE,
        provision_id TEXT NOT NULL,
        document_id TEXT NOT NULL REFERENCES documents(id),
        kind TEXT NOT NULL,
        label TEXT NOT NULL,
        title TEXT,
        marker TEXT,
        path TEXT NOT NULL,
        heading TEXT NOT NULL,
        body TEXT NOT NULL,
        scope TEXT NOT NULL CHECK (scope IN ('heading', 'body'))
      ) STRICT;
      CREATE INDEX provisions_document_id ON provisions(document_id);
      CREATE INDEX provisions_provision_id ON provisions(provision_id);
      CREATE VIRTUAL TABLE provisions_fts USING fts5(
        heading,
        body,
        content='provisions',
        content_rowid='rowid',
        tokenize='unicode61 remove_diacritics 2',
        prefix='2 3 4'
      );
    `);

    const insertDocument = database.prepare(`
      INSERT INTO documents (
        id, slug, celex, short_name, official_title, document_type,
        publication_date, source_version, build_id
      ) VALUES (
        @id, @slug, @celex, @shortName, @officialTitle, @documentType,
        @publicationDate, @sourceVersion, @buildId
      )
    `);
    const insertProvision = database.prepare(`
      INSERT INTO provisions (
        record_id, provision_id, document_id, kind, label, title, marker,
        path, heading, body, scope
      ) VALUES (
        @recordId, @provisionId, @documentId, @kind, @label, @title, @marker,
        @path, @heading, @body, @scope
      )
    `);
    const insertFts = database.prepare(
      "INSERT INTO provisions_fts(rowid, heading, body) VALUES (?, ?, ?)",
    );
    const insertManifest = database.prepare(
      "INSERT INTO build_manifest(key, value) VALUES (?, ?)",
    );
    const populate = database.transaction(() => {
      for (const document of documents) {
        insertDocument.run({
          id: document.id,
          slug: document.slug,
          celex: document.celex,
          shortName: document.shortName,
          officialTitle: document.officialTitle,
          documentType: document.documentType,
          publicationDate: document.asOf,
          sourceVersion: document.sourceVersion,
          buildId: document.buildId,
        });
      }
      for (const row of rows) {
        const result = insertProvision.run(row);
        insertFts.run(result.lastInsertRowid, row.heading, row.body);
      }
      const manifestEntries = {
        schemaVersion: SEARCH_INDEX_SCHEMA_VERSION,
        buildId,
        builtAt,
        documentCount: String(documents.length),
        recordCount: String(rows.length),
        documentBuilds: JSON.stringify(
          documents.map((document) => ({
            documentId: document.id,
            buildId: document.buildId,
          })),
        ),
      };
      for (const [key, value] of Object.entries(manifestEntries)) {
        insertManifest.run(key, value);
      }
    });
    populate();
    database.exec(
      "INSERT INTO provisions_fts(provisions_fts) VALUES ('optimize')",
    );
    const integrity = database.pragma("integrity_check") as Array<{
      integrity_check: string;
    }>;
    if (
      integrity.length !== 1 ||
      integrity[0]?.integrity_check.toLowerCase() !== "ok"
    ) {
      throw new Error("Generated search index failed SQLite integrity_check");
    }
    completed = true;
  } finally {
    database.close();
    if (!completed && existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }

  try {
    renameSync(temporaryPath, resolvedOutput);
  } catch (error) {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
    throw error;
  }
  return {
    schemaVersion: SEARCH_INDEX_SCHEMA_VERSION,
    buildId,
    builtAt,
    documentCount: documents.length,
    recordCount: rows.length,
    documentBuilds: documents.map((document) => ({
      documentId: document.id,
      buildId: document.buildId,
    })),
    outputPath: resolvedOutput,
    byteCount: statSync(resolvedOutput).size,
  };
}
