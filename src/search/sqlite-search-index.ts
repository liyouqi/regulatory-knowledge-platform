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
import {
  APPLICABILITY_RULE_BUILDER,
  APPLICABILITY_RULE_BUILDER_VERSION,
  DEFAULT_APPLICABILITY_RULES_PATH,
  buildApplicabilityRules,
  loadApplicabilityRuleDataset,
} from "../applicability/applicability-rule";
import { toExplorerView } from "../canonical/to-explorer-view";
import {
  DEFAULT_SUPERVISORY_DECISIONS_PATH,
  SUPERVISORY_DECISION_BUILDER,
  SUPERVISORY_DECISION_BUILDER_VERSION,
  buildSupervisoryDecisions,
  loadSupervisoryDecisionDataset,
} from "../decisions/supervisory-decision";
import {
  DEFAULT_AUTHORITIES_PATH,
  DEFAULT_LEGAL_NATURES_PATH,
  DEFAULT_REGULATORY_DOMAINS_PATH,
  REGULATORY_CONTEXT_BUILDER,
  REGULATORY_CONTEXT_BUILDER_VERSION,
  buildRegulatoryContext,
  loadAuthorityDataset,
  loadLegalNatureDataset,
  loadRegulatoryDomainDataset,
} from "../regulatory-context/regulatory-context";
import {
  CELLAR_CASE_LAW_BUILDER,
  CELLAR_CASE_LAW_BUILDER_VERSION,
  buildCellarCaseLaw,
  loadCellarCaseLawMetadata,
} from "../relationships/cellar-case-law";
import {
  CELLAR_LIFECYCLE_BUILDER,
  CELLAR_LIFECYCLE_BUILDER_VERSION,
  buildCellarLifecycle,
  loadCellarLifecycleRelations,
} from "../relationships/cellar-lifecycle";
import {
  CELLAR_RELATIONSHIP_BUILDER,
  CELLAR_RELATIONSHIP_BUILDER_VERSION,
  buildCellarOfficialRelations,
  loadCellarOfficialRelations,
} from "../relationships/cellar-official-relations";
import {
  EXPLICIT_REFERENCE_BUILDER,
  EXPLICIT_REFERENCE_BUILDER_VERSION,
  buildExplicitReferences,
} from "../relationships/explicit-reference";
import {
  GUIDELINE_MAPPING_BUILDER,
  GUIDELINE_MAPPING_BUILDER_VERSION,
  buildGuidelineMappings,
  loadGuidelineMappings,
} from "../relationships/guideline-mapping";
import {
  NATIONAL_IMPLEMENTATION_BUILDER,
  NATIONAL_IMPLEMENTATION_BUILDER_VERSION,
  buildNationalImplementationMappings,
  loadNationalImplementationMappings,
} from "../relationships/national-implementation";
import {
  OFFICIAL_MAPPING_BUILDER,
  OFFICIAL_MAPPING_BUILDER_VERSION,
  buildOfficialMappings,
  loadOfficialMappings,
} from "../relationships/official-mapping";
import {
  type RelatedRecitalEvaluation,
  TFIDF_RELATED_RECITAL_BUILDER,
  TFIDF_RELATED_RECITAL_BUILDER_VERSION,
  buildTfidfRelatedRecitals,
  loadRelatedRecitalBenchmark,
} from "../relationships/tfidf-related-recital";
import {
  DEFAULT_EDITION_PROFILE,
  type EditionProfile,
  type RuntimeSourceDefinition,
  compileEditionProfile,
} from "../runtime/edition-profile";
import {
  type BodyBlock,
  type DocumentView,
  type ProvisionView,
  documentViewSchema,
  explorerDocumentSchema,
} from "../shared/legal";
import {
  DEFAULT_IMPLEMENTATION_TIMELINES_PATH,
  IMPLEMENTATION_TIMELINE_BUILDER,
  IMPLEMENTATION_TIMELINE_BUILDER_VERSION,
  buildImplementationTimelineEvents,
  loadImplementationTimelineDataset,
} from "../timelines/implementation-timeline";
import {
  DEFAULT_REGULATORY_TOPICS_PATH,
  REGULATORY_TOPIC_BUILDER,
  REGULATORY_TOPIC_BUILDER_VERSION,
  buildRegulatoryTopics,
  loadRegulatoryTopicDataset,
} from "../topics/regulatory-topic";
import {
  DOCUMENT_VERSION_CHAIN_BUILDER,
  DOCUMENT_VERSION_CHAIN_BUILDER_VERSION,
  buildDocumentVersionChain,
} from "../versions/document-version-chain";
import { normalizeSearchText } from "./current-document-search";

export const RUNTIME_DATABASE_SCHEMA_VERSION = "5.4.0";
export const DEFAULT_RUNTIME_DATABASE_PATH = resolve(
  process.cwd(),
  "data/artifacts/runtime/regulatory.sqlite",
);

export interface RuntimeDatabaseManifest {
  schemaVersion: typeof RUNTIME_DATABASE_SCHEMA_VERSION;
  buildId: string;
  builtAt: string;
  profileId: string;
  profileVersion: string;
  profileDisplayName: string;
  profileHash: string;
  regulatoryDomainTaxonomyId: string;
  regulatoryDomainTaxonomyVersion: string;
  regulatoryTopicTaxonomyId: string;
  regulatoryTopicTaxonomyVersion: string;
  regulatoryTopicTaxonomyReviewedAt: string;
  documentCount: number;
  recordCount: number;
  definitionCount: number;
  relationshipCount: number;
  cellarRelationshipCount: number;
  lifecycleRelationshipCount: number;
  externalWorkCount: number;
  caseCount: number;
  caseLawRelationshipCount: number;
  relatedRecitalCount: number;
  versionNodeCount: number;
  versionEdgeCount: number;
  domainCount: number;
  domainAssignmentCount: number;
  authorityCount: number;
  authorityRelationshipCount: number;
  timelineEventCount: number;
  supervisoryDecisionCount: number;
  supervisoryDecisionFindingCount: number;
  applicabilityRuleCount: number;
  applicabilityEvidenceCount: number;
  topicCount: number;
  topicAssignmentCount: number;
  tfidfBenchmark: RelatedRecitalEvaluation | null;
  unresolvedReferenceCount: number;
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

interface DefinitionRow {
  definitionId: string;
  documentId: string;
  provisionId: string;
  term: string;
  normalizedTerm: string;
  definitionText: string;
  definitionType: "direct" | "incorporated";
  label: string;
  title: string | null;
  marker: string | null;
  path: string;
}

const DEFINITION_TERM_PATTERN = /^(.{1,240}?)\s+means(?:\s|:)/iu;

function completeBlockText(block: BodyBlock): string {
  return [
    block.text,
    ...block.children.map((child) =>
      [child.marker, completeBlockText(child)].filter(Boolean).join(" "),
    ),
  ]
    .filter(Boolean)
    .join(" ");
}

function definitionRowsForBlocks(
  document: DocumentView,
  provision: ProvisionView,
  blocks: BodyBlock[],
): DefinitionRow[] {
  return blocks.flatMap((block) => {
    const match =
      block.kind === "point"
        ? block.text.trim().match(DEFINITION_TERM_PATTERN)
        : null;
    const term = match?.[1]?.trim().replace(/^[“”‘’"']+|[“”‘’"']+$/gu, "");
    const definitionType: DefinitionRow["definitionType"] =
      /\bas defined in\b/iu.test(block.text) ? "incorporated" : "direct";
    const current = term
      ? [
          {
            definitionId: `${block.id}:definition`,
            documentId: document.id,
            provisionId: provision.id,
            term,
            normalizedTerm: normalizeSearchText(term),
            definitionText: completeBlockText(block),
            definitionType,
            label: provision.label,
            title: provision.title ?? null,
            marker: block.marker ?? null,
            path: `${provision.path}#${block.anchor}`,
          },
        ]
      : [];
    return [
      ...current,
      ...definitionRowsForBlocks(document, provision, block.children),
    ];
  });
}

function definitionRows(documents: DocumentView[]): DefinitionRow[] {
  return documents.flatMap((document) =>
    document.provisions
      .filter((provision) =>
        /^definitions?$/iu.test(provision.title?.trim() ?? ""),
      )
      .flatMap((provision) =>
        definitionRowsForBlocks(document, provision, provision.blocks),
      ),
  );
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

function runtimeBuildId(
  profile: EditionProfile,
  profileHash: string,
  documents: DocumentView[],
  officialMappings: ReturnType<typeof loadOfficialMappings>,
  guidelineMappings: ReturnType<typeof loadGuidelineMappings>,
  nationalImplementationMappings: ReturnType<
    typeof loadNationalImplementationMappings
  >,
  cellarRelations: ReturnType<typeof loadCellarOfficialRelations>,
  lifecycleRelations: ReturnType<typeof loadCellarLifecycleRelations>,
  caseLawMetadata: ReturnType<typeof loadCellarCaseLawMetadata>,
  relatedRecitalBenchmark: ReturnType<typeof loadRelatedRecitalBenchmark>,
  regulatoryDomainDataset: ReturnType<typeof loadRegulatoryDomainDataset>,
  authorityDataset: ReturnType<typeof loadAuthorityDataset>,
  legalNatureDataset: ReturnType<typeof loadLegalNatureDataset>,
  implementationTimelineDataset: ReturnType<
    typeof loadImplementationTimelineDataset
  >,
  supervisoryDecisionDataset: ReturnType<typeof loadSupervisoryDecisionDataset>,
  applicabilityRuleDataset: ReturnType<typeof loadApplicabilityRuleDataset>,
  regulatoryTopicDataset: ReturnType<typeof loadRegulatoryTopicDataset>,
): string {
  const input = documents
    .map((document) => `${document.id}@${document.buildId}`)
    .sort()
    .join("\n");
  const hash = createHash("sha256")
    .update(
      [
        RUNTIME_DATABASE_SCHEMA_VERSION,
        `${profile.id}@${profile.version}`,
        profileHash,
        `${EXPLICIT_REFERENCE_BUILDER}@${EXPLICIT_REFERENCE_BUILDER_VERSION}`,
        `${OFFICIAL_MAPPING_BUILDER}@${OFFICIAL_MAPPING_BUILDER_VERSION}`,
        JSON.stringify(officialMappings),
        `${GUIDELINE_MAPPING_BUILDER}@${GUIDELINE_MAPPING_BUILDER_VERSION}`,
        JSON.stringify(guidelineMappings),
        `${NATIONAL_IMPLEMENTATION_BUILDER}@${NATIONAL_IMPLEMENTATION_BUILDER_VERSION}`,
        JSON.stringify(nationalImplementationMappings),
        `${CELLAR_RELATIONSHIP_BUILDER}@${CELLAR_RELATIONSHIP_BUILDER_VERSION}`,
        JSON.stringify(cellarRelations),
        `${CELLAR_LIFECYCLE_BUILDER}@${CELLAR_LIFECYCLE_BUILDER_VERSION}`,
        JSON.stringify(lifecycleRelations),
        `${CELLAR_CASE_LAW_BUILDER}@${CELLAR_CASE_LAW_BUILDER_VERSION}`,
        JSON.stringify(caseLawMetadata),
        `${TFIDF_RELATED_RECITAL_BUILDER}@${TFIDF_RELATED_RECITAL_BUILDER_VERSION}`,
        JSON.stringify(relatedRecitalBenchmark),
        `${DOCUMENT_VERSION_CHAIN_BUILDER}@${DOCUMENT_VERSION_CHAIN_BUILDER_VERSION}`,
        `${REGULATORY_CONTEXT_BUILDER}@${REGULATORY_CONTEXT_BUILDER_VERSION}`,
        JSON.stringify(regulatoryDomainDataset),
        JSON.stringify(authorityDataset),
        JSON.stringify(legalNatureDataset),
        `${IMPLEMENTATION_TIMELINE_BUILDER}@${IMPLEMENTATION_TIMELINE_BUILDER_VERSION}`,
        JSON.stringify(implementationTimelineDataset),
        `${SUPERVISORY_DECISION_BUILDER}@${SUPERVISORY_DECISION_BUILDER_VERSION}`,
        JSON.stringify(supervisoryDecisionDataset),
        `${APPLICABILITY_RULE_BUILDER}@${APPLICABILITY_RULE_BUILDER_VERSION}`,
        JSON.stringify(applicabilityRuleDataset),
        `${REGULATORY_TOPIC_BUILDER}@${REGULATORY_TOPIC_BUILDER_VERSION}`,
        JSON.stringify(regulatoryTopicDataset),
        input,
      ].join("\n"),
    )
    .digest("hex")
    .slice(0, 16);
  return `runtime-${RUNTIME_DATABASE_SCHEMA_VERSION}-${hash}`;
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

export function buildRuntimeDatabase(
  inputDocuments: DocumentView[],
  inputSources: RuntimeSourceDefinition[] = [],
  outputPath = DEFAULT_RUNTIME_DATABASE_PATH,
  profile: EditionProfile = DEFAULT_EDITION_PROFILE,
): RuntimeDatabaseManifest {
  if (inputDocuments.length === 0)
    throw new Error("Cannot build an empty runtime database");
  const compilation = compileEditionProfile(
    profile,
    inputDocuments,
    inputSources,
  );
  const { documents, sources, profileHash, excludedCelexes } = compilation;
  const resolvedOutput = resolve(outputPath);
  mkdirSync(dirname(resolvedOutput), { recursive: true });
  const temporaryPath = `${resolvedOutput}.${process.pid}.tmp`;
  if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  const database = new Database(temporaryPath);
  const rows = indexRows(documents);
  const definitions = definitionRows(documents);
  const versionChains = documents.flatMap((document) => {
    const chain = buildDocumentVersionChain(document);
    return chain ? [chain] : [];
  });
  const versionNodes = versionChains.flatMap((chain) => chain.nodes);
  const versionEdges = versionChains.flatMap((chain) => chain.edges);
  const relationshipBuild = buildExplicitReferences(documents);
  const implementationTimelineDataset = loadImplementationTimelineDataset(
    DEFAULT_IMPLEMENTATION_TIMELINES_PATH,
  );
  const implementationTimelineEvents = buildImplementationTimelineEvents(
    documents,
    implementationTimelineDataset,
  );
  const regulatoryDomainDataset = loadRegulatoryDomainDataset(
    DEFAULT_REGULATORY_DOMAINS_PATH,
  );
  const authorityDataset = loadAuthorityDataset(DEFAULT_AUTHORITIES_PATH);
  const legalNatureDataset = loadLegalNatureDataset(DEFAULT_LEGAL_NATURES_PATH);
  const supervisoryDecisionDataset = loadSupervisoryDecisionDataset(
    DEFAULT_SUPERVISORY_DECISIONS_PATH,
  );
  const supervisoryDecisionBuild = buildSupervisoryDecisions(
    documents,
    relationshipBuild.entities,
    authorityDataset.authorities,
    supervisoryDecisionDataset,
    inputSources.length > 0
      ? new Set(inputDocuments.map((document) => document.id))
      : null,
  );
  const applicabilityRuleDataset = loadApplicabilityRuleDataset(
    DEFAULT_APPLICABILITY_RULES_PATH,
  );
  const applicabilityRuleBuild = buildApplicabilityRules(
    documents,
    applicabilityRuleDataset,
    inputSources.length > 0
      ? new Set(inputDocuments.map((document) => document.id))
      : null,
  );
  const regulatoryContextBuild = buildRegulatoryContext(
    documents,
    relationshipBuild.entities,
    inputSources.length > 0
      ? new Set(inputDocuments.map((document) => document.id))
      : null,
    regulatoryDomainDataset,
    authorityDataset,
    legalNatureDataset,
    supervisoryDecisionBuild.authorityIds,
  );
  const regulatoryTopicDataset = loadRegulatoryTopicDataset(
    DEFAULT_REGULATORY_TOPICS_PATH,
  );
  const regulatoryTopicBuild = buildRegulatoryTopics(
    documents,
    relationshipBuild.entities,
    inputSources.length > 0
      ? new Set(inputDocuments.map((document) => document.id))
      : null,
    regulatoryTopicDataset,
  );
  const sourceByIdentifier = new Map(
    sources.flatMap((source) => {
      const identifier = source.celex ?? source.localId;
      return identifier ? [[identifier, source] as const] : [];
    }),
  );
  const sourceByCelex = new Map(
    sources.flatMap((source) =>
      source.celex ? [[source.celex, source] as const] : [],
    ),
  );
  const registeredCelex = new Set(sourceByCelex.keys());
  const loadedCelex = new Set(
    documents.flatMap((document) => (document.celex ? [document.celex] : [])),
  );
  const officialMappings = loadOfficialMappings().filter(
    (mapping) =>
      registeredCelex.has(mapping.level1.celex) &&
      registeredCelex.has(mapping.level2.celex),
  );
  for (const mapping of officialMappings) {
    const level1Source = sourceByCelex.get(mapping.level1.celex);
    const level2Source = sourceByCelex.get(mapping.level2.celex);
    if (
      level1Source?.familyId !== mapping.familyId ||
      level2Source?.familyId !== mapping.familyId ||
      level2Source.regulatoryLevel !== "level-2" ||
      level2Source.measureType !== mapping.level2.measureType
    ) {
      throw new Error(`Source registry mismatch for ${mapping.id}`);
    }
  }
  const officialRelationships = buildOfficialMappings(
    documents,
    relationshipBuild.entities,
    officialMappings,
  );
  const loadedDocumentIds = new Set(documents.map((document) => document.id));
  const guidelineMappings = loadGuidelineMappings().filter(
    (mapping) =>
      loadedDocumentIds.has(mapping.primaryAct.documentId) &&
      loadedDocumentIds.has(mapping.guideline.documentId),
  );
  const guidelineRelationships = buildGuidelineMappings(
    documents,
    relationshipBuild.entities,
    guidelineMappings,
  );
  const nationalImplementationMappings =
    loadNationalImplementationMappings().filter(
      (mapping) =>
        loadedDocumentIds.has(mapping.implementingDocumentId) &&
        loadedDocumentIds.has(mapping.implementedDocumentId),
    );
  const nationalImplementationRelationships =
    buildNationalImplementationMappings(
      documents,
      relationshipBuild.entities,
      nationalImplementationMappings,
    );
  const cellarRelations = loadCellarOfficialRelations().filter(
    (record) =>
      registeredCelex.has(record.sourceCelex) &&
      registeredCelex.has(record.targetCelex),
  );
  const cellarRelationships = buildCellarOfficialRelations(
    documents,
    relationshipBuild.entities,
    cellarRelations,
  );
  const lifecycleRelations = loadCellarLifecycleRelations().filter(
    (record) =>
      !excludedCelexes.has(record.sourceCelex) &&
      !excludedCelexes.has(record.targetCelex) &&
      (loadedCelex.has(record.sourceCelex) ||
        loadedCelex.has(record.targetCelex)),
  );
  const lifecycleBuild = buildCellarLifecycle(documents, lifecycleRelations);
  const caseLawMetadata = loadCellarCaseLawMetadata().filter((record) =>
    loadedCelex.has(record.targetCelex),
  );
  const caseLawBuild = buildCellarCaseLaw(documents, caseLawMetadata);
  const relatedRecitalBenchmark = loadRelatedRecitalBenchmark();
  const benchmarkDocumentIds = new Set(
    relatedRecitalBenchmark.cases.map((item) => item.documentId),
  );
  const canEvaluateRelatedRecitals = [...benchmarkDocumentIds].every(
    (documentId) => loadedDocumentIds.has(documentId),
  );
  const relatedRecitalBuild = canEvaluateRelatedRecitals
    ? buildTfidfRelatedRecitals(documents, relatedRecitalBenchmark)
    : null;
  const relationships = [
    ...relationshipBuild.relationships,
    ...officialRelationships,
    ...guidelineRelationships,
    ...nationalImplementationRelationships,
    ...cellarRelationships,
    ...(relatedRecitalBuild?.relationships ?? []),
  ];
  const buildId = runtimeBuildId(
    compilation.profile,
    profileHash,
    documents,
    officialMappings,
    guidelineMappings,
    nationalImplementationMappings,
    cellarRelations,
    lifecycleRelations,
    caseLawMetadata,
    relatedRecitalBenchmark,
    regulatoryDomainDataset,
    authorityDataset,
    legalNatureDataset,
    implementationTimelineDataset,
    supervisoryDecisionDataset,
    applicabilityRuleDataset,
    regulatoryTopicDataset,
  );
  const builtAt = new Date().toISOString();
  let completed = false;

  try {
    database.pragma("journal_mode = OFF");
    database.pragma("synchronous = OFF");
    database.pragma("foreign_keys = ON");
    assertFts5(database);
    database.exec(`
      CREATE TABLE build_manifest (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      ) STRICT;
      CREATE TABLE documents (
        id TEXT PRIMARY KEY,
        jurisdiction TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        celex TEXT UNIQUE,
        local_id TEXT UNIQUE,
        short_name TEXT NOT NULL,
        official_title TEXT NOT NULL,
        document_type TEXT NOT NULL,
        publication_date TEXT NOT NULL,
        source_url TEXT NOT NULL,
        source_status_json TEXT,
        last_checked TEXT NOT NULL,
        source_version TEXT NOT NULL,
        canonical_build_id TEXT NOT NULL,
        provenance TEXT NOT NULL CHECK (provenance IN ('official', 'fixture')),
        family_id TEXT NOT NULL,
        regulatory_level TEXT NOT NULL CHECK (regulatory_level IN ('level-1', 'level-2', 'level-3')),
        measure_type TEXT NOT NULL CHECK (measure_type IN ('primary-act', 'rts', 'its', 'guideline', 'qa', 'other')),
        default_path TEXT NOT NULL,
        display_order INTEGER NOT NULL,
        CHECK (celex IS NOT NULL OR local_id IS NOT NULL)
      ) STRICT;
      CREATE TABLE document_views (
        document_id TEXT PRIMARY KEY REFERENCES documents(id),
        reader_payload_json TEXT NOT NULL,
        explorer_payload_json TEXT NOT NULL
      ) STRICT;
      CREATE TABLE document_versions (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES documents(id),
        kind TEXT NOT NULL CHECK (kind IN (
          'original-oj-snapshot', 'consolidated-snapshot',
          'current-version-link', 'corrigendum'
        )),
        label TEXT NOT NULL,
        version_date TEXT,
        source_url TEXT NOT NULL,
        availability TEXT NOT NULL CHECK (availability IN ('loaded', 'external'))
      ) STRICT;
      CREATE INDEX document_versions_document_id ON document_versions(document_id);
      CREATE TABLE document_version_chains (
        document_id TEXT PRIMARY KEY REFERENCES documents(id),
        coverage TEXT NOT NULL CHECK (coverage = 'source-status-only'),
        checked_at TEXT,
        loaded_version_id TEXT NOT NULL REFERENCES document_versions(id)
      ) STRICT;
      CREATE TABLE document_version_edges (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES documents(id),
        source_version_id TEXT NOT NULL REFERENCES document_versions(id),
        relation_type TEXT NOT NULL CHECK (relation_type IN (
          'CURRENT_VERSION_LINK', 'HAS_CORRIGENDUM'
        )),
        target_version_id TEXT NOT NULL REFERENCES document_versions(id),
        provenance TEXT NOT NULL CHECK (provenance = 'OFFICIAL_METADATA'),
        source_ref TEXT NOT NULL,
        UNIQUE (
          source_version_id, relation_type, target_version_id,
          provenance, source_ref
        )
      ) STRICT;
      CREATE INDEX document_version_edges_document_id ON document_version_edges(document_id);
      CREATE TABLE document_aliases (
        document_id TEXT NOT NULL REFERENCES documents(id),
        alias TEXT NOT NULL,
        normalized_alias TEXT NOT NULL,
        display_order INTEGER NOT NULL,
        PRIMARY KEY (document_id, alias)
      ) STRICT;
      CREATE INDEX document_aliases_normalized ON document_aliases(normalized_alias);
      CREATE TABLE legal_works (
        id TEXT PRIMARY KEY,
        celex TEXT NOT NULL UNIQUE,
        cellar_work_uri TEXT NOT NULL UNIQUE,
        loaded_document_id TEXT UNIQUE REFERENCES documents(id),
        label TEXT NOT NULL,
        title TEXT,
        source_url TEXT NOT NULL,
        availability TEXT NOT NULL CHECK (availability IN ('loaded', 'external')),
        CHECK (
          (availability = 'loaded' AND loaded_document_id IS NOT NULL) OR
          (availability = 'external' AND loaded_document_id IS NULL)
        )
      ) STRICT;
      CREATE INDEX legal_works_loaded_document_id ON legal_works(loaded_document_id);
      CREATE TABLE lifecycle_relationships (
        relationship_id TEXT PRIMARY KEY,
        source_work_id TEXT NOT NULL REFERENCES legal_works(id),
        relation_type TEXT NOT NULL CHECK (relation_type IN ('AMENDS', 'CORRECTS')),
        target_work_id TEXT NOT NULL REFERENCES legal_works(id),
        provenance TEXT NOT NULL CHECK (provenance = 'OFFICIAL_METADATA'),
        evidence_text TEXT NOT NULL,
        evidence_locator TEXT NOT NULL,
        source_ref TEXT NOT NULL,
        builder_method TEXT NOT NULL,
        builder_version TEXT NOT NULL,
        resolution_status TEXT NOT NULL CHECK (resolution_status IN ('resolved', 'external')),
        build_id TEXT NOT NULL,
        UNIQUE (
          source_work_id, relation_type, target_work_id,
          provenance, evidence_locator
        )
      ) STRICT;
      CREATE INDEX lifecycle_relationships_source_work_id
        ON lifecycle_relationships(source_work_id);
      CREATE INDEX lifecycle_relationships_target_work_id
        ON lifecycle_relationships(target_work_id);
      CREATE TABLE case_entities (
        id TEXT PRIMARY KEY,
        celex TEXT NOT NULL UNIQUE,
        cellar_work_uri TEXT NOT NULL UNIQUE,
        ecli TEXT NOT NULL UNIQUE,
        case_number TEXT NOT NULL,
        case_name TEXT NOT NULL,
        decision_type TEXT NOT NULL CHECK (decision_type IN ('judgment', 'order')),
        decision_date TEXT NOT NULL,
        official_title TEXT NOT NULL,
        source_url TEXT NOT NULL
      ) STRICT;
      CREATE TABLE case_law_relationships (
        relationship_id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES case_entities(id),
        relation_type TEXT NOT NULL CHECK (relation_type = 'INTERPRETS'),
        target_document_id TEXT NOT NULL REFERENCES documents(id),
        provenance TEXT NOT NULL CHECK (provenance = 'OFFICIAL_METADATA'),
        evidence_text TEXT NOT NULL,
        evidence_locator TEXT NOT NULL,
        source_ref TEXT NOT NULL,
        builder_method TEXT NOT NULL,
        builder_version TEXT NOT NULL,
        resolution_status TEXT NOT NULL CHECK (resolution_status = 'metadata-only'),
        build_id TEXT NOT NULL,
        UNIQUE (
          case_id, relation_type, target_document_id,
          provenance, evidence_locator
        )
      ) STRICT;
      CREATE INDEX case_law_relationships_target_document_id
        ON case_law_relationships(target_document_id);
      CREATE TABLE legal_entities (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES documents(id),
        parent_entity_id TEXT REFERENCES legal_entities(id),
        root_provision_id TEXT REFERENCES legal_entities(id),
        kind TEXT NOT NULL,
        label TEXT NOT NULL,
        title TEXT,
        path TEXT NOT NULL
      ) STRICT;
      CREATE INDEX legal_entities_document_id ON legal_entities(document_id);
      CREATE INDEX legal_entities_root_provision_id ON legal_entities(root_provision_id);
      CREATE TABLE regulatory_domains (
        id TEXT PRIMARY KEY,
        parent_id TEXT REFERENCES regulatory_domains(id),
        label TEXT NOT NULL,
        description TEXT NOT NULL,
        taxonomy_id TEXT NOT NULL,
        taxonomy_version TEXT NOT NULL,
        provenance TEXT NOT NULL CHECK (provenance = 'EDITORIAL'),
        review_status TEXT NOT NULL CHECK (review_status = 'reviewed'),
        reviewed_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX regulatory_domains_parent_id ON regulatory_domains(parent_id);
      CREATE TABLE domain_assignments (
        assignment_id TEXT PRIMARY KEY,
        domain_id TEXT NOT NULL REFERENCES regulatory_domains(id),
        target_document_id TEXT NOT NULL REFERENCES documents(id),
        target_entity_id TEXT NOT NULL REFERENCES legal_entities(id),
        target_kind TEXT NOT NULL CHECK (target_kind IN ('document', 'provision')),
        role TEXT NOT NULL CHECK (role IN ('contains', 'primary')),
        provenance TEXT NOT NULL CHECK (provenance = 'EDITORIAL'),
        assignment_version TEXT NOT NULL,
        review_status TEXT NOT NULL CHECK (review_status = 'reviewed'),
        reviewed_at TEXT NOT NULL,
        rationale TEXT NOT NULL,
        review_note TEXT NOT NULL,
        evidence_locator TEXT NOT NULL,
        UNIQUE (domain_id, target_entity_id, role, assignment_version)
      ) STRICT;
      CREATE INDEX domain_assignments_target_document_id
        ON domain_assignments(target_document_id);
      CREATE INDEX domain_assignments_target_entity_id
        ON domain_assignments(target_entity_id);
      CREATE TABLE regulatory_topics (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        description TEXT NOT NULL,
        taxonomy_id TEXT NOT NULL CHECK (taxonomy_id = 'taxonomy:regulatory-topic'),
        taxonomy_version TEXT NOT NULL,
        provenance TEXT NOT NULL CHECK (provenance = 'EDITORIAL'),
        review_status TEXT NOT NULL CHECK (review_status = 'reviewed'),
        reviewed_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE topic_assignments (
        assignment_id TEXT PRIMARY KEY,
        topic_id TEXT NOT NULL REFERENCES regulatory_topics(id),
        target_document_id TEXT NOT NULL REFERENCES documents(id),
        target_entity_id TEXT NOT NULL REFERENCES legal_entities(id),
        target_kind TEXT NOT NULL CHECK (target_kind IN ('document', 'provision')),
        target_label TEXT NOT NULL,
        target_title TEXT,
        target_path TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('primary', 'supporting')),
        provenance TEXT NOT NULL CHECK (provenance = 'EDITORIAL'),
        assignment_version TEXT NOT NULL,
        review_status TEXT NOT NULL CHECK (review_status = 'reviewed'),
        reviewed_at TEXT NOT NULL,
        rationale TEXT NOT NULL,
        review_note TEXT NOT NULL,
        evidence_locator TEXT NOT NULL,
        UNIQUE (topic_id, target_entity_id, role, assignment_version)
      ) STRICT;
      CREATE INDEX topic_assignments_topic_id ON topic_assignments(topic_id);
      CREATE INDEX topic_assignments_document_id
        ON topic_assignments(target_document_id);
      CREATE TABLE authorities (
        id TEXT PRIMARY KEY,
        official_name TEXT NOT NULL,
        acronym TEXT,
        authority_type TEXT NOT NULL CHECK (authority_type IN (
          'legislative-institution', 'supervisory-authority'
        )),
        jurisdiction TEXT NOT NULL,
        source_url TEXT NOT NULL,
        checked_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE authority_relationships (
        relationship_id TEXT PRIMARY KEY,
        source_document_id TEXT NOT NULL REFERENCES documents(id),
        relation_type TEXT NOT NULL CHECK (relation_type = 'ISSUED_BY'),
        target_authority_id TEXT NOT NULL REFERENCES authorities(id),
        provenance TEXT NOT NULL CHECK (provenance = 'OFFICIAL_METADATA'),
        evidence_text TEXT NOT NULL,
        evidence_locator TEXT NOT NULL,
        source_ref TEXT NOT NULL,
        builder_method TEXT NOT NULL,
        builder_version TEXT NOT NULL,
        review_status TEXT NOT NULL CHECK (review_status = 'reviewed'),
        reviewed_at TEXT NOT NULL,
        UNIQUE (
          source_document_id, relation_type, target_authority_id,
          provenance, evidence_locator
        )
      ) STRICT;
      CREATE INDEX authority_relationships_source_document_id
        ON authority_relationships(source_document_id);
      CREATE TABLE legal_natures (
        document_id TEXT PRIMARY KEY REFERENCES documents(id),
        instrument_type TEXT NOT NULL CHECK (instrument_type = 'guideline'),
        compliance_expectation TEXT NOT NULL CHECK (
          compliance_expectation = 'make-every-effort-to-comply'
        ),
        current_status TEXT NOT NULL CHECK (current_status = 'in-force'),
        under_review INTEGER NOT NULL CHECK (under_review IN (0, 1)),
        application_date TEXT NOT NULL,
        status_checked_at TEXT NOT NULL,
        legal_basis_evidence_text TEXT NOT NULL,
        legal_basis_evidence_entity_id TEXT NOT NULL REFERENCES legal_entities(id),
        legal_basis_source_url TEXT NOT NULL,
        application_evidence_text TEXT NOT NULL,
        application_evidence_entity_id TEXT NOT NULL REFERENCES legal_entities(id),
        application_source_url TEXT NOT NULL,
        status_source_url TEXT NOT NULL,
        provenance TEXT NOT NULL CHECK (provenance = 'OFFICIAL_METADATA'),
        review_status TEXT NOT NULL CHECK (review_status = 'reviewed'),
        reviewed_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE implementation_timeline_events (
        event_id TEXT PRIMARY KEY,
        timeline_id TEXT NOT NULL,
        timeline_version TEXT NOT NULL,
        document_id TEXT NOT NULL REFERENCES documents(id),
        event_type TEXT NOT NULL CHECK (event_type IN (
          'publication', 'entry-into-force', 'general-application',
          'phased-application', 'transitional-period', 'measure-milestone'
        )),
        event_date TEXT NOT NULL,
        label TEXT NOT NULL,
        scope_label TEXT NOT NULL,
        date_basis TEXT NOT NULL CHECK (date_basis IN (
          'official-metadata', 'explicit-legal-text',
          'calculated-from-publication'
        )),
        source_entity_id TEXT NOT NULL REFERENCES legal_entities(id),
        source_label TEXT NOT NULL,
        source_path TEXT NOT NULL,
        source_locator_kind TEXT,
        source_locator_value TEXT,
        evidence_text TEXT NOT NULL,
        evidence_locator TEXT NOT NULL,
        source_url TEXT NOT NULL,
        derivation_json TEXT,
        provenance TEXT NOT NULL CHECK (provenance IN (
          'LEGAL_TEXT', 'OFFICIAL_METADATA', 'DERIVED'
        )),
        review_status TEXT NOT NULL CHECK (review_status = 'reviewed'),
        reviewed_at TEXT NOT NULL,
        builder_method TEXT NOT NULL,
        builder_version TEXT NOT NULL,
        CHECK (
          (source_locator_kind IS NULL AND source_locator_value IS NULL) OR
          (source_locator_kind IS NOT NULL AND source_locator_value IS NOT NULL)
        )
      ) STRICT;
      CREATE INDEX implementation_timeline_events_document_date
        ON implementation_timeline_events(document_id, event_date);
      CREATE TABLE supervisory_decisions (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        authority_id TEXT NOT NULL REFERENCES authorities(id),
        jurisdiction TEXT NOT NULL,
        decision_number TEXT NOT NULL,
        decision_date TEXT NOT NULL,
        decision_type TEXT NOT NULL CHECK (decision_type IN (
          'administrative-fine', 'corrective-measure',
          'fine-and-corrective-measure', 'case-closure'
        )),
        official_title TEXT NOT NULL,
        subject TEXT NOT NULL,
        respondent_label TEXT,
        target_document_id TEXT NOT NULL REFERENCES documents(id),
        source_page_url TEXT NOT NULL,
        source_document_url TEXT NOT NULL,
        source_document_sha256 TEXT NOT NULL,
        source_document_byte_count INTEGER NOT NULL CHECK (source_document_byte_count > 0),
        source_document_page_count INTEGER NOT NULL CHECK (source_document_page_count > 0),
        outcome_kind TEXT NOT NULL CHECK (outcome_kind IN (
          'administrative-fine', 'corrective-measure',
          'fine-and-corrective-measure', 'case-closure'
        )),
        fine_amount_minor INTEGER,
        fine_currency TEXT,
        outcome_evidence_text TEXT NOT NULL,
        outcome_evidence_locator TEXT NOT NULL,
        provenance TEXT NOT NULL CHECK (provenance = 'OFFICIAL_METADATA'),
        review_status TEXT NOT NULL CHECK (review_status = 'reviewed'),
        reviewed_at TEXT NOT NULL,
        builder_method TEXT NOT NULL,
        builder_version TEXT NOT NULL,
        CHECK (
          (fine_amount_minor IS NULL AND fine_currency IS NULL) OR
          (fine_amount_minor IS NOT NULL AND fine_currency IS NOT NULL)
        )
      ) STRICT;
      CREATE INDEX supervisory_decisions_target_document
        ON supervisory_decisions(target_document_id, decision_date);
      CREATE TABLE supervisory_decision_findings (
        relationship_id TEXT PRIMARY KEY,
        decision_id TEXT NOT NULL REFERENCES supervisory_decisions(id),
        relation_type TEXT NOT NULL CHECK (relation_type = 'FINDS_VIOLATION_OF'),
        target_document_id TEXT NOT NULL REFERENCES documents(id),
        target_entity_id TEXT NOT NULL REFERENCES legal_entities(id),
        target_reference TEXT NOT NULL,
        provenance TEXT NOT NULL CHECK (provenance = 'DECISION_TEXT'),
        evidence_text TEXT NOT NULL,
        evidence_locator TEXT NOT NULL,
        source_ref TEXT NOT NULL,
        review_status TEXT NOT NULL CHECK (review_status = 'reviewed'),
        reviewed_at TEXT NOT NULL,
        builder_method TEXT NOT NULL,
        builder_version TEXT NOT NULL,
        resolution_status TEXT NOT NULL CHECK (resolution_status = 'resolved'),
        build_id TEXT NOT NULL,
        UNIQUE (
          decision_id, relation_type, target_entity_id,
          provenance, evidence_locator
        )
      ) STRICT;
      CREATE INDEX supervisory_decision_findings_target_entity
        ON supervisory_decision_findings(target_entity_id);
      CREATE INDEX supervisory_decision_findings_target_document
        ON supervisory_decision_findings(target_document_id);
      CREATE TABLE applicability_rules (
        id TEXT PRIMARY KEY,
        dataset_version TEXT NOT NULL,
        document_id TEXT NOT NULL REFERENCES documents(id),
        entity_type_id TEXT NOT NULL,
        entity_type_label TEXT NOT NULL,
        status TEXT NOT NULL CHECK (
          status = 'listed-in-scope-subject-to-qualifications'
        ),
        scope_provision_id TEXT NOT NULL REFERENCES legal_entities(id),
        source_url TEXT NOT NULL,
        provenance TEXT NOT NULL CHECK (provenance = 'LEGAL_TEXT'),
        review_status TEXT NOT NULL CHECK (review_status = 'reviewed'),
        reviewed_at TEXT NOT NULL,
        builder_method TEXT NOT NULL CHECK (builder_method = 'applicability-rule'),
        builder_version TEXT NOT NULL,
        UNIQUE (document_id, entity_type_id)
      ) STRICT;
      CREATE INDEX applicability_rules_document
        ON applicability_rules(document_id, entity_type_id);
      CREATE TABLE applicability_rule_evidence (
        rule_id TEXT NOT NULL REFERENCES applicability_rules(id),
        display_order INTEGER NOT NULL,
        role TEXT NOT NULL CHECK (
          role IN ('scope-intro', 'entity-listing', 'qualification')
        ),
        source_entity_id TEXT NOT NULL REFERENCES legal_entities(id),
        source_label TEXT NOT NULL,
        source_path TEXT NOT NULL,
        evidence_text TEXT NOT NULL,
        evidence_locator TEXT NOT NULL,
        source_url TEXT NOT NULL,
        provenance TEXT NOT NULL CHECK (provenance = 'LEGAL_TEXT'),
        PRIMARY KEY (rule_id, display_order),
        UNIQUE (rule_id, role, source_entity_id)
      ) STRICT;
      CREATE TABLE applicability_rule_navigation (
        rule_id TEXT NOT NULL REFERENCES applicability_rules(id),
        provision_id TEXT NOT NULL REFERENCES legal_entities(id),
        display_order INTEGER NOT NULL,
        PRIMARY KEY (rule_id, provision_id),
        UNIQUE (rule_id, display_order)
      ) STRICT;
      CREATE TABLE relationships (
        relationship_id TEXT PRIMARY KEY,
        source_entity_id TEXT NOT NULL REFERENCES legal_entities(id),
        relation_type TEXT NOT NULL CHECK (relation_type IN (
          'REFERENCES', 'MANDATES', 'ADOPTED_UNDER', 'SUPPLEMENTS', 'IMPLEMENTS',
          'RELATED_DOCUMENT', 'RELATED_RECITAL'
        )),
        target_entity_id TEXT NOT NULL REFERENCES legal_entities(id),
        provenance TEXT NOT NULL CHECK (provenance IN (
          'LEGAL_TEXT', 'OFFICIAL_METADATA', 'OFFICIAL_MAPPING',
          'CASE_TEXT', 'EDITORIAL', 'TFIDF'
        )),
        evidence_text TEXT NOT NULL,
        evidence_locator TEXT NOT NULL,
        score REAL,
        source_ref TEXT NOT NULL,
        builder_method TEXT NOT NULL,
        builder_version TEXT NOT NULL,
        resolution_status TEXT NOT NULL CHECK (resolution_status = 'resolved'),
        build_id TEXT NOT NULL,
        UNIQUE (
          source_entity_id, relation_type, target_entity_id,
          provenance, evidence_locator
        )
      ) STRICT;
      CREATE INDEX relationships_source_entity_id ON relationships(source_entity_id);
      CREATE INDEX relationships_target_entity_id ON relationships(target_entity_id);
      CREATE TABLE search_records (
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
      CREATE INDEX search_records_document_id ON search_records(document_id);
      CREATE INDEX search_records_provision_id ON search_records(provision_id);
      CREATE VIRTUAL TABLE search_records_fts USING fts5(
        heading,
        body,
        content='search_records',
        content_rowid='rowid',
        tokenize='unicode61 remove_diacritics 2',
        prefix='2 3 4'
      );
      CREATE TABLE definitions (
        rowid INTEGER PRIMARY KEY,
        definition_id TEXT NOT NULL UNIQUE,
        document_id TEXT NOT NULL REFERENCES documents(id),
        provision_id TEXT NOT NULL,
        term TEXT NOT NULL,
        normalized_term TEXT NOT NULL,
        definition_text TEXT NOT NULL,
        definition_type TEXT NOT NULL CHECK (definition_type IN ('direct', 'incorporated')),
        label TEXT NOT NULL,
        title TEXT,
        marker TEXT,
        path TEXT NOT NULL
      ) STRICT;
      CREATE INDEX definitions_document_id ON definitions(document_id);
      CREATE INDEX definitions_normalized_term ON definitions(normalized_term);
      CREATE VIRTUAL TABLE definitions_fts USING fts5(
        term,
        definition_text,
        content='definitions',
        content_rowid='rowid',
        tokenize='unicode61 remove_diacritics 2',
        prefix='2 3 4'
      );
    `);

    const insertDocument = database.prepare(`
      INSERT INTO documents (
        id, jurisdiction, slug, celex, local_id, short_name, official_title, document_type,
        publication_date, source_url, source_status_json, last_checked, source_version,
        canonical_build_id, provenance, family_id, regulatory_level,
        measure_type, default_path, display_order
      ) VALUES (
        @id, @jurisdiction, @slug, @celex, @localId, @shortName, @officialTitle, @documentType,
        @publicationDate, @sourceUrl, @sourceStatusJson, @lastChecked, @sourceVersion,
        @canonicalBuildId, @provenance, @familyId, @regulatoryLevel,
        @measureType, @defaultPath, @displayOrder
      )
    `);
    const insertDocumentView = database.prepare(`
      INSERT INTO document_views (
        document_id, reader_payload_json, explorer_payload_json
      ) VALUES (?, ?, ?)
    `);
    const insertDocumentVersion = database.prepare(`
      INSERT INTO document_versions (
        id, document_id, kind, label, version_date, source_url, availability
      ) VALUES (
        @id, @documentId, @kind, @label, @date, @sourceUrl, @availability
      )
    `);
    const insertDocumentVersionEdge = database.prepare(`
      INSERT INTO document_version_edges (
        id, document_id, source_version_id, relation_type,
        target_version_id, provenance, source_ref
      ) VALUES (
        @id, @documentId, @sourceVersionId, @relationType,
        @targetVersionId, @provenance, @sourceRef
      )
    `);
    const insertDocumentVersionChain = database.prepare(`
      INSERT INTO document_version_chains (
        document_id, coverage, checked_at, loaded_version_id
      ) VALUES (
        @documentId, @coverage, @checkedAt, @loadedVersionId
      )
    `);
    const insertAlias = database.prepare(`
      INSERT INTO document_aliases (
        document_id, alias, normalized_alias, display_order
      ) VALUES (?, ?, ?, ?)
    `);
    const insertProvision = database.prepare(`
      INSERT INTO search_records (
        record_id, provision_id, document_id, kind, label, title, marker,
        path, heading, body, scope
      ) VALUES (
        @recordId, @provisionId, @documentId, @kind, @label, @title, @marker,
        @path, @heading, @body, @scope
      )
    `);
    const insertFts = database.prepare(
      "INSERT INTO search_records_fts(rowid, heading, body) VALUES (?, ?, ?)",
    );
    const insertDefinition = database.prepare(`
      INSERT INTO definitions (
        definition_id, document_id, provision_id, term, normalized_term,
        definition_text, definition_type, label, title, marker, path
      ) VALUES (
        @definitionId, @documentId, @provisionId, @term, @normalizedTerm,
        @definitionText, @definitionType, @label, @title, @marker, @path
      )
    `);
    const insertDefinitionFts = database.prepare(
      "INSERT INTO definitions_fts(rowid, term, definition_text) VALUES (?, ?, ?)",
    );
    const insertEntity = database.prepare(`
      INSERT INTO legal_entities (
        id, document_id, parent_entity_id, root_provision_id,
        kind, label, title, path
      ) VALUES (
        @id, @documentId, @parentEntityId, @rootProvisionId,
        @kind, @label, @title, @path
      )
    `);
    const insertDomain = database.prepare(`
      INSERT INTO regulatory_domains (
        id, parent_id, label, description, taxonomy_id, taxonomy_version,
        provenance, review_status, reviewed_at
      ) VALUES (
        @id, @parentId, @label, @description, @taxonomyId, @taxonomyVersion,
        @provenance, @reviewStatus, @reviewedAt
      )
    `);
    const insertDomainAssignment = database.prepare(`
      INSERT INTO domain_assignments (
        assignment_id, domain_id, target_document_id, target_entity_id,
        target_kind, role, provenance, assignment_version, review_status,
        reviewed_at, rationale, review_note, evidence_locator
      ) VALUES (
        @id, @domainId, @targetDocumentId, @targetEntityId,
        @targetKind, @role, @provenance, @assignmentVersion, @reviewStatus,
        @reviewedAt, @rationale, @reviewNote, @evidenceLocator
      )
    `);
    const insertTopic = database.prepare(`
      INSERT INTO regulatory_topics (
        id, slug, label, description, taxonomy_id, taxonomy_version,
        provenance, review_status, reviewed_at
      ) VALUES (
        @id, @slug, @label, @description, @taxonomyId, @taxonomyVersion,
        @provenance, @reviewStatus, @reviewedAt
      )
    `);
    const insertTopicAssignment = database.prepare(`
      INSERT INTO topic_assignments (
        assignment_id, topic_id, target_document_id, target_entity_id,
        target_kind, target_label, target_title, target_path, role, provenance,
        assignment_version, review_status, reviewed_at, rationale,
        review_note, evidence_locator
      ) VALUES (
        @id, @topicId, @targetDocumentId, @targetEntityId,
        @targetKind, @targetLabel, @targetTitle, @targetPath, @role, @provenance,
        @assignmentVersion, @reviewStatus, @reviewedAt, @rationale,
        @reviewNote, @evidenceLocator
      )
    `);
    const insertAuthority = database.prepare(`
      INSERT INTO authorities (
        id, official_name, acronym, authority_type, jurisdiction,
        source_url, checked_at
      ) VALUES (
        @id, @officialName, @acronym, @authorityType, @jurisdiction,
        @sourceUrl, @checkedAt
      )
    `);
    const insertAuthorityRelationship = database.prepare(`
      INSERT INTO authority_relationships (
        relationship_id, source_document_id, relation_type,
        target_authority_id, provenance, evidence_text, evidence_locator,
        source_ref, builder_method, builder_version, review_status, reviewed_at
      ) VALUES (
        @id, @sourceDocumentId, @relationType,
        @targetAuthorityId, @provenance, @evidenceText, @evidenceLocator,
        @sourceRef, @builderMethod, @builderVersion, @reviewStatus, @reviewedAt
      )
    `);
    const insertLegalNature = database.prepare(`
      INSERT INTO legal_natures (
        document_id, instrument_type, compliance_expectation, current_status,
        under_review, application_date, status_checked_at,
        legal_basis_evidence_text, legal_basis_evidence_entity_id,
        legal_basis_source_url, application_evidence_text,
        application_evidence_entity_id, application_source_url,
        status_source_url, provenance, review_status, reviewed_at
      ) VALUES (
        @documentId, @instrumentType, @complianceExpectation, @currentStatus,
        @underReview, @applicationDate, @statusCheckedAt,
        @legalBasisEvidenceText, @legalBasisEvidenceEntityId,
        @legalBasisSourceUrl, @applicationEvidenceText,
        @applicationEvidenceEntityId, @applicationSourceUrl,
        @statusSourceUrl, @provenance, @reviewStatus, @reviewedAt
      )
    `);
    const insertImplementationTimelineEvent = database.prepare(`
      INSERT INTO implementation_timeline_events (
        event_id, timeline_id, timeline_version, document_id, event_type,
        event_date, label, scope_label, date_basis, source_entity_id,
        source_label, source_path, source_locator_kind, source_locator_value,
        evidence_text, evidence_locator, source_url, derivation_json,
        provenance, review_status, reviewed_at, builder_method, builder_version
      ) VALUES (
        @id, @timelineId, @timelineVersion, @documentId, @eventType,
        @date, @label, @scopeLabel, @dateBasis, @sourceEntityId,
        @sourceLabel, @sourcePath, @sourceLocatorKind, @sourceLocatorValue,
        @evidenceText, @evidenceLocator, @sourceUrl, @derivationJson,
        @provenance, @reviewStatus, @reviewedAt, @builderMethod, @builderVersion
      )
    `);
    const insertSupervisoryDecision = database.prepare(`
      INSERT INTO supervisory_decisions (
        id, slug, authority_id, jurisdiction, decision_number, decision_date,
        decision_type, official_title, subject, respondent_label,
        target_document_id, source_page_url, source_document_url,
        source_document_sha256, source_document_byte_count,
        source_document_page_count, outcome_kind, fine_amount_minor,
        fine_currency, outcome_evidence_text, outcome_evidence_locator,
        provenance, review_status, reviewed_at, builder_method, builder_version
      ) VALUES (
        @id, @slug, @authorityId, @jurisdiction, @decisionNumber, @decisionDate,
        @decisionType, @officialTitle, @subject, @respondentLabel,
        @targetDocumentId, @sourcePageUrl, @sourceDocumentUrl,
        @sourceDocumentSha256, @sourceDocumentByteCount,
        @sourceDocumentPageCount, @outcomeKind, @fineAmountMinor,
        @fineCurrency, @outcomeEvidenceText, @outcomeEvidenceLocator,
        @provenance, @reviewStatus, @reviewedAt, @builderMethod, @builderVersion
      )
    `);
    const insertSupervisoryDecisionFinding = database.prepare(`
      INSERT INTO supervisory_decision_findings (
        relationship_id, decision_id, relation_type, target_document_id,
        target_entity_id, target_reference, provenance, evidence_text,
        evidence_locator, source_ref, review_status, reviewed_at,
        builder_method, builder_version, resolution_status, build_id
      ) VALUES (
        @id, @decisionId, @relationType, @targetDocumentId,
        @targetEntityId, @targetReference, @provenance, @evidenceText,
        @evidenceLocator, @sourceRef, @reviewStatus, @reviewedAt,
        @builderMethod, @builderVersion, @resolutionStatus, @buildId
      )
    `);
    const insertApplicabilityRule = database.prepare(`
      INSERT INTO applicability_rules (
        id, dataset_version, document_id, entity_type_id, entity_type_label,
        status, scope_provision_id, source_url, provenance, review_status,
        reviewed_at, builder_method, builder_version
      ) VALUES (
        @id, @datasetVersion, @documentId, @entityTypeId, @entityTypeLabel,
        @status, @scopeProvisionId, @sourceUrl, @provenance, @reviewStatus,
        @reviewedAt, @builderMethod, @builderVersion
      )
    `);
    const insertApplicabilityEvidence = database.prepare(`
      INSERT INTO applicability_rule_evidence (
        rule_id, display_order, role, source_entity_id, source_label,
        source_path, evidence_text, evidence_locator, source_url, provenance
      ) VALUES (
        @ruleId, @displayOrder, @role, @sourceEntityId, @sourceLabel,
        @sourcePath, @evidenceText, @evidenceLocator, @sourceUrl, @provenance
      )
    `);
    const insertApplicabilityNavigation = database.prepare(`
      INSERT INTO applicability_rule_navigation (
        rule_id, provision_id, display_order
      ) VALUES (@ruleId, @provisionId, @displayOrder)
    `);
    const insertLegalWork = database.prepare(`
      INSERT INTO legal_works (
        id, celex, cellar_work_uri, loaded_document_id, label, title,
        source_url, availability
      ) VALUES (
        @id, @celex, @cellarWorkUri, @loadedDocumentId, @label, @title,
        @sourceUrl, @availability
      )
    `);
    const insertLifecycleRelationship = database.prepare(`
      INSERT INTO lifecycle_relationships (
        relationship_id, source_work_id, relation_type, target_work_id,
        provenance, evidence_text, evidence_locator, source_ref,
        builder_method, builder_version, resolution_status, build_id
      ) VALUES (
        @id, @sourceWorkId, @relationType, @targetWorkId,
        @provenance, @evidenceText, @evidenceLocator, @sourceRef,
        @builderMethod, @builderVersion, @resolutionStatus, @buildId
      )
    `);
    const insertCase = database.prepare(`
      INSERT INTO case_entities (
        id, celex, cellar_work_uri, ecli, case_number, case_name,
        decision_type, decision_date, official_title, source_url
      ) VALUES (
        @id, @celex, @cellarWorkUri, @ecli, @caseNumber, @caseName,
        @decisionType, @decisionDate, @officialTitle, @sourceUrl
      )
    `);
    const insertCaseLawRelationship = database.prepare(`
      INSERT INTO case_law_relationships (
        relationship_id, case_id, relation_type, target_document_id,
        provenance, evidence_text, evidence_locator, source_ref,
        builder_method, builder_version, resolution_status, build_id
      ) VALUES (
        @id, @caseId, @relationType, @targetDocumentId,
        @provenance, @evidenceText, @evidenceLocator, @sourceRef,
        @builderMethod, @builderVersion, @resolutionStatus, @buildId
      )
    `);
    const insertRelationship = database.prepare(`
      INSERT INTO relationships (
        relationship_id, source_entity_id, relation_type, target_entity_id,
        provenance, evidence_text, evidence_locator, score, source_ref,
        builder_method, builder_version, resolution_status, build_id
      ) VALUES (
        @id, @sourceEntityId, @relationType, @targetEntityId,
        @provenance, @evidenceText, @evidenceLocator, @score, @sourceRef,
        @builderMethod, @builderVersion, @resolutionStatus, @buildId
      )
    `);
    const insertManifest = database.prepare(
      "INSERT INTO build_manifest(key, value) VALUES (?, ?)",
    );
    const populate = database.transaction(() => {
      for (const [displayOrder, document] of documents.entries()) {
        const identifier = document.celex ?? document.localId;
        const source = identifier
          ? sourceByIdentifier.get(identifier)
          : undefined;
        const aliases = [...new Set(source?.aliases ?? [])];
        const explorer = explorerDocumentSchema.parse(toExplorerView(document));
        insertDocument.run({
          id: document.id,
          jurisdiction: document.jurisdiction,
          slug: document.slug,
          celex: document.celex,
          localId: document.localId,
          shortName: document.shortName,
          officialTitle: document.officialTitle,
          documentType: document.documentType,
          publicationDate: document.asOf,
          sourceUrl: document.sourceUrl,
          sourceStatusJson: document.sourceStatus
            ? JSON.stringify(document.sourceStatus)
            : null,
          lastChecked: document.lastChecked,
          sourceVersion: document.sourceVersion,
          canonicalBuildId: document.buildId,
          provenance: document.provenance,
          familyId: source?.familyId ?? `family:${document.slug}`,
          regulatoryLevel: source?.regulatoryLevel ?? "level-1",
          measureType: source?.measureType ?? "primary-act",
          defaultPath: document.provisions[0]?.path ?? `/read/${document.slug}`,
          displayOrder,
        });
        insertDocumentView.run(
          document.id,
          JSON.stringify(documentViewSchema.parse(document)),
          JSON.stringify(explorer),
        );
        aliases.forEach((alias, index) => {
          insertAlias.run(
            document.id,
            alias,
            normalizeSearchText(alias),
            index,
          );
        });
      }
      for (const node of versionNodes) {
        insertDocumentVersion.run({ ...node, date: node.date ?? null });
      }
      for (const chain of versionChains) {
        insertDocumentVersionChain.run({
          ...chain,
          checkedAt: chain.checkedAt ?? null,
        });
      }
      for (const edge of versionEdges) {
        insertDocumentVersionEdge.run(edge);
      }
      for (const row of rows) {
        const result = insertProvision.run(row);
        insertFts.run(result.lastInsertRowid, row.heading, row.body);
      }
      for (const definition of definitions) {
        const result = insertDefinition.run(definition);
        insertDefinitionFts.run(
          result.lastInsertRowid,
          definition.term,
          definition.definitionText,
        );
      }
      for (const entity of relationshipBuild.entities) {
        insertEntity.run(entity);
      }
      for (const domain of regulatoryContextBuild.domains) {
        insertDomain.run(domain);
      }
      for (const assignment of regulatoryContextBuild.assignments) {
        insertDomainAssignment.run(assignment);
      }
      for (const topic of regulatoryTopicBuild.topics) {
        insertTopic.run(topic);
      }
      for (const assignment of regulatoryTopicBuild.assignments) {
        insertTopicAssignment.run(assignment);
      }
      for (const authority of regulatoryContextBuild.authorities) {
        insertAuthority.run(authority);
      }
      for (const relationship of regulatoryContextBuild.authorityRelationships) {
        insertAuthorityRelationship.run(relationship);
      }
      for (const legalNature of regulatoryContextBuild.legalNatures) {
        insertLegalNature.run({
          ...legalNature,
          underReview: legalNature.underReview ? 1 : 0,
        });
      }
      for (const event of implementationTimelineEvents) {
        insertImplementationTimelineEvent.run({
          ...event,
          derivationJson: event.derivation
            ? JSON.stringify(event.derivation)
            : null,
        });
      }
      for (const decision of supervisoryDecisionBuild.decisions) {
        insertSupervisoryDecision.run(decision);
      }
      for (const finding of supervisoryDecisionBuild.findings) {
        insertSupervisoryDecisionFinding.run({ ...finding, buildId });
      }
      for (const rule of applicabilityRuleBuild.rules) {
        insertApplicabilityRule.run(rule);
      }
      for (const evidence of applicabilityRuleBuild.evidence) {
        insertApplicabilityEvidence.run(evidence);
      }
      for (const navigation of applicabilityRuleBuild.navigation) {
        insertApplicabilityNavigation.run(navigation);
      }
      for (const work of lifecycleBuild.works) {
        insertLegalWork.run(work);
      }
      for (const relationship of lifecycleBuild.relationships) {
        insertLifecycleRelationship.run({ ...relationship, buildId });
      }
      for (const caseEntity of caseLawBuild.cases) {
        insertCase.run(caseEntity);
      }
      for (const relationship of caseLawBuild.relationships) {
        insertCaseLawRelationship.run({ ...relationship, buildId });
      }
      for (const relationship of relationships) {
        insertRelationship.run({
          ...relationship,
          score: relationship.score ?? null,
          buildId,
        });
      }
      const manifestEntries = {
        schemaVersion: RUNTIME_DATABASE_SCHEMA_VERSION,
        buildId,
        builtAt,
        profileId: compilation.profile.id,
        profileVersion: compilation.profile.version,
        profileDisplayName: compilation.profile.displayName,
        profileHash,
        regulatoryDomainTaxonomyId: regulatoryContextBuild.taxonomyId,
        regulatoryDomainTaxonomyVersion: regulatoryContextBuild.taxonomyVersion,
        regulatoryTopicTaxonomyId: regulatoryTopicBuild.taxonomyId,
        regulatoryTopicTaxonomyVersion: regulatoryTopicBuild.taxonomyVersion,
        regulatoryTopicTaxonomyReviewedAt:
          regulatoryTopicBuild.taxonomyReviewedAt,
        documentCount: String(documents.length),
        recordCount: String(rows.length),
        definitionCount: String(definitions.length),
        relationshipCount: String(relationships.length),
        cellarRelationshipCount: String(cellarRelationships.length),
        lifecycleRelationshipCount: String(lifecycleBuild.relationships.length),
        externalWorkCount: String(
          lifecycleBuild.works.filter(
            (work) => work.availability === "external",
          ).length,
        ),
        caseCount: String(caseLawBuild.cases.length),
        caseLawRelationshipCount: String(caseLawBuild.relationships.length),
        relatedRecitalCount: String(
          relatedRecitalBuild?.relationships.length ?? 0,
        ),
        versionNodeCount: String(versionNodes.length),
        versionEdgeCount: String(versionEdges.length),
        domainCount: String(regulatoryContextBuild.domains.length),
        domainAssignmentCount: String(
          regulatoryContextBuild.assignments.length,
        ),
        authorityCount: String(regulatoryContextBuild.authorities.length),
        authorityRelationshipCount: String(
          regulatoryContextBuild.authorityRelationships.length,
        ),
        timelineEventCount: String(implementationTimelineEvents.length),
        supervisoryDecisionCount: String(
          supervisoryDecisionBuild.decisions.length,
        ),
        supervisoryDecisionFindingCount: String(
          supervisoryDecisionBuild.findings.length,
        ),
        applicabilityRuleCount: String(applicabilityRuleBuild.rules.length),
        applicabilityEvidenceCount: String(
          applicabilityRuleBuild.evidence.length,
        ),
        topicCount: String(regulatoryTopicBuild.topics.length),
        topicAssignmentCount: String(regulatoryTopicBuild.assignments.length),
        tfidfBenchmark: JSON.stringify(relatedRecitalBuild?.evaluation ?? null),
        officialMappingCount: String(officialMappings.length),
        unresolvedReferenceCount: String(relationshipBuild.unresolvedCount),
        relationshipBuilders: JSON.stringify([
          `${EXPLICIT_REFERENCE_BUILDER}@${EXPLICIT_REFERENCE_BUILDER_VERSION}`,
          `${OFFICIAL_MAPPING_BUILDER}@${OFFICIAL_MAPPING_BUILDER_VERSION}`,
          ...(guidelineRelationships.length > 0
            ? [
                `${GUIDELINE_MAPPING_BUILDER}@${GUIDELINE_MAPPING_BUILDER_VERSION}`,
              ]
            : []),
          ...(nationalImplementationRelationships.length > 0
            ? [
                `${NATIONAL_IMPLEMENTATION_BUILDER}@${NATIONAL_IMPLEMENTATION_BUILDER_VERSION}`,
              ]
            : []),
          ...(cellarRelationships.length > 0
            ? [
                `${CELLAR_RELATIONSHIP_BUILDER}@${CELLAR_RELATIONSHIP_BUILDER_VERSION}`,
              ]
            : []),
          ...(lifecycleBuild.relationships.length > 0
            ? [
                `${CELLAR_LIFECYCLE_BUILDER}@${CELLAR_LIFECYCLE_BUILDER_VERSION}`,
              ]
            : []),
          ...(caseLawBuild.relationships.length > 0
            ? [`${CELLAR_CASE_LAW_BUILDER}@${CELLAR_CASE_LAW_BUILDER_VERSION}`]
            : []),
          ...(relatedRecitalBuild
            ? [
                `${TFIDF_RELATED_RECITAL_BUILDER}@${TFIDF_RELATED_RECITAL_BUILDER_VERSION}`,
              ]
            : []),
        ]),
        versionBuilders: JSON.stringify([
          `${DOCUMENT_VERSION_CHAIN_BUILDER}@${DOCUMENT_VERSION_CHAIN_BUILDER_VERSION}`,
        ]),
        regulatoryContextBuilders: JSON.stringify([
          `${REGULATORY_CONTEXT_BUILDER}@${REGULATORY_CONTEXT_BUILDER_VERSION}`,
        ]),
        timelineBuilders: JSON.stringify([
          `${IMPLEMENTATION_TIMELINE_BUILDER}@${IMPLEMENTATION_TIMELINE_BUILDER_VERSION}`,
        ]),
        supervisoryDecisionBuilders: JSON.stringify([
          `${SUPERVISORY_DECISION_BUILDER}@${SUPERVISORY_DECISION_BUILDER_VERSION}`,
        ]),
        applicabilityBuilders: JSON.stringify([
          `${APPLICABILITY_RULE_BUILDER}@${APPLICABILITY_RULE_BUILDER_VERSION}`,
        ]),
        topicBuilders: JSON.stringify([
          `${REGULATORY_TOPIC_BUILDER}@${REGULATORY_TOPIC_BUILDER_VERSION}`,
        ]),
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
      "INSERT INTO search_records_fts(search_records_fts) VALUES ('optimize')",
    );
    database.exec(
      "INSERT INTO definitions_fts(definitions_fts) VALUES ('optimize')",
    );
    const integrity = database.pragma("integrity_check") as Array<{
      integrity_check: string;
    }>;
    if (
      integrity.length !== 1 ||
      integrity[0]?.integrity_check.toLowerCase() !== "ok"
    ) {
      throw new Error(
        "Generated runtime database failed SQLite integrity_check",
      );
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
    schemaVersion: RUNTIME_DATABASE_SCHEMA_VERSION,
    buildId,
    builtAt,
    profileId: compilation.profile.id,
    profileVersion: compilation.profile.version,
    profileDisplayName: compilation.profile.displayName,
    profileHash,
    regulatoryDomainTaxonomyId: regulatoryContextBuild.taxonomyId,
    regulatoryDomainTaxonomyVersion: regulatoryContextBuild.taxonomyVersion,
    regulatoryTopicTaxonomyId: regulatoryTopicBuild.taxonomyId,
    regulatoryTopicTaxonomyVersion: regulatoryTopicBuild.taxonomyVersion,
    regulatoryTopicTaxonomyReviewedAt: regulatoryTopicBuild.taxonomyReviewedAt,
    documentCount: documents.length,
    recordCount: rows.length,
    definitionCount: definitions.length,
    relationshipCount: relationships.length,
    cellarRelationshipCount: cellarRelationships.length,
    lifecycleRelationshipCount: lifecycleBuild.relationships.length,
    externalWorkCount: lifecycleBuild.works.filter(
      (work) => work.availability === "external",
    ).length,
    caseCount: caseLawBuild.cases.length,
    caseLawRelationshipCount: caseLawBuild.relationships.length,
    relatedRecitalCount: relatedRecitalBuild?.relationships.length ?? 0,
    versionNodeCount: versionNodes.length,
    versionEdgeCount: versionEdges.length,
    domainCount: regulatoryContextBuild.domains.length,
    domainAssignmentCount: regulatoryContextBuild.assignments.length,
    authorityCount: regulatoryContextBuild.authorities.length,
    authorityRelationshipCount:
      regulatoryContextBuild.authorityRelationships.length,
    timelineEventCount: implementationTimelineEvents.length,
    supervisoryDecisionCount: supervisoryDecisionBuild.decisions.length,
    supervisoryDecisionFindingCount: supervisoryDecisionBuild.findings.length,
    applicabilityRuleCount: applicabilityRuleBuild.rules.length,
    applicabilityEvidenceCount: applicabilityRuleBuild.evidence.length,
    topicCount: regulatoryTopicBuild.topics.length,
    topicAssignmentCount: regulatoryTopicBuild.assignments.length,
    tfidfBenchmark: relatedRecitalBuild?.evaluation ?? null,
    unresolvedReferenceCount: relationshipBuild.unresolvedCount,
    documentBuilds: documents.map((document) => ({
      documentId: document.id,
      buildId: document.buildId,
    })),
    outputPath: resolvedOutput,
    byteCount: statSync(resolvedOutput).size,
  };
}
