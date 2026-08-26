import { existsSync } from "node:fs";
import { resolve } from "node:path";
import Database from "better-sqlite3";
import type { SourceDefinition } from "../ingestion/source-registry";
import {
  DEFAULT_RUNTIME_DATABASE_PATH,
  RUNTIME_DATABASE_SCHEMA_VERSION,
} from "../search/sqlite-search-index";
import {
  type CaseLawRelationship,
  type DocumentCaseLawRelationshipsResponse,
  documentCaseLawRelationshipsResponseSchema,
} from "../shared/case-law";
import {
  type DocumentVersionChain,
  type DocumentVersionEdge,
  type DocumentVersionNode,
  documentVersionChainSchema,
} from "../shared/document-version-chain";
import {
  type ImplementationTimeline,
  type ImplementationTimelineEvent,
  implementationTimelineSchema,
} from "../shared/implementation-timeline";
import {
  type DocumentRelationshipsResponse,
  type DocumentSummary,
  type DocumentView,
  type ExplorerDocument,
  type FamilyLevel2Response,
  type Level2Measure,
  type ProvisionRelationship,
  type ProvisionRelationshipsResponse,
  type RelationshipPreview,
  documentRelationshipsResponseSchema,
  documentViewSchema,
  explorerDocumentSchema,
  familyLevel2ResponseSchema,
  provisionRelationshipsResponseSchema,
  relationshipPreviewSchema,
} from "../shared/legal";
import {
  type DocumentLifecycleRelationshipsResponse,
  type LifecycleRelationship,
  documentLifecycleRelationshipsResponseSchema,
} from "../shared/lifecycle";
import { explorerPath } from "../shared/reader-route";
import {
  type AuthorityRelationship,
  type DocumentRegulatoryContext,
  type DomainAssignment,
  type LegalNature,
  documentRegulatoryContextSchema,
} from "../shared/regulatory-context";
import { sourceStatusSchema } from "../shared/source-status";

type LawSearchSource = Pick<
  SourceDefinition,
  "familyId" | "aliases" | "regulatoryLevel" | "measureType"
> & { celex?: string; localId?: string };

interface DocumentPayloadRow {
  readerPayload: string;
}

interface DocumentSummaryRow
  extends Omit<DocumentSummary, "hasImplementationTimeline"> {
  hasImplementationTimeline: 0 | 1;
}

interface TimelineEventRow {
  timelineId: string;
  timelineVersion: string;
  eventId: string;
  documentId: string;
  documentSlug: string;
  documentShortName: string;
  documentOfficialTitle: string;
  documentSourceUrl: string;
  documentSourceVersion: string;
  documentAsOf: string;
  eventType: ImplementationTimelineEvent["eventType"];
  eventDate: string;
  label: string;
  scopeLabel: string;
  dateBasis: ImplementationTimelineEvent["dateBasis"];
  sourceEntityId: string;
  sourceLabel: string;
  sourcePath: string;
  sourceLocatorKind: string | null;
  sourceLocatorValue: string | null;
  evidenceText: string;
  evidenceLocator: string;
  sourceUrl: string;
  derivationJson: string | null;
  provenance: ImplementationTimelineEvent["provenance"];
  reviewStatus: "reviewed";
  reviewedAt: string;
  builderMethod: "implementation-timeline";
  builderVersion: "1.0.0";
}

interface ExplorerPayloadRow {
  explorerPayload: string;
}

interface VersionChainRow {
  coverage: DocumentVersionChain["coverage"];
  checkedAt: string | null;
  loadedVersionId: string;
}

interface VersionNodeRow {
  id: string;
  documentId: string;
  kind: DocumentVersionNode["kind"];
  label: string;
  date: string | null;
  sourceUrl: string;
  availability: DocumentVersionNode["availability"];
}

type VersionEdgeRow = DocumentVersionEdge;

interface LawSourceRow {
  documentId: string;
  celex: string | null;
  localId: string | null;
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
  score: number | null;
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

interface LifecycleRelationshipRow {
  id: string;
  relationType: LifecycleRelationship["relationType"];
  provenance: LifecycleRelationship["provenance"];
  evidenceText: string;
  evidenceLocator: string;
  sourceRef: string;
  builderMethod: string;
  builderVersion: string;
  resolutionStatus: LifecycleRelationship["resolutionStatus"];
  sourceEntityId: string;
  sourceCelex: string;
  sourceDocumentId: string | null;
  sourceDocumentShortName: string;
  sourceLabel: string;
  sourceTitle: string | null;
  sourcePath: string | null;
  sourceUrl: string;
  sourceAvailability: "loaded" | "external";
  targetEntityId: string;
  targetCelex: string;
  targetDocumentId: string | null;
  targetDocumentShortName: string;
  targetLabel: string;
  targetTitle: string | null;
  targetPath: string | null;
  targetUrl: string;
  targetAvailability: "loaded" | "external";
}

interface CaseLawRelationshipRow {
  id: string;
  relationType: "INTERPRETS";
  provenance: "OFFICIAL_METADATA";
  evidenceText: "CELLAR case-law_interpretes_resource_legal";
  evidenceLocator: string;
  sourceRef: string;
  builderMethod: string;
  builderVersion: string;
  resolutionStatus: "metadata-only";
  caseEntityId: string;
  caseCelex: string;
  ecli: string;
  caseNumber: string;
  caseName: string;
  decisionType: "judgment" | "order";
  decisionDate: string;
  officialTitle: string;
  caseSourceUrl: string;
  targetDocumentId: string;
  targetDocumentShortName: string;
  targetTitle: string;
  targetPath: string;
  targetSourceUrl: string;
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

interface DomainAssignmentRow {
  id: string;
  domainId: string;
  parentId: string | null;
  domainLabel: string;
  domainDescription: string;
  taxonomyId: string;
  taxonomyVersion: string;
  domainProvenance: "EDITORIAL";
  domainReviewStatus: "reviewed";
  domainReviewedAt: string;
  targetDocumentId: string;
  targetEntityId: string;
  targetKind: "document" | "provision";
  targetLabel: string;
  targetPath: string;
  role: "contains" | "primary";
  provenance: "EDITORIAL";
  assignmentVersion: string;
  reviewStatus: "reviewed";
  reviewedAt: string;
  rationale: string;
  reviewNote: string;
  evidenceLocator: string;
}

interface AuthorityRelationshipRow {
  id: string;
  sourceDocumentId: string;
  relationType: "ISSUED_BY";
  provenance: "OFFICIAL_METADATA";
  evidenceText: string;
  evidenceLocator: string;
  sourceRef: string;
  builderMethod: string;
  builderVersion: string;
  reviewStatus: "reviewed";
  reviewedAt: string;
  authorityId: string;
  officialName: string;
  acronym: string | null;
  authorityType: "legislative-institution" | "supervisory-authority";
  jurisdiction: string;
  authoritySourceUrl: string;
  checkedAt: string;
}

interface LegalNatureRow {
  documentId: string;
  instrumentType: "guideline";
  complianceExpectation: "make-every-effort-to-comply";
  currentStatus: "in-force";
  underReview: 0 | 1;
  applicationDate: string;
  statusCheckedAt: string;
  legalBasisEvidenceText: string;
  legalBasisEvidenceEntityId: string;
  legalBasisSourceUrl: string;
  applicationEvidenceText: string;
  applicationEvidenceEntityId: string;
  applicationSourceUrl: string;
  statusSourceUrl: string;
  provenance: "OFFICIAL_METADATA";
  reviewStatus: "reviewed";
  reviewedAt: string;
}

interface FamilyPrimaryRow {
  familyId: string;
  familyShortName: string;
}

interface Level2MeasureRow {
  id: string;
  slug: string;
  shortName: string;
  officialTitle: string;
  celex: string;
  measureType: Level2Measure["measureType"];
  publicationDate: string;
  sourceUrl: string;
  sourceStatusJson: string | null;
  readerPath: string;
  articleEntityId: string | null;
  mandateDocumentId: string | null;
  mandateDocumentShortName: string | null;
  mandateLabel: string | null;
  mandateTitle: string | null;
  mandatePath: string | null;
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
    r.score,
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

const LIFECYCLE_RELATIONSHIP_SELECT = `
  SELECT
    lr.relationship_id AS id,
    lr.relation_type AS relationType,
    lr.provenance,
    lr.evidence_text AS evidenceText,
    lr.evidence_locator AS evidenceLocator,
    lr.source_ref AS sourceRef,
    lr.builder_method AS builderMethod,
    lr.builder_version AS builderVersion,
    lr.resolution_status AS resolutionStatus,
    sw.id AS sourceEntityId,
    sw.celex AS sourceCelex,
    sw.loaded_document_id AS sourceDocumentId,
    COALESCE(sd.short_name, 'CELEX ' || sw.celex) AS sourceDocumentShortName,
    sw.label AS sourceLabel,
    sw.title AS sourceTitle,
    sd.default_path AS sourcePath,
    sw.source_url AS sourceUrl,
    sw.availability AS sourceAvailability,
    tw.id AS targetEntityId,
    tw.celex AS targetCelex,
    tw.loaded_document_id AS targetDocumentId,
    COALESCE(td.short_name, 'CELEX ' || tw.celex) AS targetDocumentShortName,
    tw.label AS targetLabel,
    tw.title AS targetTitle,
    td.default_path AS targetPath,
    tw.source_url AS targetUrl,
    tw.availability AS targetAvailability
  FROM lifecycle_relationships lr
  JOIN legal_works sw ON sw.id = lr.source_work_id
  LEFT JOIN documents sd ON sd.id = sw.loaded_document_id
  JOIN legal_works tw ON tw.id = lr.target_work_id
  LEFT JOIN documents td ON td.id = tw.loaded_document_id
`;

const CASE_LAW_RELATIONSHIP_SELECT = `
  SELECT
    clr.relationship_id AS id,
    clr.relation_type AS relationType,
    clr.provenance,
    clr.evidence_text AS evidenceText,
    clr.evidence_locator AS evidenceLocator,
    clr.source_ref AS sourceRef,
    clr.builder_method AS builderMethod,
    clr.builder_version AS builderVersion,
    clr.resolution_status AS resolutionStatus,
    c.id AS caseEntityId,
    c.celex AS caseCelex,
    c.ecli,
    c.case_number AS caseNumber,
    c.case_name AS caseName,
    c.decision_type AS decisionType,
    c.decision_date AS decisionDate,
    c.official_title AS officialTitle,
    c.source_url AS caseSourceUrl,
    d.id AS targetDocumentId,
    d.short_name AS targetDocumentShortName,
    d.official_title AS targetTitle,
    d.default_path AS targetPath,
    d.source_url AS targetSourceUrl
  FROM case_law_relationships clr
  JOIN case_entities c ON c.id = clr.case_id
  JOIN documents d ON d.id = clr.target_document_id
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
    score: row.score ?? undefined,
    resolutionStatus: row.resolutionStatus,
  };
}

function toLifecycleRelationship(
  row: LifecycleRelationshipRow,
): LifecycleRelationship {
  const endpoint = (
    side: "source" | "target",
  ): LifecycleRelationship["source"] => {
    const documentId = row[`${side}DocumentId`];
    const availability = row[`${side}Availability`];
    const path = row[`${side}Path`];
    const common = {
      entityId: row[`${side}EntityId`],
      celex: row[`${side}Celex`],
      documentId: documentId ?? row[`${side}EntityId`],
      documentShortName: row[`${side}DocumentShortName`],
      label: row[`${side}Label`],
      title: row[`${side}Title`],
      sourceUrl: side === "source" ? row.sourceUrl : row.targetUrl,
    };
    if (availability === "loaded") {
      if (!documentId || !path) {
        throw new Error(`Loaded lifecycle Work is incomplete: ${common.celex}`);
      }
      return {
        ...common,
        documentId,
        kind: "document",
        path,
        availability,
      };
    }
    return {
      ...common,
      kind: "external-work",
      availability,
    };
  };
  return {
    id: row.id,
    relationType: row.relationType,
    provenance: row.provenance,
    source: endpoint("source"),
    target: endpoint("target"),
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

function toCaseLawRelationship(
  row: CaseLawRelationshipRow,
): CaseLawRelationship {
  return {
    id: row.id,
    relationType: row.relationType,
    provenance: row.provenance,
    source: {
      entityId: row.caseEntityId,
      kind: "case",
      jurisdiction: "EU",
      caseCelex: row.caseCelex,
      ecli: row.ecli,
      caseNumber: row.caseNumber,
      caseName: row.caseName,
      decisionType: row.decisionType,
      decisionDate: row.decisionDate,
      officialTitle: row.officialTitle,
      sourceUrl: row.caseSourceUrl,
      availability: "metadata-only",
    },
    target: {
      entityId: row.targetDocumentId,
      documentId: row.targetDocumentId,
      documentShortName: row.targetDocumentShortName,
      kind: "document",
      label: row.targetDocumentShortName,
      title: row.targetTitle,
      path: row.targetPath,
      sourceUrl: row.targetSourceUrl,
      availability: "loaded",
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
  readonly profileId: string;
  readonly profileVersion: string;
  readonly profileDisplayName: string;
  readonly profileHash: string;
  readonly regulatoryDomainTaxonomyId: string;
  readonly regulatoryDomainTaxonomyVersion: string;
  readonly relationshipCount: number;
  readonly cellarRelationshipCount: number;
  readonly lifecycleRelationshipCount: number;
  readonly externalWorkCount: number;
  readonly caseCount: number;
  readonly caseLawRelationshipCount: number;
  readonly relatedRecitalCount: number;
  readonly versionNodeCount: number;
  readonly versionEdgeCount: number;
  readonly domainCount: number;
  readonly domainAssignmentCount: number;
  readonly authorityCount: number;
  readonly authorityRelationshipCount: number;
  readonly timelineEventCount: number;
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
      this.profileId = manifestValue(this.database, "profileId");
      this.profileVersion = manifestValue(this.database, "profileVersion");
      this.profileDisplayName = manifestValue(
        this.database,
        "profileDisplayName",
      );
      this.profileHash = manifestValue(this.database, "profileHash");
      this.regulatoryDomainTaxonomyId = manifestValue(
        this.database,
        "regulatoryDomainTaxonomyId",
      );
      this.regulatoryDomainTaxonomyVersion = manifestValue(
        this.database,
        "regulatoryDomainTaxonomyVersion",
      );
      this.relationshipCount = Number.parseInt(
        manifestValue(this.database, "relationshipCount"),
        10,
      );
      this.cellarRelationshipCount = Number.parseInt(
        manifestValue(this.database, "cellarRelationshipCount"),
        10,
      );
      this.lifecycleRelationshipCount = Number.parseInt(
        manifestValue(this.database, "lifecycleRelationshipCount"),
        10,
      );
      this.externalWorkCount = Number.parseInt(
        manifestValue(this.database, "externalWorkCount"),
        10,
      );
      this.caseCount = Number.parseInt(
        manifestValue(this.database, "caseCount"),
        10,
      );
      this.caseLawRelationshipCount = Number.parseInt(
        manifestValue(this.database, "caseLawRelationshipCount"),
        10,
      );
      this.relatedRecitalCount = Number.parseInt(
        manifestValue(this.database, "relatedRecitalCount"),
        10,
      );
      this.versionNodeCount = Number.parseInt(
        manifestValue(this.database, "versionNodeCount"),
        10,
      );
      this.versionEdgeCount = Number.parseInt(
        manifestValue(this.database, "versionEdgeCount"),
        10,
      );
      this.domainCount = Number.parseInt(
        manifestValue(this.database, "domainCount"),
        10,
      );
      this.domainAssignmentCount = Number.parseInt(
        manifestValue(this.database, "domainAssignmentCount"),
        10,
      );
      this.authorityCount = Number.parseInt(
        manifestValue(this.database, "authorityCount"),
        10,
      );
      this.authorityRelationshipCount = Number.parseInt(
        manifestValue(this.database, "authorityRelationshipCount"),
        10,
      );
      this.timelineEventCount = Number.parseInt(
        manifestValue(this.database, "timelineEventCount"),
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
    const rows = this.database
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
          measure_type AS measureType,
          EXISTS (
            SELECT 1 FROM implementation_timeline_events timeline
            WHERE timeline.document_id = documents.id
          ) AS hasImplementationTimeline
        FROM documents
        ORDER BY display_order ASC
      `)
      .all() as DocumentSummaryRow[];
    return rows.map((row) => ({
      ...row,
      hasImplementationTimeline: row.hasImplementationTimeline === 1,
    }));
  }

  findImplementationTimelineBySlug(
    slug: string,
  ): ImplementationTimeline | null {
    const rows = this.database
      .prepare(`
        SELECT
          event.timeline_id AS timelineId,
          event.timeline_version AS timelineVersion,
          event.event_id AS eventId,
          document.id AS documentId,
          document.slug AS documentSlug,
          document.short_name AS documentShortName,
          document.official_title AS documentOfficialTitle,
          document.source_url AS documentSourceUrl,
          document.source_version AS documentSourceVersion,
          document.publication_date AS documentAsOf,
          event.event_type AS eventType,
          event.event_date AS eventDate,
          event.label,
          event.scope_label AS scopeLabel,
          event.date_basis AS dateBasis,
          event.source_entity_id AS sourceEntityId,
          event.source_label AS sourceLabel,
          event.source_path AS sourcePath,
          event.source_locator_kind AS sourceLocatorKind,
          event.source_locator_value AS sourceLocatorValue,
          event.evidence_text AS evidenceText,
          event.evidence_locator AS evidenceLocator,
          event.source_url AS sourceUrl,
          event.derivation_json AS derivationJson,
          event.provenance,
          event.review_status AS reviewStatus,
          event.reviewed_at AS reviewedAt,
          event.builder_method AS builderMethod,
          event.builder_version AS builderVersion
        FROM implementation_timeline_events event
        JOIN documents document ON document.id = event.document_id
        WHERE document.slug = ?
        ORDER BY event.event_date ASC, event.event_id ASC
      `)
      .all(slug) as TimelineEventRow[];
    const first = rows[0];
    if (!first) return null;
    return implementationTimelineSchema.parse({
      schemaVersion: "1.0.0",
      id: first.timelineId,
      version: first.timelineVersion,
      document: {
        id: first.documentId,
        slug: first.documentSlug,
        shortName: first.documentShortName,
        officialTitle: first.documentOfficialTitle,
        sourceUrl: first.documentSourceUrl,
        sourceVersion: first.documentSourceVersion,
        asOf: first.documentAsOf,
      },
      runtime: {
        buildId: this.buildId,
        profileId: this.profileId,
        profileVersion: this.profileVersion,
        profileHash: this.profileHash,
      },
      events: rows.map((row) => ({
        id: row.eventId,
        eventType: row.eventType,
        date: row.eventDate,
        label: row.label,
        scopeLabel: row.scopeLabel,
        dateBasis: row.dateBasis,
        source: {
          entityId: row.sourceEntityId,
          label: row.sourceLabel,
          path: row.sourcePath,
          sourceUrl: row.sourceUrl,
          sourceLocator:
            row.sourceLocatorKind && row.sourceLocatorValue
              ? { kind: row.sourceLocatorKind, value: row.sourceLocatorValue }
              : undefined,
          evidenceText: row.evidenceText,
          evidenceLocator: row.evidenceLocator,
        },
        derivation: row.derivationJson
          ? JSON.parse(row.derivationJson)
          : undefined,
        provenance: row.provenance,
        reviewStatus: row.reviewStatus,
        reviewedAt: row.reviewedAt,
        builder: {
          method: row.builderMethod,
          version: row.builderVersion,
        },
      })),
    });
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

  findDocumentRegulatoryContext(
    documentId: string,
    provisionId?: string,
  ): DocumentRegulatoryContext | null {
    const document = this.database
      .prepare("SELECT id FROM documents WHERE id = ?")
      .get(documentId);
    if (!document) return null;
    if (provisionId) {
      const provision = this.database
        .prepare(`
          SELECT id FROM legal_entities
          WHERE id = ? AND document_id = ?
            AND kind != 'document' AND root_provision_id IS NULL
        `)
        .get(provisionId, documentId);
      if (!provision) return null;
    }

    const domainRows = this.database
      .prepare(`
        SELECT
          da.assignment_id AS id,
          rd.id AS domainId,
          rd.parent_id AS parentId,
          rd.label AS domainLabel,
          rd.description AS domainDescription,
          rd.taxonomy_id AS taxonomyId,
          rd.taxonomy_version AS taxonomyVersion,
          rd.provenance AS domainProvenance,
          rd.review_status AS domainReviewStatus,
          rd.reviewed_at AS domainReviewedAt,
          da.target_document_id AS targetDocumentId,
          da.target_entity_id AS targetEntityId,
          da.target_kind AS targetKind,
          CASE WHEN le.title IS NULL THEN le.label
            ELSE le.label || ' — ' || le.title END AS targetLabel,
          le.path AS targetPath,
          da.role,
          da.provenance,
          da.assignment_version AS assignmentVersion,
          da.review_status AS reviewStatus,
          da.reviewed_at AS reviewedAt,
          da.rationale,
          da.review_note AS reviewNote,
          da.evidence_locator AS evidenceLocator
        FROM domain_assignments da
        JOIN regulatory_domains rd ON rd.id = da.domain_id
        JOIN legal_entities le ON le.id = da.target_entity_id
        WHERE da.target_document_id = @documentId
          AND (
            da.target_entity_id = @documentId
            OR (@provisionId IS NOT NULL AND da.target_entity_id = @provisionId)
          )
        ORDER BY
          CASE da.target_kind WHEN 'document' THEN 0 ELSE 1 END,
          rd.label ASC,
          da.assignment_id ASC
      `)
      .all({
        documentId,
        provisionId: provisionId ?? null,
      }) as DomainAssignmentRow[];
    const authorityRows = this.database
      .prepare(`
        SELECT
          ar.relationship_id AS id,
          ar.source_document_id AS sourceDocumentId,
          ar.relation_type AS relationType,
          ar.provenance,
          ar.evidence_text AS evidenceText,
          ar.evidence_locator AS evidenceLocator,
          ar.source_ref AS sourceRef,
          ar.builder_method AS builderMethod,
          ar.builder_version AS builderVersion,
          ar.review_status AS reviewStatus,
          ar.reviewed_at AS reviewedAt,
          a.id AS authorityId,
          a.official_name AS officialName,
          a.acronym,
          a.authority_type AS authorityType,
          a.jurisdiction,
          a.source_url AS authoritySourceUrl,
          a.checked_at AS checkedAt
        FROM authority_relationships ar
        JOIN authorities a ON a.id = ar.target_authority_id
        WHERE ar.source_document_id = ?
        ORDER BY a.official_name ASC, ar.relationship_id ASC
      `)
      .all(documentId) as AuthorityRelationshipRow[];
    const legalNatureRow = this.database
      .prepare(`
        SELECT
          document_id AS documentId,
          instrument_type AS instrumentType,
          compliance_expectation AS complianceExpectation,
          current_status AS currentStatus,
          under_review AS underReview,
          application_date AS applicationDate,
          status_checked_at AS statusCheckedAt,
          legal_basis_evidence_text AS legalBasisEvidenceText,
          legal_basis_evidence_entity_id AS legalBasisEvidenceEntityId,
          legal_basis_source_url AS legalBasisSourceUrl,
          application_evidence_text AS applicationEvidenceText,
          application_evidence_entity_id AS applicationEvidenceEntityId,
          application_source_url AS applicationSourceUrl,
          status_source_url AS statusSourceUrl,
          provenance,
          review_status AS reviewStatus,
          reviewed_at AS reviewedAt
        FROM legal_natures
        WHERE document_id = ?
      `)
      .get(documentId) as LegalNatureRow | undefined;

    const domainAssignments: DomainAssignment[] = domainRows.map((row) => ({
      id: row.id,
      domain: {
        id: row.domainId,
        parentId: row.parentId,
        label: row.domainLabel,
        description: row.domainDescription,
        taxonomyId: row.taxonomyId,
        taxonomyVersion: row.taxonomyVersion,
        provenance: row.domainProvenance,
        reviewStatus: row.domainReviewStatus,
        reviewedAt: row.domainReviewedAt,
      },
      targetDocumentId: row.targetDocumentId,
      targetEntityId: row.targetEntityId,
      targetKind: row.targetKind,
      targetLabel: row.targetLabel,
      targetPath: row.targetPath,
      role: row.role,
      provenance: row.provenance,
      assignmentVersion: row.assignmentVersion,
      reviewStatus: row.reviewStatus,
      reviewedAt: row.reviewedAt,
      rationale: row.rationale,
      reviewNote: row.reviewNote,
      evidenceLocator: row.evidenceLocator,
    }));
    const authorityRelationships: AuthorityRelationship[] = authorityRows.map(
      (row) => ({
        id: row.id,
        sourceDocumentId: row.sourceDocumentId,
        relationType: row.relationType,
        target: {
          id: row.authorityId,
          officialName: row.officialName,
          acronym: row.acronym,
          authorityType: row.authorityType,
          jurisdiction: row.jurisdiction,
          sourceUrl: row.authoritySourceUrl,
          checkedAt: row.checkedAt,
        },
        provenance: row.provenance,
        evidenceText: row.evidenceText,
        evidenceLocator: row.evidenceLocator,
        sourceRef: row.sourceRef,
        builder: {
          method: row.builderMethod,
          version: row.builderVersion,
        },
        reviewStatus: row.reviewStatus,
        reviewedAt: row.reviewedAt,
      }),
    );
    const legalNature: LegalNature | null = legalNatureRow
      ? { ...legalNatureRow, underReview: legalNatureRow.underReview === 1 }
      : null;

    return documentRegulatoryContextSchema.parse({
      documentId,
      provisionId,
      buildId: this.buildId,
      profileId: this.profileId,
      taxonomyId: this.regulatoryDomainTaxonomyId,
      taxonomyVersion: this.regulatoryDomainTaxonomyVersion,
      domainAssignments,
      authorityRelationships,
      legalNature,
    });
  }

  findDocumentVersionChain(documentId: string): DocumentVersionChain | null {
    const chain = this.database
      .prepare(`
        SELECT
          coverage,
          checked_at AS checkedAt,
          loaded_version_id AS loadedVersionId
        FROM document_version_chains
        WHERE document_id = ?
      `)
      .get(documentId) as VersionChainRow | undefined;
    if (!chain) return null;

    const nodeRows = this.database
      .prepare(`
        SELECT
          id,
          document_id AS documentId,
          kind,
          label,
          version_date AS date,
          source_url AS sourceUrl,
          availability
        FROM document_versions
        WHERE document_id = ?
        ORDER BY
          CASE kind
            WHEN 'original-oj-snapshot' THEN 0
            WHEN 'consolidated-snapshot' THEN 0
            WHEN 'current-version-link' THEN 1
            ELSE 2
          END,
          version_date ASC,
          id ASC
      `)
      .all(documentId) as VersionNodeRow[];
    const edges = this.database
      .prepare(`
        SELECT
          id,
          document_id AS documentId,
          source_version_id AS sourceVersionId,
          relation_type AS relationType,
          target_version_id AS targetVersionId,
          provenance,
          source_ref AS sourceRef
        FROM document_version_edges
        WHERE document_id = ?
        ORDER BY
          CASE relation_type WHEN 'CURRENT_VERSION_LINK' THEN 0 ELSE 1 END,
          id ASC
      `)
      .all(documentId) as VersionEdgeRow[];

    return documentVersionChainSchema.parse({
      documentId,
      buildId: this.buildId,
      coverage: chain.coverage,
      checkedAt: chain.checkedAt ?? undefined,
      loadedVersionId: chain.loadedVersionId,
      nodes: nodeRows.map((node) => ({
        ...node,
        date: node.date ?? undefined,
      })),
      edges,
    });
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
          d.local_id AS localId,
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
        celex: row.celex ?? undefined,
        localId: row.localId ?? undefined,
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

  findFamilyLevel2(
    familyId: string,
    measureType?: "rts" | "its",
  ): FamilyLevel2Response | null {
    const primary = this.database
      .prepare(`
        SELECT family_id AS familyId, short_name AS familyShortName
        FROM documents
        WHERE family_id = ? AND regulatory_level = 'level-1'
        ORDER BY display_order ASC
        LIMIT 1
      `)
      .get(familyId) as FamilyPrimaryRow | undefined;
    if (!primary) return null;

    const countRows = this.database
      .prepare(`
        SELECT measure_type AS measureType, count(*) AS count
        FROM documents
        WHERE family_id = ? AND regulatory_level = 'level-2'
        GROUP BY measure_type
      `)
      .all(familyId) as Array<{ measureType: string; count: number }>;
    const counts = { rts: 0, its: 0, guidelines: 0 };
    for (const row of countRows) {
      if (row.measureType === "rts") counts.rts = row.count;
      else if (row.measureType === "its") counts.its = row.count;
      else if (row.measureType === "guideline") counts.guidelines = row.count;
    }

    const rows = this.database
      .prepare(`
        SELECT
          d.id,
          d.slug,
          d.short_name AS shortName,
          d.official_title AS officialTitle,
          d.celex,
          d.measure_type AS measureType,
          d.publication_date AS publicationDate,
          d.source_url AS sourceUrl,
          d.source_status_json AS sourceStatusJson,
          d.default_path AS readerPath,
          te.id AS articleEntityId,
          td.id AS mandateDocumentId,
          td.short_name AS mandateDocumentShortName,
          te.label AS mandateLabel,
          te.title AS mandateTitle,
          te.path AS mandatePath
        FROM documents d
        LEFT JOIN relationships r
          ON r.source_entity_id = d.id
          AND r.relation_type = 'ADOPTED_UNDER'
          AND r.provenance = 'OFFICIAL_MAPPING'
        LEFT JOIN legal_entities te ON te.id = r.target_entity_id
        LEFT JOIN documents td ON td.id = te.document_id
        WHERE d.family_id = @familyId AND d.regulatory_level = 'level-2'
        ORDER BY d.publication_date DESC, d.short_name ASC, te.path ASC
      `)
      .all({ familyId }) as Level2MeasureRow[];
    const measures = new Map<string, Level2Measure>();
    for (const row of rows) {
      if (measureType && row.measureType !== measureType) continue;
      const measure = measures.get(row.id) ?? {
        id: row.id,
        slug: row.slug,
        shortName: row.shortName,
        officialTitle: row.officialTitle,
        celex: row.celex,
        measureType: row.measureType,
        publicationDate: row.publicationDate,
        sourceUrl: row.sourceUrl,
        sourceStatus: row.sourceStatusJson
          ? sourceStatusSchema.parse(JSON.parse(row.sourceStatusJson))
          : undefined,
        explorerPath: explorerPath(row.slug),
        readerPath: row.readerPath,
        mandates: [],
      };
      if (
        row.articleEntityId &&
        row.mandateDocumentId &&
        row.mandateDocumentShortName &&
        row.mandateLabel &&
        row.mandatePath &&
        !measure.mandates.some(
          (mandate) => mandate.articleEntityId === row.articleEntityId,
        )
      ) {
        measure.mandates.push({
          articleEntityId: row.articleEntityId,
          documentId: row.mandateDocumentId,
          documentShortName: row.mandateDocumentShortName,
          label: row.mandateLabel,
          title: row.mandateTitle,
          path: row.mandatePath,
        });
      }
      measures.set(row.id, measure);
    }

    return familyLevel2ResponseSchema.parse({
      ...primary,
      counts,
      measures: [...measures.values()],
    });
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
      implements: outgoing
        .filter((row) => row.relationType === "IMPLEMENTS")
        .map((row) => toProvisionRelationship(row)),
      relatedDocuments: outgoing
        .filter((row) => row.relationType === "RELATED_DOCUMENT")
        .map((row) => toProvisionRelationship(row)),
      relatedRecitals: outgoing
        .filter((row) => row.relationType === "RELATED_RECITAL")
        .map((row) => toProvisionRelationship(row)),
    });
  }

  findDocumentRelationships(
    documentId: string,
  ): DocumentRelationshipsResponse | null {
    const document = this.database
      .prepare(
        `SELECT id FROM legal_entities
         WHERE id = ? AND document_id = ? AND kind = 'document'`,
      )
      .get(documentId, documentId);
    if (!document) return null;

    const rows = this.database
      .prepare(`
        ${RELATIONSHIP_SELECT}
        WHERE (se.document_id = @documentId OR te.document_id = @documentId)
          AND se.document_id != te.document_id
        ORDER BY
          sd.display_order ASC,
          td.display_order ASC,
          relationType ASC,
          sourcePath ASC,
          targetPath ASC,
          id ASC
      `)
      .all({ documentId }) as RelationshipRow[];

    return documentRelationshipsResponseSchema.parse({
      documentId,
      buildId: this.buildId,
      relationships: rows.map((row) => toProvisionRelationship(row)),
    });
  }

  listCrossDocumentRelationships(): ProvisionRelationship[] {
    const rows = this.database
      .prepare(`
        ${RELATIONSHIP_SELECT}
        WHERE se.document_id != te.document_id
        ORDER BY
          sd.display_order ASC,
          td.display_order ASC,
          relationType ASC,
          sourcePath ASC,
          targetPath ASC,
          id ASC
      `)
      .all() as RelationshipRow[];
    return rows.map((row) => toProvisionRelationship(row));
  }

  findDocumentLifecycleRelationships(
    documentId: string,
  ): DocumentLifecycleRelationshipsResponse | null {
    const work = this.database
      .prepare("SELECT id FROM legal_works WHERE loaded_document_id = ?")
      .get(documentId);
    if (!work) return null;

    const rows = this.database
      .prepare(`
        ${LIFECYCLE_RELATIONSHIP_SELECT}
        WHERE sw.loaded_document_id = @documentId
          OR tw.loaded_document_id = @documentId
        ORDER BY
          relationType ASC,
          sourceCelex ASC,
          targetCelex ASC,
          id ASC
      `)
      .all({ documentId }) as LifecycleRelationshipRow[];

    return documentLifecycleRelationshipsResponseSchema.parse({
      documentId,
      buildId: this.buildId,
      relationships: rows.map(toLifecycleRelationship),
    });
  }

  listLifecycleRelationships(): LifecycleRelationship[] {
    const rows = this.database
      .prepare(`
        ${LIFECYCLE_RELATIONSHIP_SELECT}
        ORDER BY relationType ASC, sourceCelex ASC, targetCelex ASC, id ASC
      `)
      .all() as LifecycleRelationshipRow[];
    return rows.map(toLifecycleRelationship);
  }

  findDocumentCaseLawRelationships(
    documentId: string,
  ): DocumentCaseLawRelationshipsResponse | null {
    const document = this.database
      .prepare("SELECT id FROM documents WHERE id = ?")
      .get(documentId);
    if (!document) return null;

    const rows = this.database
      .prepare(`
        ${CASE_LAW_RELATIONSHIP_SELECT}
        WHERE clr.target_document_id = @documentId
        ORDER BY decisionDate DESC, caseCelex ASC, id ASC
      `)
      .all({ documentId }) as CaseLawRelationshipRow[];

    return documentCaseLawRelationshipsResponseSchema.parse({
      documentId,
      buildId: this.buildId,
      relationships: rows.map(toCaseLawRelationship),
    });
  }

  listCaseLawRelationships(): CaseLawRelationship[] {
    const rows = this.database
      .prepare(`
        ${CASE_LAW_RELATIONSHIP_SELECT}
        ORDER BY decisionDate DESC, caseCelex ASC, id ASC
      `)
      .all() as CaseLawRelationshipRow[];
    return rows.map(toCaseLawRelationship);
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
