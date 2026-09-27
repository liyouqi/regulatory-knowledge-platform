import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, renameSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { z } from "zod";
import { extractFormexPackage } from "../../ingestion/formex-package";
import {
  type FormexParseResult,
  parseFormexAct,
} from "../../ingestion/formex-parser";
import type { OfficialSourceSnapshot } from "../../ingestion/snapshot";
import type { SourceDefinition } from "../../ingestion/source-registry";
import {
  type EarthCellarRelationRecord,
  type EarthRelationAcquisitionResult,
  readVerifiedEarthRelationSnapshot,
} from "../acquisition/cellar-relation-source";
import {
  type EarthOfficialSnapshot,
  readVerifiedEarthSnapshot,
} from "../acquisition/earth-snapshot";
import { EARTH_READING_SCHEMA_VERSION } from "../contract/article-reading";
import type { EarthUniverse } from "../universe/earth-universe";
import {
  type AuditedArticle,
  auditArticleReadings,
} from "./article-source-audit";
import {
  type EarthReviewedSourceMetadata,
  type EarthReviewedSourceMetadataEntry,
  earthReviewedSourceMetadataEntrySchema,
} from "./earth-source-metadata";
import { verifyArticleReadings } from "./verify-article-readings";

export const EARTH_ARTIFACT_SCHEMA_VERSION = EARTH_READING_SCHEMA_VERSION;
export const EARTH_COMPILER_VERSION = "0.3.0" as const;

export const earthArtifactManifestSchema = z
  .object({
    schemaVersion: z.literal(EARTH_ARTIFACT_SCHEMA_VERSION),
    compilerVersion: z.literal(EARTH_COMPILER_VERSION),
    buildId: z.string().regex(/^earth-build:[a-f0-9]{64}$/),
    builtAt: z.string().datetime(),
    universeId: z.string().min(1),
    universeVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    universeDisplayName: z.string().min(1),
    sourceSnapshotIds: z.array(z.string().min(1)).min(1),
    relationSnapshotIds: z.array(z.string().min(1)),
    counts: z
      .object({
        works: z.number().int().nonnegative(),
        boundaryWorks: z.number().int().nonnegative(),
        nodes: z.number().int().nonnegative(),
        relationships: z.number().int().nonnegative(),
        articlesWithReading: z.number().int().nonnegative(),
        readingBlocks: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export type EarthArtifactManifest = z.infer<typeof earthArtifactManifestSchema>;

export interface EarthCompilerOptions {
  universe: EarthUniverse;
  snapshotDirectories: string[];
  sourceMetadata: EarthReviewedSourceMetadata;
  relationshipSnapshotDirectory?: string;
  outputPath: string;
  builtAt?: Date;
}

export interface EarthCompilerResult {
  outputPath: string;
  manifest: EarthArtifactManifest;
  workCount: number;
  nodeCount: number;
}

type VerifiedInput = {
  directory: string;
  snapshot: EarthOfficialSnapshot;
  contentBytes: Uint8Array;
};

type CompiledWork = {
  input: VerifiedInput;
  label: string;
  metadata: EarthReviewedSourceMetadataEntry;
  parsed: FormexParseResult;
  workId: string;
  xmlMember: string;
  readings: AuditedArticle[];
};

type CompiledBoundaryWork = {
  id: string;
  celex: string;
  workUri: string;
  officialTitle?: string;
};

type CompiledRelationship = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationType: "AMENDS" | "CORRECTS";
  evidenceText: string;
  evidenceLocator: string;
  evidenceSourceUrl: string;
};

type CompiledRelations = {
  boundaries: CompiledBoundaryWork[];
  relationships: CompiledRelationship[];
  snapshot?: EarthRelationAcquisitionResult;
};

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sourceForParser(
  snapshot: EarthOfficialSnapshot,
  label: string,
  metadata: EarthReviewedSourceMetadataEntry,
): SourceDefinition {
  const documentType =
    snapshot.celex[5] === "R"
      ? "regulation"
      : snapshot.celex[5] === "L"
        ? "directive"
        : undefined;
  if (!documentType) {
    throw new Error(
      `Earth Formex compiler supports only Regulation or Directive CELEX works: ${snapshot.celex}`,
    );
  }
  // This adapter exists only to reuse the tested Formex structural parser. Its
  // non-text fields are not persisted in the Earth artifact.
  return {
    familyId: `family:earth-${snapshot.celex.toLowerCase()}`,
    shortName: label,
    aliases: [label],
    celex: snapshot.celex,
    language: "ENG",
    documentType,
    regulatoryLevel: "level-1",
    measureType: metadata.measureType,
    publicationDate: metadata.publicationDate,
    eliUrl: snapshot.treeNoticeUrl,
  };
}

function snapshotForParser(
  snapshot: EarthOfficialSnapshot,
): OfficialSourceSnapshot {
  return {
    schemaVersion: snapshot.content.upstreamItems ? "1.1.0" : "1.0.0",
    snapshotId: snapshot.snapshotId,
    provenance: snapshot.provenance,
    sourceSystem: snapshot.sourceSystem,
    celex: snapshot.celex,
    language: snapshot.language,
    retrievedAt: snapshot.retrievedAt,
    // The parser calls this canonicalUrl; Earth retains the official CELLAR URL.
    canonicalUrl: snapshot.treeNoticeUrl,
    workUri: snapshot.workUri,
    expressionUri: snapshot.expressionUri,
    manifestationUri: snapshot.manifestationUri,
    treeNotice: snapshot.treeNotice,
    content: snapshot.content,
  };
}

function nodeId(logicalId: string): string {
  return `earth:${logicalId}`;
}

function writeSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE build_manifest (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    ) STRICT;
    CREATE TABLE source_snapshots (
      snapshot_id TEXT PRIMARY KEY,
      celex TEXT NOT NULL UNIQUE,
      content_sha256 TEXT NOT NULL,
      retrieved_at TEXT NOT NULL,
      work_uri TEXT NOT NULL,
      expression_uri TEXT NOT NULL,
      manifestation_uri TEXT NOT NULL,
      content_url TEXT NOT NULL,
      tree_notice_url TEXT NOT NULL,
      language TEXT NOT NULL CHECK (language = 'en')
    ) STRICT;
    CREATE TABLE relation_snapshots (
      snapshot_id TEXT PRIMARY KEY,
      endpoint TEXT NOT NULL,
      query_version TEXT NOT NULL,
      retrieved_at TEXT NOT NULL,
      seed_celexes_json TEXT NOT NULL,
      query_sha256 TEXT NOT NULL,
      response_sha256 TEXT NOT NULL,
      normalized_sha256 TEXT NOT NULL,
      record_count INTEGER NOT NULL CHECK (record_count >= 0)
    ) STRICT;
    CREATE TABLE works (
      id TEXT PRIMARY KEY,
      celex TEXT NOT NULL UNIQUE,
      work_uri TEXT NOT NULL UNIQUE,
      expression_uri TEXT NOT NULL,
      manifestation_uri TEXT NOT NULL,
      measure_type TEXT NOT NULL CHECK (measure_type IN (
        'primary-act', 'rts', 'its', 'guideline', 'qa', 'other'
      )),
      metadata_source_url TEXT NOT NULL,
      official_title TEXT NOT NULL,
      snapshot_id TEXT NOT NULL UNIQUE REFERENCES source_snapshots(snapshot_id)
    ) STRICT;
    CREATE TABLE boundary_works (
      id TEXT PRIMARY KEY,
      celex TEXT NOT NULL UNIQUE,
      work_uri TEXT NOT NULL UNIQUE,
      official_title TEXT,
      source_url TEXT NOT NULL CHECK (source_url LIKE 'https://%')
    ) STRICT;
    CREATE TABLE nodes (
      id TEXT PRIMARY KEY,
      work_id TEXT REFERENCES works(id),
      boundary_work_id TEXT REFERENCES boundary_works(id),
      parent_id TEXT REFERENCES nodes(id),
      entity_kind TEXT NOT NULL CHECK (entity_kind IN (
        'document', 'title', 'part', 'chapter', 'section', 'subsection', 'division', 'article', 'external-work'
      )),
      logical_id TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      title TEXT,
      text TEXT,
      content_hash TEXT,
      source_locator TEXT NOT NULL,
      display_order INTEGER NOT NULL,
      CHECK ((entity_kind = 'article') = (text IS NOT NULL)),
      CHECK (
        (entity_kind = 'external-work' AND work_id IS NULL AND boundary_work_id IS NOT NULL AND parent_id IS NULL)
        OR
        (entity_kind != 'external-work' AND work_id IS NOT NULL AND boundary_work_id IS NULL)
      )
    ) STRICT;
    CREATE INDEX nodes_work_display_order ON nodes(work_id, display_order);
    CREATE INDEX nodes_parent_id ON nodes(parent_id);
    CREATE TABLE article_readings (
      article_node_id TEXT PRIMARY KEY REFERENCES nodes(id),
      source_path TEXT NOT NULL,
      xml_member TEXT NOT NULL,
      block_count INTEGER NOT NULL CHECK (block_count BETWEEN 1 AND 500)
    ) STRICT;
    CREATE TABLE article_reading_blocks (
      id TEXT PRIMARY KEY,
      article_node_id TEXT NOT NULL REFERENCES article_readings(article_node_id),
      parent_id TEXT REFERENCES article_reading_blocks(id) DEFERRABLE INITIALLY DEFERRED,
      block_json TEXT NOT NULL
    ) STRICT;
    CREATE INDEX article_reading_blocks_article ON article_reading_blocks(article_node_id);
    CREATE TABLE official_relationships (
      id TEXT PRIMARY KEY CHECK (id LIKE 'relationship:%'),
      source_node_id TEXT NOT NULL REFERENCES nodes(id),
      target_node_id TEXT NOT NULL REFERENCES nodes(id),
      relation_type TEXT NOT NULL CHECK (relation_type IN (
        'REFERENCES', 'MANDATES', 'ADOPTED_UNDER', 'AMENDS', 'CORRECTS',
        'INTERPRETS', 'SUPPLEMENTS', 'IMPLEMENTS', 'RELATED_DOCUMENT'
      )),
      provenance TEXT NOT NULL CHECK (provenance IN (
        'LEGAL_TEXT', 'CELLAR_METADATA', 'EUR_LEX_METADATA', 'OFFICIAL_MAPPING'
      )),
      evidence_text TEXT NOT NULL CHECK (length(evidence_text) > 0),
      evidence_locator TEXT NOT NULL CHECK (length(evidence_locator) > 0),
      evidence_source_url TEXT NOT NULL CHECK (evidence_source_url LIKE 'https://%')
    ) STRICT;
  `);
}

function verifyStagingArtifact(
  database: Database.Database,
  manifest: EarthArtifactManifest,
): void {
  const integrity = database.pragma("integrity_check", { simple: true });
  if (integrity !== "ok") {
    throw new Error(`Earth staging integrity check failed: ${integrity}`);
  }
  const foreignKeys = database.pragma("foreign_key_check") as unknown[];
  if (foreignKeys.length > 0) {
    throw new Error("Earth staging foreign key check failed");
  }
  const count = (table: string) =>
    (
      database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
        count: number;
      }
    ).count;
  if (
    count("works") !== manifest.counts.works ||
    count("boundary_works") !== manifest.counts.boundaryWorks ||
    count("nodes") !== manifest.counts.nodes ||
    count("official_relationships") !== manifest.counts.relationships
  ) {
    throw new Error("Earth staging counts do not match its manifest");
  }
  verifyArticleReadings(database, manifest.counts);
  const persistedManifest = database
    .prepare("SELECT value FROM build_manifest WHERE key = 'manifest_json'")
    .get() as { value?: string } | undefined;
  if (
    !persistedManifest?.value ||
    earthArtifactManifestSchema.parse(JSON.parse(persistedManifest.value))
      .buildId !== manifest.buildId
  ) {
    throw new Error("Earth staging manifest verification failed");
  }
}

function buildId(
  options: EarthCompilerOptions,
  inputs: VerifiedInput[],
  relations: CompiledRelations,
): string {
  const { universe } = options;
  const stableInputs = inputs
    .map(({ snapshot }) =>
      [snapshot.celex, snapshot.snapshotId, snapshot.content.sha256].join("@"),
    )
    .sort()
    .join("\n");
  const reviewedMetadata = universe.members
    .map(({ celex }) => {
      const metadata = options.sourceMetadata[celex];
      if (!metadata) {
        throw new Error(
          `Missing reviewed Earth source metadata for CELEX ${celex}`,
        );
      }
      const parsed = earthReviewedSourceMetadataEntrySchema.parse(metadata);
      return `${celex}@${JSON.stringify({
        publicationDate: parsed.publicationDate,
        measureType: parsed.measureType,
        evidenceUrl: parsed.evidenceUrl,
      })}`;
    })
    .sort()
    .join("\n");
  const normalizedUniverse = JSON.stringify({
    schemaVersion: universe.schemaVersion,
    id: universe.id,
    version: universe.version,
    displayName: universe.displayName,
    description: universe.description,
    provenance: universe.provenance,
    language: universe.language,
    expressionPolicy: universe.expressionPolicy,
    relationshipPolicy: {
      includeOfficialOneHopBoundary:
        universe.relationshipPolicy.includeOfficialOneHopBoundary,
    },
    members: [...universe.members]
      .sort((left, right) => left.celex.localeCompare(right.celex))
      .map(({ celex, label }) => ({ celex, label })),
  });
  return `earth-build:${digest(
    [
      EARTH_ARTIFACT_SCHEMA_VERSION,
      EARTH_COMPILER_VERSION,
      normalizedUniverse,
      stableInputs,
      relations.snapshot
        ? `${relations.snapshot.snapshot.snapshotId}@${relations.snapshot.snapshot.responseSha256}`
        : "no-relation-snapshot",
      reviewedMetadata,
    ].join("\n"),
  )}`;
}

const relationshipDetails = {
  "http://publications.europa.eu/ontology/cdm#resource_legal_amends_resource_legal":
    "AMENDS",
  "http://publications.europa.eu/ontology/cdm#resource_legal_corrects_resource_legal":
    "CORRECTS",
} as const;

function relationEndpoint(
  record: EarthCellarRelationRecord,
  side: "source" | "target",
) {
  return side === "source"
    ? {
        celex: record.sourceCelex,
        workUri: record.sourceWorkUri,
        officialTitle: record.sourceTitle,
      }
    : {
        celex: record.targetCelex,
        workUri: record.targetWorkUri,
        officialTitle: record.targetTitle,
      };
}

async function compileRelations(
  options: EarthCompilerOptions,
  inputs: VerifiedInput[],
): Promise<CompiledRelations> {
  if (!options.relationshipSnapshotDirectory) {
    return { boundaries: [], relationships: [] };
  }
  const snapshot = await readVerifiedEarthRelationSnapshot(
    options.relationshipSnapshotDirectory,
  );
  const includedCelexes = new Set(
    options.universe.members.map(({ celex }) => celex),
  );
  const seeds = new Set(snapshot.snapshot.seedCelexes);
  for (const celex of includedCelexes) {
    if (!seeds.has(celex)) {
      throw new Error(
        `Earth relation snapshot does not cover Universe member ${celex}`,
      );
    }
  }
  const inputsByCelex = new Map(
    inputs.map((input) => [input.snapshot.celex, input.snapshot] as const),
  );
  const boundaries = new Map<string, CompiledBoundaryWork>();
  const relationships: CompiledRelationship[] = [];
  const addBoundary = (value: ReturnType<typeof relationEndpoint>) => {
    const candidate = {
      id: `earth:work:${value.celex}`,
      celex: value.celex,
      workUri: value.workUri,
      officialTitle: value.officialTitle,
    };
    const existing = boundaries.get(value.celex);
    if (existing && JSON.stringify(existing) !== JSON.stringify(candidate)) {
      throw new Error(
        `Conflicting Earth boundary Work metadata: ${value.celex}`,
      );
    }
    boundaries.set(value.celex, candidate);
  };
  for (const record of snapshot.records) {
    if (
      !includedCelexes.has(record.sourceCelex) &&
      !includedCelexes.has(record.targetCelex)
    ) {
      continue;
    }
    for (const side of ["source", "target"] as const) {
      const value = relationEndpoint(record, side);
      const included = inputsByCelex.get(value.celex);
      if (included && included.workUri !== value.workUri) {
        throw new Error(
          `CELLAR relation Work URI conflicts with source snapshot for ${value.celex}`,
        );
      }
      if (
        !included &&
        options.universe.relationshipPolicy.includeOfficialOneHopBoundary
      ) {
        addBoundary(value);
      }
    }
    const sourceIncluded = includedCelexes.has(record.sourceCelex);
    const targetIncluded = includedCelexes.has(record.targetCelex);
    if (
      (!sourceIncluded || !targetIncluded) &&
      !options.universe.relationshipPolicy.includeOfficialOneHopBoundary
    ) {
      continue;
    }
    const sourceNodeId = `earth:work:${record.sourceCelex}`;
    const targetNodeId = `earth:work:${record.targetCelex}`;
    const relationType = relationshipDetails[record.predicate];
    const evidenceLocator = [
      record.predicate,
      record.sourceWorkUri,
      record.targetWorkUri,
    ].join("|");
    relationships.push({
      id: `relationship:${digest(
        [sourceNodeId, relationType, targetNodeId, evidenceLocator].join("\n"),
      )}`,
      sourceNodeId,
      targetNodeId,
      relationType,
      evidenceText: record.predicate,
      evidenceLocator,
      evidenceSourceUrl: record.sourceWorkUri,
    });
  }
  return {
    boundaries: [...boundaries.values()].sort((left, right) =>
      left.celex.localeCompare(right.celex),
    ),
    relationships: relationships.sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    snapshot,
  };
}

async function loadInputs(
  options: EarthCompilerOptions,
): Promise<VerifiedInput[]> {
  const inputs = await Promise.all(
    options.snapshotDirectories.map(async (directory) => ({
      directory,
      ...(await readVerifiedEarthSnapshot(directory)),
    })),
  );
  const expected = new Set(options.universe.members.map(({ celex }) => celex));
  if (inputs.length !== expected.size) {
    throw new Error(
      "Earth compiler requires exactly one snapshot per universe member",
    );
  }
  const received = new Set<string>();
  for (const input of inputs) {
    if (
      !expected.has(input.snapshot.celex) ||
      received.has(input.snapshot.celex)
    ) {
      throw new Error(
        `Unexpected or duplicate Earth snapshot CELEX: ${input.snapshot.celex}`,
      );
    }
    received.add(input.snapshot.celex);
  }
  return inputs.sort((left, right) =>
    left.snapshot.celex.localeCompare(right.snapshot.celex),
  );
}

function compileWorks(
  options: EarthCompilerOptions,
  inputs: VerifiedInput[],
): CompiledWork[] {
  return inputs.map((input) => {
    const { snapshot, contentBytes } = input;
    const member = options.universe.members.find(
      ({ celex }) => celex === snapshot.celex,
    );
    if (!member) throw new Error(`Earth member missing: ${snapshot.celex}`);
    const metadata = options.sourceMetadata[snapshot.celex];
    if (!metadata) {
      throw new Error(
        `Missing reviewed Earth source metadata for CELEX ${snapshot.celex}`,
      );
    }
    const packageContents = extractFormexPackage(contentBytes);
    const reviewedMetadata =
      earthReviewedSourceMetadataEntrySchema.parse(metadata);
    const parsed = parseFormexAct(
      packageContents.act.xml,
      sourceForParser(snapshot, member.label, reviewedMetadata),
      snapshotForParser(snapshot),
      packageContents.annexes,
    );
    const readings = auditArticleReadings(
      packageContents.act.xml,
      parsed.document.provisions,
    );
    return {
      input,
      label: member.label,
      metadata: reviewedMetadata,
      parsed,
      xmlMember: packageContents.act.fileName,
      readings,
      workId: `earth:work:${snapshot.celex}`,
    };
  });
}

/** Compiles isolated CELLAR snapshots into the Earth-only SQLite read artifact. */
export async function compileEarthArtifact(
  options: EarthCompilerOptions,
): Promise<EarthCompilerResult> {
  const inputs = await loadInputs(options);
  const compiledWorks = compileWorks(options, inputs);
  const compiledRelations = await compileRelations(options, inputs);
  const outputPath = resolve(process.cwd(), options.outputPath);
  const temporaryPath = `${outputPath}.pending-${process.pid}-${randomUUID()}`;
  const manifest = earthArtifactManifestSchema.parse({
    schemaVersion: EARTH_ARTIFACT_SCHEMA_VERSION,
    compilerVersion: EARTH_COMPILER_VERSION,
    buildId: buildId(options, inputs, compiledRelations),
    builtAt: (options.builtAt ?? new Date()).toISOString(),
    universeId: options.universe.id,
    universeVersion: options.universe.version,
    universeDisplayName: options.universe.displayName,
    sourceSnapshotIds: inputs.map(({ snapshot }) => snapshot.snapshotId),
    relationSnapshotIds: compiledRelations.snapshot
      ? [compiledRelations.snapshot.snapshot.snapshotId]
      : [],
    counts: {
      works: compiledWorks.length,
      boundaryWorks: compiledRelations.boundaries.length,
      nodes: compiledWorks.reduce(
        (total, { parsed }) =>
          total +
          1 +
          parsed.document.structuralNodes.length +
          parsed.document.provisions.filter(
            (provision) => provision.kind === "article",
          ).length,
        compiledRelations.boundaries.length,
      ),
      relationships: compiledRelations.relationships.length,
      articlesWithReading: compiledWorks.reduce(
        (total, work) => total + work.readings.length,
        0,
      ),
      readingBlocks: compiledWorks.reduce(
        (total, work) =>
          total +
          work.readings.reduce(
            (sum, article) => sum + article.blocks.length,
            0,
          ),
        0,
      ),
    },
  });
  mkdirSync(dirname(outputPath), { recursive: true });
  const database = new Database(temporaryPath);
  let completed = false;
  let nodeCount = 0;
  try {
    database.pragma("journal_mode = OFF");
    database.pragma("synchronous = OFF");
    database.pragma("foreign_keys = ON");
    writeSchema(database);
    const insertManifest = database.prepare(
      "INSERT INTO build_manifest (key, value) VALUES (?, ?)",
    );
    const insertSnapshot = database.prepare(`
      INSERT INTO source_snapshots (
        snapshot_id, celex, content_sha256, retrieved_at, work_uri, expression_uri,
        manifestation_uri, content_url, tree_notice_url, language
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertRelationSnapshot = database.prepare(`
      INSERT INTO relation_snapshots (
        snapshot_id, endpoint, query_version, retrieved_at, seed_celexes_json,
        query_sha256, response_sha256, normalized_sha256, record_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertWork = database.prepare(`
      INSERT INTO works (
        id, celex, work_uri, expression_uri, manifestation_uri, measure_type,
        metadata_source_url, official_title, snapshot_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertBoundaryWork = database.prepare(`
      INSERT INTO boundary_works (
        id, celex, work_uri, official_title, source_url
      ) VALUES (?, ?, ?, ?, ?)
    `);
    const insertNode = database.prepare(`
      INSERT INTO nodes (
        id, work_id, boundary_work_id, parent_id, entity_kind, logical_id, label,
        title, text, content_hash, source_locator, display_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertRelationship = database.prepare(`
      INSERT INTO official_relationships (
        id, source_node_id, target_node_id, relation_type, provenance,
        evidence_text, evidence_locator, evidence_source_url
      ) VALUES (?, ?, ?, ?, 'CELLAR_METADATA', ?, ?, ?)
    `);
    const insertReading = database.prepare(
      "INSERT INTO article_readings VALUES (?, ?, ?, ?)",
    );
    const insertBlock = database.prepare(
      "INSERT INTO article_reading_blocks VALUES (?, ?, ?, ?)",
    );
    const compile = database.transaction(() => {
      insertManifest.run("manifest_json", JSON.stringify(manifest));
      if (compiledRelations.snapshot) {
        const relationSnapshot = compiledRelations.snapshot.snapshot;
        insertRelationSnapshot.run(
          relationSnapshot.snapshotId,
          relationSnapshot.endpoint,
          relationSnapshot.queryVersion,
          relationSnapshot.retrievedAt,
          JSON.stringify(relationSnapshot.seedCelexes),
          relationSnapshot.querySha256,
          relationSnapshot.responseSha256,
          relationSnapshot.normalizedSha256,
          relationSnapshot.recordCount,
        );
      }
      for (const {
        input,
        label,
        metadata,
        parsed,
        workId,
        xmlMember,
        readings,
      } of compiledWorks) {
        const { snapshot } = input;
        insertSnapshot.run(
          snapshot.snapshotId,
          snapshot.celex,
          snapshot.content.sha256,
          snapshot.retrievedAt,
          snapshot.workUri,
          snapshot.expressionUri,
          snapshot.manifestationUri,
          snapshot.content.url,
          snapshot.treeNoticeUrl,
          snapshot.language,
        );
        insertWork.run(
          workId,
          snapshot.celex,
          snapshot.workUri,
          snapshot.expressionUri,
          snapshot.manifestationUri,
          metadata.measureType,
          metadata.evidenceUrl,
          parsed.document.officialTitle,
          snapshot.snapshotId,
        );
        insertNode.run(
          workId,
          workId,
          null,
          null,
          "document",
          parsed.document.logicalId,
          label,
          parsed.document.officialTitle,
          null,
          null,
          "/ACT",
          0,
        );
        nodeCount += 1;
        const parentId = (logicalId: string | undefined) =>
          !logicalId || logicalId === parsed.document.logicalId
            ? workId
            : nodeId(logicalId);
        for (const structuralNode of parsed.document.structuralNodes) {
          insertNode.run(
            nodeId(structuralNode.logicalId),
            workId,
            null,
            parentId(structuralNode.parentLogicalId),
            structuralNode.kind,
            structuralNode.logicalId,
            structuralNode.label,
            structuralNode.title ?? null,
            null,
            null,
            `${structuralNode.sourceLocator.kind}:${structuralNode.sourceLocator.value}`,
            structuralNode.displayOrder,
          );
          nodeCount += 1;
        }
        for (const article of parsed.document.provisions.filter(
          (provision) => provision.kind === "article",
        )) {
          insertNode.run(
            nodeId(article.logicalId),
            workId,
            null,
            parentId(article.parentLogicalId),
            "article",
            article.logicalId,
            article.label,
            article.title ?? null,
            article.text,
            article.contentHash,
            `${article.sourceLocator.kind}:${article.sourceLocator.value}`,
            article.displayOrder,
          );
          nodeCount += 1;
        }
        for (const reading of readings) {
          const articleId = nodeId(reading.article.logicalId);
          insertReading.run(
            articleId,
            reading.sourcePath,
            xmlMember,
            reading.blocks.length,
          );
          for (const block of reading.blocks)
            insertBlock.run(
              block.id,
              articleId,
              block.parentId,
              JSON.stringify(block),
            );
        }
      }
      for (const boundary of compiledRelations.boundaries) {
        insertBoundaryWork.run(
          boundary.id,
          boundary.celex,
          boundary.workUri,
          boundary.officialTitle ?? null,
          boundary.workUri,
        );
        insertNode.run(
          boundary.id,
          null,
          boundary.id,
          null,
          "external-work",
          boundary.id,
          `CELEX ${boundary.celex}`,
          boundary.officialTitle ?? null,
          null,
          null,
          boundary.workUri,
          0,
        );
        nodeCount += 1;
      }
      for (const relationship of compiledRelations.relationships) {
        insertRelationship.run(
          relationship.id,
          relationship.sourceNodeId,
          relationship.targetNodeId,
          relationship.relationType,
          relationship.evidenceText,
          relationship.evidenceLocator,
          relationship.evidenceSourceUrl,
        );
      }
    });
    compile();
    verifyStagingArtifact(database, manifest);
    database.close();
    renameSync(temporaryPath, outputPath);
    completed = true;
  } finally {
    if (database.open) database.close();
    if (!completed) {
      try {
        unlinkSync(temporaryPath);
      } catch {
        // A failed compiler must not conceal its original error during cleanup.
      }
    }
  }
  return { outputPath, manifest, workCount: compiledWorks.length, nodeCount };
}
