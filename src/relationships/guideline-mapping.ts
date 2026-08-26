import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import type { BodyBlock, DocumentView } from "../shared/legal";
import { type RelationshipRecord, relationshipId } from "./contract";
import type { LegalEntityRecord } from "./explicit-reference";

export const GUIDELINE_MAPPING_BUILDER = "guideline-mapping";
export const GUIDELINE_MAPPING_BUILDER_VERSION = "1.0.0";
export const DEFAULT_GUIDELINE_MAPPING_PATH = resolve(
  process.cwd(),
  "data/official-mappings/guidelines.json",
);

const evidenceSchema = z
  .object({
    entityId: z.string().min(1),
    text: z.string().min(1),
    sourceUrl: z.string().url(),
  })
  .strict();

const guidelineMappingSchema = z
  .object({
    id: z.string().startsWith("guideline-mapping:"),
    familyId: z.string().startsWith("family:"),
    primaryAct: z
      .object({
        documentId: z.string().min(1),
        articleEntityId: z.string().min(1),
        mandateEvidence: evidenceSchema,
      })
      .strict(),
    guideline: z
      .object({
        documentId: z.string().min(1),
        provisionEntityId: z.string().min(1),
        supplementEvidence: evidenceSchema,
      })
      .strict(),
    provenance: z.literal("OFFICIAL_MAPPING"),
  })
  .strict();

const datasetSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    checkedAt: z.string().date(),
    records: z.array(guidelineMappingSchema),
  })
  .strict();

export type GuidelineMapping = z.infer<typeof guidelineMappingSchema>;

function blockText(blocks: BodyBlock[], entityId: string): string | null {
  for (const block of blocks) {
    if (block.id === entityId) return block.text;
    const nested = blockText(block.children, entityId);
    if (nested !== null) return nested;
  }
  return null;
}

function evidenceText(
  documents: Map<string, DocumentView>,
  documentId: string,
  rootProvisionId: string,
  entityId: string,
): string | null {
  const provision = documents
    .get(documentId)
    ?.provisions.find((candidate) => candidate.id === rootProvisionId);
  return provision ? blockText(provision.blocks, entityId) : null;
}

export function loadGuidelineMappings(
  path = DEFAULT_GUIDELINE_MAPPING_PATH,
): GuidelineMapping[] {
  const dataset = datasetSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  const ids = dataset.records.map((record) => record.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Guideline mapping IDs must be unique");
  }
  return dataset.records;
}

export function buildGuidelineMappings(
  inputDocuments: DocumentView[],
  entities: LegalEntityRecord[],
  mappings = loadGuidelineMappings(),
): RelationshipRecord[] {
  const documents = new Map(
    inputDocuments.map((document) => [document.id, document]),
  );
  const entitiesById = new Map(entities.map((entity) => [entity.id, entity]));
  return mappings
    .flatMap((mapping): RelationshipRecord[] => {
      const primaryAct = documents.get(mapping.primaryAct.documentId);
      const guideline = documents.get(mapping.guideline.documentId);
      const article = entitiesById.get(mapping.primaryAct.articleEntityId);
      const guidelineDocument = entitiesById.get(mapping.guideline.documentId);
      const guidelineProvision = entitiesById.get(
        mapping.guideline.provisionEntityId,
      );
      if (
        !primaryAct ||
        !guideline ||
        article?.kind !== "article" ||
        guidelineDocument?.kind !== "document" ||
        !guidelineProvision ||
        guidelineProvision.rootProvisionId !== null
      ) {
        throw new Error(
          `Guideline mapping ${mapping.id} has invalid endpoints`,
        );
      }
      const mandateText = evidenceText(
        documents,
        primaryAct.id,
        article.id,
        mapping.primaryAct.mandateEvidence.entityId,
      );
      const supplementText = evidenceText(
        documents,
        guideline.id,
        guidelineProvision.id,
        mapping.guideline.supplementEvidence.entityId,
      );
      if (!mandateText?.includes(mapping.primaryAct.mandateEvidence.text)) {
        throw new Error(`Mandate evidence mismatch for ${mapping.id}`);
      }
      if (
        !supplementText?.includes(mapping.guideline.supplementEvidence.text)
      ) {
        throw new Error(`Supplement evidence mismatch for ${mapping.id}`);
      }
      const mandateLocator = `${mapping.id}:mandate:${mapping.primaryAct.mandateEvidence.entityId}`;
      const supplementLocator = `${mapping.id}:supplement:${mapping.guideline.supplementEvidence.entityId}`;
      return [
        {
          id: relationshipId(
            article.id,
            "MANDATES",
            guidelineDocument.id,
            mapping.provenance,
            mandateLocator,
          ),
          sourceEntityId: article.id,
          relationType: "MANDATES",
          targetEntityId: guidelineDocument.id,
          provenance: mapping.provenance,
          evidenceText: mapping.primaryAct.mandateEvidence.text,
          evidenceLocator: mandateLocator,
          sourceRef: mapping.primaryAct.mandateEvidence.sourceUrl,
          builderMethod: GUIDELINE_MAPPING_BUILDER,
          builderVersion: GUIDELINE_MAPPING_BUILDER_VERSION,
          resolutionStatus: "resolved",
        },
        {
          id: relationshipId(
            guidelineProvision.id,
            "SUPPLEMENTS",
            article.id,
            mapping.provenance,
            supplementLocator,
          ),
          sourceEntityId: guidelineProvision.id,
          relationType: "SUPPLEMENTS",
          targetEntityId: article.id,
          provenance: mapping.provenance,
          evidenceText: mapping.guideline.supplementEvidence.text,
          evidenceLocator: supplementLocator,
          sourceRef: mapping.guideline.supplementEvidence.sourceUrl,
          builderMethod: GUIDELINE_MAPPING_BUILDER,
          builderVersion: GUIDELINE_MAPPING_BUILDER_VERSION,
          resolutionStatus: "resolved",
        },
      ];
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}
