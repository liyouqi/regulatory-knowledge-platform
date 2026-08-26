import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import type { BodyBlock, DocumentView } from "../shared/legal";
import { type RelationshipRecord, relationshipId } from "./contract";
import type { LegalEntityRecord } from "./explicit-reference";

export const NATIONAL_IMPLEMENTATION_BUILDER = "national-implementation";
export const NATIONAL_IMPLEMENTATION_BUILDER_VERSION = "1.0.0";
export const DEFAULT_NATIONAL_IMPLEMENTATION_PATH = resolve(
  process.cwd(),
  "data/official-mappings/national-implementations.json",
);

const mappingSchema = z
  .object({
    id: z.string().startsWith("national-implementation:"),
    jurisdiction: z.string().length(2),
    implementingDocumentId: z.string().min(1),
    sourceEntityId: z.string().min(1),
    implementedDocumentId: z.string().min(1),
    evidence: z
      .object({
        entityId: z.string().min(1),
        text: z.string().min(1),
        sourceUrl: z.string().url(),
      })
      .strict(),
    provenance: z.literal("OFFICIAL_MAPPING"),
    reviewStatus: z.literal("reviewed"),
  })
  .strict();

const datasetSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    checkedAt: z.string().date(),
    records: z.array(mappingSchema),
  })
  .strict();

export type NationalImplementationMapping = z.infer<typeof mappingSchema>;

function findBlockText(blocks: BodyBlock[], entityId: string): string | null {
  for (const block of blocks) {
    if (block.id === entityId) return block.text;
    const nested = findBlockText(block.children, entityId);
    if (nested !== null) return nested;
  }
  return null;
}

function evidenceText(
  document: DocumentView,
  entity: LegalEntityRecord,
): string | null {
  const rootProvisionId = entity.rootProvisionId ?? entity.id;
  const provision = document.provisions.find(
    (candidate) => candidate.id === rootProvisionId,
  );
  return provision ? findBlockText(provision.blocks, entity.id) : null;
}

export function loadNationalImplementationMappings(
  path = DEFAULT_NATIONAL_IMPLEMENTATION_PATH,
): NationalImplementationMapping[] {
  const dataset = datasetSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  const ids = dataset.records.map((record) => record.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("National implementation mapping IDs must be unique");
  }
  return dataset.records;
}

export function buildNationalImplementationMappings(
  inputDocuments: DocumentView[],
  entities: LegalEntityRecord[],
  mappings = loadNationalImplementationMappings(),
): RelationshipRecord[] {
  const documents = new Map(
    inputDocuments.map((document) => [document.id, document]),
  );
  const entitiesById = new Map(entities.map((entity) => [entity.id, entity]));

  return mappings
    .map((mapping): RelationshipRecord => {
      const implementingDocument = documents.get(
        mapping.implementingDocumentId,
      );
      const implementedDocument = documents.get(mapping.implementedDocumentId);
      const sourceEntity = entitiesById.get(mapping.sourceEntityId);
      const targetEntity = entitiesById.get(mapping.implementedDocumentId);
      const evidenceEntity = entitiesById.get(mapping.evidence.entityId);

      if (
        !implementingDocument ||
        !implementedDocument ||
        sourceEntity?.documentId !== implementingDocument.id ||
        !sourceEntity.rootProvisionId ||
        evidenceEntity?.documentId !== implementingDocument.id ||
        evidenceEntity.id !== sourceEntity.id ||
        targetEntity?.kind !== "document" ||
        targetEntity.documentId !== implementedDocument.id ||
        implementingDocument.jurisdiction !== mapping.jurisdiction
      ) {
        throw new Error(
          `National implementation mapping ${mapping.id} has invalid endpoints`,
        );
      }

      const text = evidenceText(implementingDocument, evidenceEntity);
      if (!text?.includes(mapping.evidence.text)) {
        throw new Error(`Implementation evidence mismatch for ${mapping.id}`);
      }

      const evidenceLocator = `${mapping.id}:${mapping.evidence.entityId}`;
      return {
        id: relationshipId(
          sourceEntity.id,
          "IMPLEMENTS",
          targetEntity.id,
          mapping.provenance,
          evidenceLocator,
        ),
        sourceEntityId: sourceEntity.id,
        relationType: "IMPLEMENTS",
        targetEntityId: targetEntity.id,
        provenance: mapping.provenance,
        evidenceText: mapping.evidence.text,
        evidenceLocator,
        sourceRef: mapping.evidence.sourceUrl,
        builderMethod: NATIONAL_IMPLEMENTATION_BUILDER,
        builderVersion: NATIONAL_IMPLEMENTATION_BUILDER_VERSION,
        resolutionStatus: "resolved",
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}
