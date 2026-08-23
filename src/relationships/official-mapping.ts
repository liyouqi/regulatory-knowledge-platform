import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import type { BodyBlock, DocumentView } from "../shared/legal";
import { type RelationshipRecord, relationshipId } from "./contract";
import type { LegalEntityRecord } from "./explicit-reference";

export const OFFICIAL_MAPPING_BUILDER = "official-mapping";
export const OFFICIAL_MAPPING_BUILDER_VERSION = "1.0.0";
export const DEFAULT_OFFICIAL_MAPPING_PATH = resolve(
  process.cwd(),
  "data/official-mappings/level2.json",
);

const evidenceSchema = z.object({
  entityId: z.string().min(1),
  text: z.string().min(1),
  sourceUrl: z.string().url(),
});

export const officialMappingRecordSchema = z.object({
  id: z.string().regex(/^official-mapping:[a-z0-9:-]+$/),
  familyId: z.string().regex(/^family:[a-z0-9-]+$/),
  level1: z.object({
    celex: z.string().regex(/^3[0-9]{4}[A-Z][0-9]{4}$/),
    articleEntityId: z.string().min(1),
    mandateEvidence: evidenceSchema,
  }),
  level2: z.object({
    celex: z.string().regex(/^3[0-9]{4}[A-Z][0-9]{4}$/),
    measureType: z.enum(["rts", "its"]),
    officialTitle: z.string().min(1),
    documentNumber: z.string().min(1),
    adoptionEvidence: z.object({
      text: z.string().min(1),
      sourceUrl: z.string().url(),
    }),
  }),
  provenance: z.literal("OFFICIAL_MAPPING"),
});

export const officialMappingDatasetSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  checkedAt: z.string().date(),
  records: z.array(officialMappingRecordSchema),
});

export type OfficialMappingRecord = z.infer<typeof officialMappingRecordSchema>;

function blockTextById(blocks: BodyBlock[], targetId: string): string | null {
  for (const block of blocks) {
    if (block.id === targetId) return block.text;
    const nested = blockTextById(block.children, targetId);
    if (nested !== null) return nested;
  }
  return null;
}

export function loadOfficialMappings(
  mappingPath = DEFAULT_OFFICIAL_MAPPING_PATH,
): OfficialMappingRecord[] {
  const dataset = officialMappingDatasetSchema.parse(
    JSON.parse(readFileSync(mappingPath, "utf8")),
  );
  const ids = new Set<string>();
  for (const record of dataset.records) {
    if (ids.has(record.id)) {
      throw new Error(`Duplicate official mapping ID: ${record.id}`);
    }
    ids.add(record.id);
  }
  return dataset.records;
}

export function buildOfficialMappings(
  documents: DocumentView[],
  entities: LegalEntityRecord[],
  mappings = loadOfficialMappings(),
): RelationshipRecord[] {
  const documentsByCelex = new Map(
    documents.map((document) => [document.celex, document]),
  );
  const entitiesById = new Map(entities.map((entity) => [entity.id, entity]));
  const relationships: RelationshipRecord[] = [];

  for (const mapping of mappings) {
    const level1 = documentsByCelex.get(mapping.level1.celex);
    const level2 = documentsByCelex.get(mapping.level2.celex);
    if (!level1 || !level2) {
      throw new Error(
        `Official mapping ${mapping.id} requires loaded documents ${mapping.level1.celex} and ${mapping.level2.celex}`,
      );
    }
    if (level2.officialTitle !== mapping.level2.officialTitle) {
      throw new Error(`Official title mismatch for ${mapping.id}`);
    }

    const article = entitiesById.get(mapping.level1.articleEntityId);
    const target = entitiesById.get(level2.id);
    if (
      !article ||
      article.kind !== "article" ||
      article.documentId !== level1.id ||
      !target ||
      target.kind !== "document"
    ) {
      throw new Error(`Official mapping ${mapping.id} has an invalid endpoint`);
    }

    const provision = level1.provisions.find(
      (candidate) => candidate.id === article.id,
    );
    const evidenceText = provision
      ? blockTextById(provision.blocks, mapping.level1.mandateEvidence.entityId)
      : null;
    if (!evidenceText?.includes(mapping.level1.mandateEvidence.text)) {
      throw new Error(`Mandate evidence mismatch for ${mapping.id}`);
    }

    const mandateLocator = `${mapping.id}:mandate:${mapping.level1.mandateEvidence.entityId}`;
    relationships.push({
      id: relationshipId(
        article.id,
        "MANDATES",
        target.id,
        "OFFICIAL_MAPPING",
        mandateLocator,
      ),
      sourceEntityId: article.id,
      relationType: "MANDATES",
      targetEntityId: target.id,
      provenance: "OFFICIAL_MAPPING",
      evidenceText: mapping.level1.mandateEvidence.text,
      evidenceLocator: mandateLocator,
      sourceRef: mapping.level1.mandateEvidence.sourceUrl,
      builderMethod: OFFICIAL_MAPPING_BUILDER,
      builderVersion: OFFICIAL_MAPPING_BUILDER_VERSION,
      resolutionStatus: "resolved",
    });

    const adoptionLocator = `${mapping.id}:adoption-basis`;
    relationships.push({
      id: relationshipId(
        target.id,
        "ADOPTED_UNDER",
        article.id,
        "OFFICIAL_MAPPING",
        adoptionLocator,
      ),
      sourceEntityId: target.id,
      relationType: "ADOPTED_UNDER",
      targetEntityId: article.id,
      provenance: "OFFICIAL_MAPPING",
      evidenceText: mapping.level2.adoptionEvidence.text,
      evidenceLocator: adoptionLocator,
      sourceRef: mapping.level2.adoptionEvidence.sourceUrl,
      builderMethod: OFFICIAL_MAPPING_BUILDER,
      builderVersion: OFFICIAL_MAPPING_BUILDER_VERSION,
      resolutionStatus: "resolved",
    });
  }

  return relationships.sort((left, right) => left.id.localeCompare(right.id));
}
