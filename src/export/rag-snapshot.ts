import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import Database from "better-sqlite3";
import { RUNTIME_DATABASE_SCHEMA_VERSION } from "../search/sqlite-search-index";
import { type BodyBlock, documentViewSchema } from "../shared/legal";
import { sourceStatusSchema } from "../shared/source-status";
import {
  RAG_SNAPSHOT_GENERATOR_VERSION,
  RAG_SNAPSHOT_SCHEMA_VERSION,
  type RagDocument,
  type RagProvision,
  type RagRelationship,
  type RagRelationshipEndpoint,
  type RagSnapshotManifest,
  ragDocumentSchema,
  ragProvisionSchema,
  ragRelationshipSchema,
  ragSnapshotManifestSchema,
} from "./rag-snapshot-contract";

const OUTPUT_FILES = [
  "documents.jsonl",
  "provisions.jsonl",
  "relationships.jsonl",
] as const;

interface ExportOptions {
  databasePath: string;
  outputPath: string;
  snapshotId: string;
  asOfDate: string;
  createdAt?: string;
}

interface DocumentRow {
  id: string;
  jurisdiction: "EU" | "LU";
  celex: string | null;
  localId: string | null;
  shortName: string;
  officialTitle: string;
  documentType: RagDocument["document_type"];
  publicationDate: string;
  sourceUrl: string;
  sourceStatusJson: string | null;
  lastChecked: string;
  sourceVersion: string;
  canonicalBuildId: string;
  provenance: "official" | "fixture";
  familyId: string;
  regulatoryLevel: "level-1" | "level-2" | "level-3";
  measureType: "primary-act" | "rts" | "its" | "guideline" | "qa" | "other";
  readerPayloadJson: string;
  issuersJson: string;
  textKind: RagDocument["expressions"][number]["text_kind"];
  currencyStatus: RagDocument["expressions"][number]["currency_status"];
  versionSelectionPolicy: RagDocument["expressions"][number]["version_selection_policy"];
  fallbackReason: RagDocument["expressions"][number]["fallback_reason"];
}

interface RelationshipRow {
  relationshipId: string;
  sourceEntityId: string;
  sourceDocumentId: string;
  sourceRootProvisionId: string | null;
  sourceKind: string;
  sourceLabel: string;
  sourceTitle: string | null;
  sourceUrl: string;
  targetEntityId: string;
  targetDocumentId: string;
  targetRootProvisionId: string | null;
  targetKind: string;
  targetLabel: string;
  targetTitle: string | null;
  targetUrl: string;
  targetMeasureType: string;
  relationType: string;
  provenance: string;
  evidenceText: string;
  evidenceLocator: string;
  evidenceSourceUrl: string;
  score: number | null;
  builderMethod: string;
  builderVersion: string;
  resolutionStatus: string;
}

function manifestValue(database: Database.Database, key: string): string {
  const row = database
    .prepare("SELECT value FROM build_manifest WHERE key = ?")
    .get(key) as { value?: string } | undefined;
  if (!row?.value) throw new Error(`Runtime manifest is missing ${key}`);
  return row.value;
}

function jsonLine(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

function sha256(value: string | Buffer): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function expressionId(document: RagDocument): string {
  return `${document.document_id}@${document.text_as_of}@en`;
}

function sourceLocatorLabel(locator: { kind: string; value: string }): string {
  return `${locator.kind}:${locator.value}`;
}

function blockText(block: BodyBlock): string {
  const children = new Map(block.children.map((child) => [child.id, child]));
  const content = block.orderedContent.map((item) => {
    if (item.type === "text") return item.text;
    const child = children.get(item.childId);
    if (!child) {
      throw new Error(
        `Body block ${block.id} references missing child ${item.childId}`,
      );
    }
    return blockText(child);
  });
  return [
    [block.marker, content[0]].filter(Boolean).join(" ").trim(),
    ...content.slice(1),
  ]
    .filter(Boolean)
    .join("\n");
}

function directBlockText(block: BodyBlock): string {
  return block.orderedContent
    .flatMap((item) => (item.type === "text" ? [item.text] : []))
    .join("\n");
}

function orderedContentBlocks(
  block: BodyBlock,
): RagProvision["ordered_content_blocks"] {
  return block.orderedContent.map((item, order) =>
    item.type === "text"
      ? { order, type: "text" as const, text: item.text }
      : { order, type: "child" as const, provision_id: item.childId },
  );
}

function blockReferences(id: string): {
  paragraphId: string | null;
  pointId: string | null;
} {
  const paragraph = id.match(/:paragraph:([^:]+)/u)?.[1] ?? null;
  const point = id.match(/:(?:point|subpoint):([^:]+)/u)?.[1] ?? null;
  return { paragraphId: paragraph, pointId: point };
}

function exportProvisions(
  document: RagDocument,
  readerPayloadJson: string,
): RagProvision[] {
  const view = documentViewSchema.parse(JSON.parse(readerPayloadJson));
  const result: RagProvision[] = [];
  const expression = expressionId(document);
  const reviewStatus = document.review_status;
  let documentOrder = 0;

  for (const provision of view.provisions) {
    const rootPath = [
      ...provision.breadcrumbs.map((item) =>
        [item.label, item.title].filter(Boolean).join(" — "),
      ),
      [provision.label, provision.title].filter(Boolean).join(" — "),
    ];
    const rootText = provision.blocks.map(blockText).filter(Boolean).join("\n");
    const selfBlock = provision.blocks.find(
      (block) => block.id === provision.id,
    );
    result.push(
      ragProvisionSchema.parse({
        provision_id: provision.id,
        document_id: document.document_id,
        expression_id: expression,
        language: "en",
        parent_provision_id: null,
        root_provision_id: provision.id,
        unit_type: provision.kind,
        article_id: provision.kind === "article" ? provision.number : null,
        paragraph_id: null,
        point_id: null,
        annex_id: provision.kind === "annex" ? provision.number : null,
        label: provision.label,
        marker: null,
        heading: provision.title ?? null,
        hierarchy_path: rootPath,
        source_locator: provision.sourceLocator,
        source_locator_label: sourceLocatorLabel(provision.sourceLocator),
        document_order: documentOrder++,
        ordered_content_blocks: selfBlock
          ? orderedContentBlocks(selfBlock)
          : provision.blocks.map((block, order) => ({
              order,
              type: "child" as const,
              provision_id: block.id,
            })),
        direct_text: selfBlock ? directBlockText(selfBlock) : "",
        text: rootText,
        text_scope: provision.blocks.some(
          (block) => block.id !== provision.id || block.children.length > 0,
        )
          ? "subtree"
          : "direct",
        official_source_url: document.official_page_url,
        review_status: reviewStatus,
      }),
    );

    const visit = (
      block: BodyBlock,
      parentId: string,
      hierarchy: string[],
    ): void => {
      const marker = block.marker ?? block.kind;
      const currentHierarchy = [...hierarchy, marker];
      const references = blockReferences(block.id);
      result.push(
        ragProvisionSchema.parse({
          provision_id: block.id,
          document_id: document.document_id,
          expression_id: expression,
          language: "en",
          parent_provision_id: parentId,
          root_provision_id: provision.id,
          unit_type: block.kind === "annex-part" ? "annex_part" : block.kind,
          article_id: provision.kind === "article" ? provision.number : null,
          paragraph_id: references.paragraphId,
          point_id: references.pointId,
          annex_id: provision.kind === "annex" ? provision.number : null,
          label: provision.label,
          marker: block.marker ?? null,
          heading: provision.title ?? null,
          hierarchy_path: currentHierarchy,
          source_locator: block.sourceLocator,
          source_locator_label: sourceLocatorLabel(block.sourceLocator),
          document_order: documentOrder++,
          ordered_content_blocks: orderedContentBlocks(block),
          direct_text: directBlockText(block),
          text: blockText(block),
          text_scope: block.children.length > 0 ? "subtree" : "direct",
          official_source_url: document.official_page_url,
          review_status: reviewStatus,
        }),
      );
      for (const child of block.children)
        visit(child, block.id, currentHierarchy);
    };
    for (const block of provision.blocks) {
      if (block.id === provision.id) {
        for (const child of block.children)
          visit(child, provision.id, rootPath);
      } else {
        visit(block, provision.id, rootPath);
      }
    }
  }
  return result;
}

function relationshipSource(
  provenance: string,
): RagRelationship["relationship_source"] {
  switch (provenance) {
    case "LEGAL_TEXT":
      return "legal_text";
    case "OFFICIAL_METADATA":
      return "official_metadata";
    case "OFFICIAL_MAPPING":
      return "official_mapping";
    case "CASE_TEXT":
    case "DECISION_TEXT":
      return "decision_text";
    case "EDITORIAL":
      return "editorial";
    case "TFIDF":
      return "algorithmic";
    default:
      throw new Error(`Unsupported relationship provenance ${provenance}`);
  }
}

function reviewStatus(provenance: string): RagRelationship["review_status"] {
  if (provenance === "TFIDF") return "candidate";
  if (provenance === "LEGAL_TEXT") return "validated";
  return "reviewed";
}

function normalizedRelationshipType(
  type: string,
  targetMeasureType?: string,
): string {
  if (type === "MANDATES" && targetMeasureType === "rts") return "mandates_rts";
  if (type === "MANDATES" && targetMeasureType === "its") return "mandates_its";
  return type.toLowerCase();
}

function loadedEndpoint(input: {
  entityId: string;
  documentId: string;
  rootProvisionId: string | null;
  kind: string;
  label: string;
  title: string | null;
  sourceUrl: string;
}): RagRelationshipEndpoint {
  return {
    entity_id: input.entityId,
    entity_type: input.kind === "document" ? "document" : "provision",
    document_id: input.documentId,
    provision_id: input.kind === "document" ? null : input.entityId,
    label: input.label,
    title: input.title,
    official_source_url: input.sourceUrl,
    metadata:
      input.rootProvisionId && input.rootProvisionId !== input.entityId
        ? { root_provision_id: input.rootProvisionId }
        : undefined,
  };
}

function relationshipRecord(input: {
  id: string;
  type: string;
  targetMeasureType?: string;
  provenance: string;
  source: RagRelationshipEndpoint;
  target: RagRelationshipEndpoint;
  evidenceText: string;
  evidenceLocator: string;
  evidenceSourceUrl: string;
  resolutionStatus: string;
  builderMethod: string;
  builderVersion: string;
  score?: number | null;
}): RagRelationship {
  return ragRelationshipSchema.parse({
    relationship_id: input.id,
    source_entity_id: input.source.entity_id,
    source_document_id: input.source.document_id,
    source_provision_id: input.source.provision_id,
    target_entity_id: input.target.entity_id,
    target_document_id: input.target.document_id,
    target_provision_id: input.target.provision_id,
    relationship_type: normalizedRelationshipType(
      input.type,
      input.targetMeasureType,
    ),
    platform_relationship_type: input.type,
    direction: "source_to_target",
    source: input.source,
    target: input.target,
    evidence_text: input.evidenceText,
    evidence_locator: input.evidenceLocator,
    evidence_source_url: input.evidenceSourceUrl,
    relationship_source: relationshipSource(input.provenance),
    review_status: reviewStatus(input.provenance),
    resolution_status: input.resolutionStatus,
    builder: {
      method: input.builderMethod,
      version: input.builderVersion,
    },
    score: input.score ?? null,
  });
}

function loadRelationships(database: Database.Database): RagRelationship[] {
  const rows = database
    .prepare(`
      SELECT
        r.relationship_id AS relationshipId,
        r.source_entity_id AS sourceEntityId,
        se.document_id AS sourceDocumentId,
        se.root_provision_id AS sourceRootProvisionId,
        se.kind AS sourceKind,
        se.label AS sourceLabel,
        se.title AS sourceTitle,
        sd.source_url AS sourceUrl,
        r.target_entity_id AS targetEntityId,
        te.document_id AS targetDocumentId,
        te.root_provision_id AS targetRootProvisionId,
        te.kind AS targetKind,
        te.label AS targetLabel,
        te.title AS targetTitle,
        td.source_url AS targetUrl,
        td.measure_type AS targetMeasureType,
        r.relation_type AS relationType,
        r.provenance,
        r.evidence_text AS evidenceText,
        r.evidence_locator AS evidenceLocator,
        r.source_ref AS evidenceSourceUrl,
        r.score,
        r.builder_method AS builderMethod,
        r.builder_version AS builderVersion,
        r.resolution_status AS resolutionStatus
      FROM relationships r
      JOIN legal_entities se ON se.id = r.source_entity_id
      JOIN legal_entities te ON te.id = r.target_entity_id
      JOIN documents sd ON sd.id = se.document_id
      JOIN documents td ON td.id = te.document_id
      ORDER BY r.relationship_id
    `)
    .all() as RelationshipRow[];
  const result = rows.map((row) =>
    relationshipRecord({
      id: row.relationshipId,
      type: row.relationType,
      targetMeasureType: row.targetMeasureType,
      provenance: row.provenance,
      source: loadedEndpoint({
        entityId: row.sourceEntityId,
        documentId: row.sourceDocumentId,
        rootProvisionId: row.sourceRootProvisionId,
        kind: row.sourceKind,
        label: row.sourceLabel,
        title: row.sourceTitle,
        sourceUrl: row.sourceUrl,
      }),
      target: loadedEndpoint({
        entityId: row.targetEntityId,
        documentId: row.targetDocumentId,
        rootProvisionId: row.targetRootProvisionId,
        kind: row.targetKind,
        label: row.targetLabel,
        title: row.targetTitle,
        sourceUrl: row.targetUrl,
      }),
      evidenceText: row.evidenceText,
      evidenceLocator: row.evidenceLocator,
      evidenceSourceUrl: row.evidenceSourceUrl,
      resolutionStatus: row.resolutionStatus,
      builderMethod: row.builderMethod,
      builderVersion: row.builderVersion,
      score: row.score,
    }),
  );

  const lifecycle = database
    .prepare(`
      SELECT
        r.relationship_id AS id, r.relation_type AS type, r.provenance,
        r.evidence_text AS evidenceText, r.evidence_locator AS evidenceLocator,
        r.source_ref AS evidenceSourceUrl, r.builder_method AS builderMethod,
        r.builder_version AS builderVersion, r.resolution_status AS resolutionStatus,
        sw.id AS sourceId, sw.loaded_document_id AS sourceDocumentId,
        sw.label AS sourceLabel, sw.title AS sourceTitle, sw.source_url AS sourceUrl,
        tw.id AS targetId, tw.loaded_document_id AS targetDocumentId,
        tw.label AS targetLabel, tw.title AS targetTitle, tw.source_url AS targetUrl
      FROM lifecycle_relationships r
      JOIN legal_works sw ON sw.id = r.source_work_id
      JOIN legal_works tw ON tw.id = r.target_work_id
      ORDER BY r.relationship_id
    `)
    .all() as Array<Record<string, string | null>>;
  for (const row of lifecycle) {
    result.push(
      relationshipRecord({
        id: String(row.id),
        type: String(row.type),
        provenance: String(row.provenance),
        source: {
          entity_id: String(row.sourceId),
          entity_type: "legal_work",
          document_id: row.sourceDocumentId,
          provision_id: null,
          label: String(row.sourceLabel),
          title: row.sourceTitle,
          official_source_url: row.sourceUrl,
        },
        target: {
          entity_id: String(row.targetId),
          entity_type: "legal_work",
          document_id: row.targetDocumentId,
          provision_id: null,
          label: String(row.targetLabel),
          title: row.targetTitle,
          official_source_url: row.targetUrl,
        },
        evidenceText: String(row.evidenceText),
        evidenceLocator: String(row.evidenceLocator),
        evidenceSourceUrl: String(row.evidenceSourceUrl),
        resolutionStatus: String(row.resolutionStatus),
        builderMethod: String(row.builderMethod),
        builderVersion: String(row.builderVersion),
      }),
    );
  }

  const cases = database
    .prepare(`
      SELECT
        r.relationship_id AS id, r.relation_type AS type, r.provenance,
        r.evidence_text AS evidenceText, r.evidence_locator AS evidenceLocator,
        r.source_ref AS evidenceSourceUrl, r.builder_method AS builderMethod,
        r.builder_version AS builderVersion, r.resolution_status AS resolutionStatus,
        c.id AS caseId, c.case_number AS caseNumber, c.case_name AS caseName,
        c.official_title AS caseTitle, c.source_url AS caseUrl, c.celex AS caseCelex,
        c.ecli, c.decision_type AS decisionType, c.decision_date AS decisionDate,
        d.id AS targetDocumentId, d.short_name AS targetLabel,
        d.official_title AS targetTitle, d.source_url AS targetUrl
      FROM case_law_relationships r
      JOIN case_entities c ON c.id = r.case_id
      JOIN documents d ON d.id = r.target_document_id
      ORDER BY r.relationship_id
    `)
    .all() as Array<Record<string, string | null>>;
  for (const row of cases) {
    result.push(
      relationshipRecord({
        id: String(row.id),
        type: String(row.type),
        provenance: String(row.provenance),
        source: {
          entity_id: String(row.caseId),
          entity_type: "case",
          document_id: null,
          provision_id: null,
          label: String(row.caseNumber),
          title: String(row.caseTitle),
          official_source_url: String(row.caseUrl),
          metadata: {
            celex: row.caseCelex,
            ecli: row.ecli,
            case_name: row.caseName,
            decision_type: row.decisionType,
            decision_date: row.decisionDate,
          },
        },
        target: {
          entity_id: String(row.targetDocumentId),
          entity_type: "document",
          document_id: String(row.targetDocumentId),
          provision_id: null,
          label: String(row.targetLabel),
          title: String(row.targetTitle),
          official_source_url: String(row.targetUrl),
        },
        evidenceText: String(row.evidenceText),
        evidenceLocator: String(row.evidenceLocator),
        evidenceSourceUrl: String(row.evidenceSourceUrl),
        resolutionStatus: String(row.resolutionStatus),
        builderMethod: String(row.builderMethod),
        builderVersion: String(row.builderVersion),
      }),
    );
  }

  const findings = database
    .prepare(`
      SELECT
        f.relationship_id AS id, f.relation_type AS type, f.provenance,
        f.evidence_text AS evidenceText, f.evidence_locator AS evidenceLocator,
        f.source_ref AS evidenceSourceUrl, f.builder_method AS builderMethod,
        f.builder_version AS builderVersion, f.resolution_status AS resolutionStatus,
        decision.id AS decisionId, decision.decision_number AS decisionNumber,
        decision.official_title AS decisionTitle,
        decision.source_page_url AS decisionUrl,
        decision.decision_date AS decisionDate,
        d.id AS targetDocumentId, e.id AS targetEntityId, e.kind AS targetKind,
        e.label AS targetLabel, e.title AS targetTitle, d.source_url AS targetUrl
      FROM supervisory_decision_findings f
      JOIN supervisory_decisions decision ON decision.id = f.decision_id
      JOIN documents d ON d.id = f.target_document_id
      JOIN legal_entities e ON e.id = f.target_entity_id
      ORDER BY f.relationship_id
    `)
    .all() as Array<Record<string, string | null>>;
  for (const row of findings) {
    result.push(
      relationshipRecord({
        id: String(row.id),
        type: String(row.type),
        provenance: String(row.provenance),
        source: {
          entity_id: String(row.decisionId),
          entity_type: "decision",
          document_id: null,
          provision_id: null,
          label: String(row.decisionNumber),
          title: String(row.decisionTitle),
          official_source_url: String(row.decisionUrl),
          metadata: { decision_date: row.decisionDate },
        },
        target: {
          entity_id: String(row.targetEntityId),
          entity_type: row.targetKind === "document" ? "document" : "provision",
          document_id: String(row.targetDocumentId),
          provision_id:
            row.targetKind === "document" ? null : String(row.targetEntityId),
          label: String(row.targetLabel),
          title: row.targetTitle,
          official_source_url: String(row.targetUrl),
        },
        evidenceText: String(row.evidenceText),
        evidenceLocator: String(row.evidenceLocator),
        evidenceSourceUrl: String(row.evidenceSourceUrl),
        resolutionStatus: String(row.resolutionStatus),
        builderMethod: String(row.builderMethod),
        builderVersion: String(row.builderVersion),
      }),
    );
  }

  return result.sort((left, right) =>
    left.relationship_id.localeCompare(right.relationship_id),
  );
}

function loadDocuments(database: Database.Database): Array<{
  document: RagDocument;
  readerPayloadJson: string;
}> {
  const aliases = new Map<string, string[]>();
  for (const row of database
    .prepare(
      "SELECT document_id AS documentId, alias FROM document_aliases ORDER BY document_id, display_order",
    )
    .all() as Array<{ documentId: string; alias: string }>) {
    const values = aliases.get(row.documentId) ?? [];
    values.push(row.alias);
    aliases.set(row.documentId, values);
  }
  const rows = database
    .prepare(`
      SELECT
        d.id, d.jurisdiction, d.celex, d.local_id AS localId,
        d.short_name AS shortName, d.official_title AS officialTitle,
        d.document_type AS documentType, d.publication_date AS publicationDate,
        d.source_url AS sourceUrl, d.source_status_json AS sourceStatusJson,
        d.last_checked AS lastChecked, d.source_version AS sourceVersion,
        d.canonical_build_id AS canonicalBuildId, d.provenance,
        d.family_id AS familyId, d.regulatory_level AS regulatoryLevel,
        d.measure_type AS measureType, v.reader_payload_json AS readerPayloadJson,
        em.issuers_json AS issuersJson, em.text_kind AS textKind,
        em.currency_status AS currencyStatus,
        em.version_selection_policy AS versionSelectionPolicy,
        em.fallback_reason AS fallbackReason
      FROM documents d
      JOIN document_views v ON v.document_id = d.id
      JOIN document_expression_metadata em ON em.document_id = d.id
      ORDER BY d.display_order, d.id
    `)
    .all() as DocumentRow[];
  return rows.map((row) => {
    const view = documentViewSchema.parse(JSON.parse(row.readerPayloadJson));
    const status = row.sourceStatusJson
      ? sourceStatusSchema.parse(JSON.parse(row.sourceStatusJson))
      : undefined;
    const textAsOf = status?.textAsOf ?? view.asOf;
    const review = row.provenance === "official" ? "validated" : "fixture";
    const draft = {
      document_id: row.id,
      official_identifier: row.celex ?? row.localId,
      celex: row.celex,
      local_id: row.localId,
      family_ids: [row.familyId],
      aliases: aliases.get(row.id) ?? [],
      issuers: JSON.parse(row.issuersJson),
      short_title: row.shortName,
      title: row.officialTitle,
      jurisdiction: row.jurisdiction,
      jurisdictions: [row.jurisdiction],
      language: "en",
      document_type: row.documentType,
      regulatory_level: row.regulatoryLevel.replace("-", "_"),
      measure_type: row.measureType.replace("-", "_"),
      document_stage: "published",
      lifecycle_status: null,
      version_status:
        row.currencyStatus === "not_assessed" ? null : row.currencyStatus,
      legal_effect: null,
      date_document: row.publicationDate,
      date_entry_into_force: null,
      date_application: null,
      date_repeal: null,
      official_page_url: row.sourceUrl,
      current_version_url: status?.currentVersionUrl ?? null,
      source_snapshot_id: view.sourceSnapshotId,
      source_version: row.sourceVersion,
      text_as_of: textAsOf,
      canonical_build_id: row.canonicalBuildId,
      review_status: review,
      expressions: [
        {
          expression_id: `${row.id}@${textAsOf}@en`,
          document_id: row.id,
          language: "en",
          expression_date: textAsOf,
          text_kind: row.textKind,
          currency_status: row.currencyStatus,
          version_selection_policy: row.versionSelectionPolicy,
          fallback_reason: row.fallbackReason,
          official_status: row.provenance,
          official_source_url: row.sourceUrl,
          retrieved_at: row.lastChecked,
          source_snapshot_id: view.sourceSnapshotId,
          source_version: row.sourceVersion,
          review_status: review,
        },
      ],
    };
    return {
      document: ragDocumentSchema.parse(draft),
      readerPayloadJson: row.readerPayloadJson,
    };
  });
}

function writeJsonl(
  path: string,
  records: unknown[],
): {
  records: number;
  bytes: number;
  sha256: string;
} {
  const payload = records.map(jsonLine).join("");
  writeFileSync(path, payload, { encoding: "utf8", flag: "wx" });
  return {
    records: records.length,
    bytes: Buffer.byteLength(payload),
    sha256: sha256(payload),
  };
}

export function exportRagSnapshot(options: ExportOptions): RagSnapshotManifest {
  const databasePath = resolve(options.databasePath);
  const outputPath = resolve(options.outputPath);
  ragSnapshotManifestSchema.shape.snapshot_id.parse(options.snapshotId);
  zDate(options.asOfDate);
  if (!existsSync(databasePath)) {
    throw new Error(`Runtime database does not exist: ${databasePath}`);
  }
  if (existsSync(outputPath)) {
    throw new Error(
      `Snapshot output already exists and will not be overwritten: ${outputPath}`,
    );
  }
  mkdirSync(dirname(outputPath), { recursive: true });
  const stagingPath = `${outputPath}.partial-${process.pid}`;
  if (existsSync(stagingPath)) rmSync(stagingPath, { recursive: true });
  mkdirSync(stagingPath);

  const database = new Database(databasePath, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    database.pragma("query_only = ON");
    const runtimeSchemaVersion = manifestValue(database, "schemaVersion");
    if (runtimeSchemaVersion !== RUNTIME_DATABASE_SCHEMA_VERSION) {
      throw new Error(
        `Unsupported Runtime schema ${runtimeSchemaVersion}; expected ${RUNTIME_DATABASE_SCHEMA_VERSION}`,
      );
    }
    const loaded = loadDocuments(database);
    const documents = loaded.map((item) => item.document);
    const provisions = loaded.flatMap((item) =>
      exportProvisions(item.document, item.readerPayloadJson),
    );
    const relationships = loadRelationships(database);
    const files = {
      "documents.jsonl": writeJsonl(
        join(stagingPath, "documents.jsonl"),
        documents,
      ),
      "provisions.jsonl": writeJsonl(
        join(stagingPath, "provisions.jsonl"),
        provisions,
      ),
      "relationships.jsonl": writeJsonl(
        join(stagingPath, "relationships.jsonl"),
        relationships,
      ),
    };
    const manifest = ragSnapshotManifestSchema.parse({
      schema_version: RAG_SNAPSHOT_SCHEMA_VERSION,
      snapshot_id: options.snapshotId,
      created_at: options.createdAt ?? new Date().toISOString(),
      as_of_date: options.asOfDate,
      languages: ["en"],
      profile_id: manifestValue(database, "profileId"),
      profile_version: manifestValue(database, "profileVersion"),
      profile_hash: manifestValue(database, "profileHash"),
      runtime_schema_version: runtimeSchemaVersion,
      runtime_build_id: manifestValue(database, "buildId"),
      document_count: documents.length,
      provision_count: provisions.length,
      relationship_count: relationships.length,
      review_status: "record_level",
      generator_version: RAG_SNAPSHOT_GENERATOR_VERSION,
      corpus_selection_policy: {
        selection_unit: "complete_legal_work",
        relationship_boundary: "metadata_stub",
        auto_include_relationship_targets: false,
      },
      files,
    });
    writeFileSync(
      join(stagingPath, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
    verifyRagSnapshot(stagingPath);
    renameSync(stagingPath, outputPath);
    return manifest;
  } catch (error) {
    rmSync(stagingPath, { recursive: true, force: true });
    throw error;
  } finally {
    database.close();
  }
}

function zDate(value: string): void {
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  ) {
    throw new Error(`Invalid --as-of date: ${value}`);
  }
}

function parseJsonl<T>(
  path: string,
  schema: { parse(value: unknown): T },
): T[] {
  const payload = readFileSync(path, "utf8");
  if (payload && !payload.endsWith("\n")) {
    throw new Error(`${path} must end with a newline`);
  }
  return payload
    .split("\n")
    .filter(Boolean)
    .map((line, index) => {
      try {
        return schema.parse(JSON.parse(line));
      } catch (error) {
        throw new Error(`${path}:${index + 1}: ${String(error)}`);
      }
    });
}

export function verifyRagSnapshot(inputPath: string): RagSnapshotManifest {
  const resolvedInput = resolve(inputPath);
  const manifest = ragSnapshotManifestSchema.parse(
    JSON.parse(readFileSync(join(resolvedInput, "manifest.json"), "utf8")),
  );
  const documents = parseJsonl(
    join(resolvedInput, "documents.jsonl"),
    ragDocumentSchema,
  );
  const provisions = parseJsonl(
    join(resolvedInput, "provisions.jsonl"),
    ragProvisionSchema,
  );
  const relationships = parseJsonl(
    join(resolvedInput, "relationships.jsonl"),
    ragRelationshipSchema,
  );
  const recordsByFile = new Map<string, unknown[]>([
    ["documents.jsonl", documents],
    ["provisions.jsonl", provisions],
    ["relationships.jsonl", relationships],
  ]);
  for (const name of OUTPUT_FILES) {
    const path = join(resolvedInput, name);
    const payload = readFileSync(path);
    const expected = manifest.files[name];
    if (recordsByFile.get(name)?.length !== expected.records) {
      throw new Error(`${name} record count does not match manifest`);
    }
    if (statSync(path).size !== expected.bytes) {
      throw new Error(`${name} byte count does not match manifest`);
    }
    if (sha256(payload) !== expected.sha256) {
      throw new Error(`${name} SHA-256 does not match manifest`);
    }
  }
  if (
    documents.length !== manifest.document_count ||
    provisions.length !== manifest.provision_count ||
    relationships.length !== manifest.relationship_count
  ) {
    throw new Error("Snapshot record totals do not match manifest");
  }
  const documentIds = new Set<string>();
  const expressionIds = new Set<string>();
  for (const document of documents) {
    if (documentIds.has(document.document_id)) {
      throw new Error(`Duplicate document_id: ${document.document_id}`);
    }
    documentIds.add(document.document_id);
    for (const expression of document.expressions) {
      if (expression.document_id !== document.document_id) {
        throw new Error(
          `Expression ${expression.expression_id} references the wrong document`,
        );
      }
      if (expressionIds.has(expression.expression_id)) {
        throw new Error(`Duplicate expression_id: ${expression.expression_id}`);
      }
      expressionIds.add(expression.expression_id);
    }
  }
  const provisionIds = new Set<string>();
  const provisionDocumentIds = new Map<string, string>();
  const provisionParentIds = new Map<string, string | null>();
  const documentOrders = new Map<string, number[]>();
  for (const provision of provisions) {
    if (provisionIds.has(provision.provision_id)) {
      throw new Error(`Duplicate provision_id: ${provision.provision_id}`);
    }
    if (!documentIds.has(provision.document_id)) {
      throw new Error(
        `Provision references missing document: ${provision.provision_id}`,
      );
    }
    if (!expressionIds.has(provision.expression_id)) {
      throw new Error(
        `Provision ${provision.provision_id} references missing Expression ${provision.expression_id}`,
      );
    }
    provisionIds.add(provision.provision_id);
    provisionDocumentIds.set(provision.provision_id, provision.document_id);
    provisionParentIds.set(
      provision.provision_id,
      provision.parent_provision_id,
    );
    const orders = documentOrders.get(provision.document_id) ?? [];
    orders.push(provision.document_order);
    documentOrders.set(provision.document_id, orders);
  }
  for (const [documentId, orders] of documentOrders) {
    const sorted = [...orders].sort((left, right) => left - right);
    if (sorted.some((order, index) => order !== index)) {
      throw new Error(
        `Document ${documentId} has duplicate or non-contiguous document_order values`,
      );
    }
  }
  for (const provision of provisions) {
    if (
      provision.parent_provision_id &&
      !provisionIds.has(provision.parent_provision_id)
    ) {
      throw new Error(
        `Provision references missing parent: ${provision.provision_id}`,
      );
    }
    if (
      provision.parent_provision_id &&
      provisionDocumentIds.get(provision.parent_provision_id) !==
        provision.document_id
    ) {
      throw new Error(
        `Provision ${provision.provision_id} has a parent in another document`,
      );
    }
    if (!provisionIds.has(provision.root_provision_id)) {
      throw new Error(
        `Provision references missing root: ${provision.provision_id}`,
      );
    }
    if (
      provisionDocumentIds.get(provision.root_provision_id) !==
      provision.document_id
    ) {
      throw new Error(
        `Provision ${provision.provision_id} has a root in another document`,
      );
    }
    for (const [order, block] of provision.ordered_content_blocks.entries()) {
      if (block.order !== order) {
        throw new Error(
          `Provision ${provision.provision_id} has non-contiguous ordered content`,
        );
      }
      if (block.type === "child") {
        if (!provisionIds.has(block.provision_id)) {
          throw new Error(
            `Provision ${provision.provision_id} references missing ordered child ${block.provision_id}`,
          );
        }
        if (
          provisionParentIds.get(block.provision_id) !== provision.provision_id
        ) {
          throw new Error(
            `Provision ${provision.provision_id} references a non-child ordered provision ${block.provision_id}`,
          );
        }
      }
    }
    const orderedDirectText = provision.ordered_content_blocks
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("\n");
    if (orderedDirectText !== provision.direct_text) {
      throw new Error(
        `Provision ${provision.provision_id} direct_text differs from ordered content`,
      );
    }
  }
  if (documentIds.has("eu:32015L0849")) {
    const article13Paragraph1 = provisions.find(
      (provision) =>
        provision.provision_id === "eu:32015L0849:article:13:paragraph:1",
    );
    const expectedChildren = ["a", "b", "c", "d"].map(
      (point) => `eu:32015L0849:article:13:paragraph:1:point:${point}`,
    );
    const orderedChildren = article13Paragraph1?.ordered_content_blocks.flatMap(
      (block) => (block.type === "child" ? [block.provision_id] : []),
    );
    const textBlockCount = article13Paragraph1?.ordered_content_blocks.filter(
      (block) => block.type === "text",
    ).length;
    if (
      !article13Paragraph1 ||
      JSON.stringify(orderedChildren) !== JSON.stringify(expectedChildren) ||
      textBlockCount !== 2 ||
      article13Paragraph1.ordered_content_blocks[0]?.type !== "text" ||
      article13Paragraph1.ordered_content_blocks.at(-1)?.type !== "text"
    ) {
      throw new Error(
        "AMLD IV Article 13(1) failed the reviewed ordered-content semantic case",
      );
    }
  }
  const relationshipIds = new Set<string>();
  for (const relationship of relationships) {
    if (relationshipIds.has(relationship.relationship_id)) {
      throw new Error(
        `Duplicate relationship_id: ${relationship.relationship_id}`,
      );
    }
    relationshipIds.add(relationship.relationship_id);
    if (
      relationship.source_entity_id !== relationship.source.entity_id ||
      relationship.source_document_id !== relationship.source.document_id ||
      relationship.source_provision_id !== relationship.source.provision_id ||
      relationship.target_entity_id !== relationship.target.entity_id ||
      relationship.target_document_id !== relationship.target.document_id ||
      relationship.target_provision_id !== relationship.target.provision_id
    ) {
      throw new Error(
        `Relationship ${relationship.relationship_id} has inconsistent endpoint fields`,
      );
    }
    for (const endpoint of [relationship.source, relationship.target]) {
      if (endpoint.document_id && !documentIds.has(endpoint.document_id)) {
        throw new Error(
          `Relationship ${relationship.relationship_id} references missing document ${endpoint.document_id}`,
        );
      }
      if (endpoint.provision_id && !provisionIds.has(endpoint.provision_id)) {
        throw new Error(
          `Relationship ${relationship.relationship_id} references missing provision ${endpoint.provision_id}`,
        );
      }
    }
  }
  return manifest;
}
