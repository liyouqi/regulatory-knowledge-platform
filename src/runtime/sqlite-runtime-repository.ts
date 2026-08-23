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
  type ProvisionRelationship,
  type ProvisionRelationshipsResponse,
  type RelationshipPreview,
  documentViewSchema,
  explorerDocumentSchema,
  provisionRelationshipsResponseSchema,
  relationshipPreviewSchema,
} from "../shared/legal";

type LawSearchSource = Pick<
  SourceDefinition,
  "celex" | "familyId" | "aliases" | "regulatoryLevel" | "measureType"
>;

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
  regulatoryLevel: LawSearchSource["regulatoryLevel"];
  measureType: LawSearchSource["measureType"];
  alias: string | null;
}

interface RelationshipRow {
  id: string;
  relationType: ProvisionRelationship["relationType"];
  provenance: ProvisionRelationship["provenance"];
  evidenceText: string;
  evidenceLocator: string;
  sourceRef: string;
  builderMethod: string;
  builderVersion: string;
  resolutionStatus: "resolved";
  sourceEntityId: string;
  sourceDocumentId: string;
  sourceDocumentShortName: string;
  sourceProvisionId: string | null;
  sourceKind: string;
  sourceLabel: string;
  sourceTitle: string | null;
  sourcePath: string;
  targetEntityId: string;
  targetDocumentId: string;
  targetDocumentShortName: string;
  targetProvisionId: string | null;
  targetKind: string;
  targetLabel: string;
  targetTitle: string | null;
  targetPath: string;
}

interface EntityPreviewRow {
  entityId: string;
  documentId: string;
  rootProvisionId: string | null;
  kind: string;
  label: string;
  title: string | null;
  path: string;
  documentShortName: string;
  sourceUrl: string;
}

const RELATIONSHIP_SELECT = `
  SELECT
    r.relationship_id AS id,
    r.relation_type AS relationType,
    r.provenance,
    r.evidence_text AS evidenceText,
    r.evidence_locator AS evidenceLocator,
    r.source_ref AS sourceRef,
    r.builder_method AS builderMethod,
    r.builder_version AS builderVersion,
    r.resolution_status AS resolutionStatus,
    se.id AS sourceEntityId,
    sd.id AS sourceDocumentId,
    sd.short_name AS sourceDocumentShortName,
    CASE WHEN se.kind = 'document' THEN NULL
      ELSE COALESCE(se.root_provision_id, se.id) END AS sourceProvisionId,
    COALESCE(sr.kind, se.kind) AS sourceKind,
    COALESCE(sr.label, se.label) AS sourceLabel,
    COALESCE(sr.title, se.title) AS sourceTitle,
    se.path AS sourcePath,
    te.id AS targetEntityId,
    td.id AS targetDocumentId,
    td.short_name AS targetDocumentShortName,
    CASE WHEN te.kind = 'document' THEN NULL
      ELSE COALESCE(te.root_provision_id, te.id) END AS targetProvisionId,
    te.kind AS targetKind,
    te.label AS targetLabel,
    te.title AS targetTitle,
    te.path AS targetPath
  FROM relationships r
  JOIN legal_entities se ON se.id = r.source_entity_id
  JOIN documents sd ON sd.id = se.document_id
  LEFT JOIN legal_entities sr ON sr.id = se.root_provision_id
  JOIN legal_entities te ON te.id = r.target_entity_id
  JOIN documents td ON td.id = te.document_id
`;

function toProvisionRelationship(
  row: RelationshipRow,
  relationType = row.relationType,
): ProvisionRelationship {
  return {
    id: row.id,
    relationType,
    provenance: row.provenance,
    source: {
      entityId: row.sourceEntityId,
      documentId: row.sourceDocumentId,
      documentShortName: row.sourceDocumentShortName,
      provisionId: row.sourceProvisionId ?? undefined,
      kind: row.sourceKind,
      label: row.sourceLabel,
      title: row.sourceTitle,
      path: row.sourcePath,
    },
    target: {
      entityId: row.targetEntityId,
      documentId: row.targetDocumentId,
      documentShortName: row.targetDocumentShortName,
      provisionId: row.targetProvisionId ?? undefined,
      kind: row.targetKind,
      label: row.targetLabel,
      title: row.targetTitle,
      path: row.targetPath,
    },
    evidence: {
      text: row.evidenceText,
      locator: row.evidenceLocator,
      sourceUrl: row.sourceRef,
    },
    builder: {
      method: row.builderMethod,
      version: row.builderVersion,
    },
    resolutionStatus: row.resolutionStatus,
  };
}

function firstExcerpt(
  blocks: DocumentView["provisions"][number]["blocks"],
): string | undefined {
  for (const block of blocks) {
    if (block.text.trim()) return block.text.trim();
    const nested = firstExcerpt(block.children);
    if (nested) return nested;
  }
  return undefined;
}

function blockExcerpt(
  blocks: DocumentView["provisions"][number]["blocks"],
  entityId: string,
): string | undefined {
  for (const block of blocks) {
    if (block.id === entityId && block.text.trim()) return block.text.trim();
    const nested = blockExcerpt(block.children, entityId);
    if (nested) return nested;
  }
  return undefined;
}

function truncateExcerpt(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.length <= 560 ? value : `${value.slice(0, 557).trimEnd()}…`;
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
  readonly relationshipCount: number;
  readonly unresolvedReferenceCount: number;
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
      this.relationshipCount = Number.parseInt(
        manifestValue(this.database, "relationshipCount"),
        10,
      );
      this.unresolvedReferenceCount = Number.parseInt(
        manifestValue(this.database, "unresolvedReferenceCount"),
        10,
      );
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
          provenance,
          family_id AS familyId,
          regulatory_level AS regulatoryLevel,
          measure_type AS measureType
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
          d.regulatory_level AS regulatoryLevel,
          d.measure_type AS measureType,
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
        regulatoryLevel: row.regulatoryLevel,
        measureType: row.measureType,
        aliases: [],
      };
      if (row.alias) source.aliases.push(row.alias);
      sources.set(row.documentId, source);
    }
    return [...sources.values()];
  }

  findProvisionRelationships(
    documentId: string,
    provisionId: string,
  ): ProvisionRelationshipsResponse | null {
    const provision = this.database
      .prepare(
        `SELECT id FROM legal_entities
         WHERE id = ? AND document_id = ? AND kind != 'document'`,
      )
      .get(provisionId, documentId);
    if (!provision) return null;

    const outgoing = this.database
      .prepare(`
        ${RELATIONSHIP_SELECT}
        WHERE (
          se.document_id = @documentId
          AND (se.id = @provisionId OR se.root_provision_id = @provisionId)
        ) OR se.id = @documentId
        ORDER BY td.display_order ASC, targetPath ASC, sourcePath ASC, id ASC
      `)
      .all({ documentId, provisionId }) as RelationshipRow[];
    const citedBy = this.database
      .prepare(`
        ${RELATIONSHIP_SELECT}
        WHERE r.relation_type = 'REFERENCES'
          AND te.document_id = @documentId
          AND (te.id = @provisionId OR te.root_provision_id = @provisionId)
        ORDER BY sd.display_order ASC, sourcePath ASC, id ASC
      `)
      .all({ documentId, provisionId }) as RelationshipRow[];

    return provisionRelationshipsResponseSchema.parse({
      documentId,
      provisionId,
      buildId: this.buildId,
      references: outgoing
        .filter((row) => row.relationType === "REFERENCES")
        .map((row) => toProvisionRelationship(row)),
      citedBy: citedBy.map((row) => toProvisionRelationship(row, "CITED_BY")),
      mandates: outgoing
        .filter((row) => row.relationType === "MANDATES")
        .map((row) => toProvisionRelationship(row)),
      adoptedUnder: outgoing
        .filter((row) => row.relationType === "ADOPTED_UNDER")
        .map((row) => toProvisionRelationship(row)),
      supplements: outgoing
        .filter((row) => row.relationType === "SUPPLEMENTS")
        .map((row) => toProvisionRelationship(row)),
      relatedDocuments: outgoing
        .filter((row) => row.relationType === "RELATED_DOCUMENT")
        .map((row) => toProvisionRelationship(row)),
      relatedRecitals: outgoing
        .filter((row) => row.relationType === "RELATED_RECITAL")
        .map((row) => toProvisionRelationship(row)),
    });
  }

  findRelationshipPreview(entityId: string): RelationshipPreview | null {
    const entity = this.database
      .prepare(`
        SELECT
          e.id AS entityId,
          e.document_id AS documentId,
          e.root_provision_id AS rootProvisionId,
          e.kind,
          e.label,
          e.title,
          e.path,
          d.short_name AS documentShortName,
          d.source_url AS sourceUrl
        FROM legal_entities e
        JOIN documents d ON d.id = e.document_id
        WHERE e.id = ?
      `)
      .get(entityId) as EntityPreviewRow | undefined;
    if (!entity) return null;

    let excerpt: string | undefined;
    if (entity.kind !== "document") {
      const document = this.findDocument(entity.documentId);
      const rootProvisionId = entity.rootProvisionId ?? entity.entityId;
      const provision = document?.provisions.find(
        (candidate) => candidate.id === rootProvisionId,
      );
      if (provision) {
        excerpt =
          blockExcerpt(provision.blocks, entity.entityId) ??
          firstExcerpt(provision.blocks);
      }
    }

    return relationshipPreviewSchema.parse({
      entityId: entity.entityId,
      documentId: entity.documentId,
      documentShortName: entity.documentShortName,
      label: entity.label,
      title: entity.title,
      path: entity.path,
      sourceUrl: entity.sourceUrl,
      excerpt: truncateExcerpt(excerpt),
    });
  }

  close(): void {
    this.database.close();
  }
}
