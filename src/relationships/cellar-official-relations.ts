import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CELLAR_FOCUSED_PREDICATES,
  type CellarFocusedRelationRecord,
  cellarFocusedRelationDatasetSchema,
  validateCellarFocusedRelationRecords,
} from "../ingestion/cellar-relations";
import type { DocumentView } from "../shared/legal";
import { type RelationshipRecord, relationshipId } from "./contract";
import type { LegalEntityRecord } from "./explicit-reference";

export const CELLAR_RELATIONSHIP_BUILDER = "cellar-focused-relations";
export const CELLAR_RELATIONSHIP_BUILDER_VERSION = "1.0.0";
export const DEFAULT_CELLAR_RELATIONS_PATH = resolve(
  process.cwd(),
  "data/official-metadata/cellar-focused-relations.json",
);

export function loadCellarOfficialRelations(
  inputPath = DEFAULT_CELLAR_RELATIONS_PATH,
): CellarFocusedRelationRecord[] {
  const dataset = cellarFocusedRelationDatasetSchema.parse(
    JSON.parse(readFileSync(inputPath, "utf8")),
  );
  return validateCellarFocusedRelationRecords(dataset.records);
}

export function buildCellarOfficialRelations(
  documents: DocumentView[],
  entities: LegalEntityRecord[],
  records = loadCellarOfficialRelations(),
): RelationshipRecord[] {
  const documentsByCelex = new Map(
    documents.flatMap((document) =>
      document.celex ? [[document.celex, document] as const] : [],
    ),
  );
  const entitiesById = new Map(entities.map((entity) => [entity.id, entity]));

  return validateCellarFocusedRelationRecords(records)
    .map((record): RelationshipRecord => {
      const sourceDocument = documentsByCelex.get(record.sourceCelex);
      const targetDocument = documentsByCelex.get(record.targetCelex);
      if (!sourceDocument || !targetDocument) {
        throw new Error(
          `CELLAR relation requires loaded documents ${record.sourceCelex} and ${record.targetCelex}`,
        );
      }
      const sourceEntity = entitiesById.get(sourceDocument.id);
      const targetEntity = entitiesById.get(targetDocument.id);
      if (
        sourceEntity?.kind !== "document" ||
        targetEntity?.kind !== "document"
      ) {
        throw new Error(
          `CELLAR relation has invalid document endpoints: ${record.sourceCelex} → ${record.targetCelex}`,
        );
      }
      const mapping = CELLAR_FOCUSED_PREDICATES[record.predicate];
      const evidenceLocator = `${record.predicate}|${record.sourceWorkUri}|${record.targetWorkUri}`;
      return {
        id: relationshipId(
          sourceEntity.id,
          mapping.relationType,
          targetEntity.id,
          "OFFICIAL_METADATA",
          evidenceLocator,
        ),
        sourceEntityId: sourceEntity.id,
        relationType: mapping.relationType,
        targetEntityId: targetEntity.id,
        provenance: "OFFICIAL_METADATA",
        evidenceText: mapping.label,
        evidenceLocator,
        sourceRef: record.sourceWorkUri,
        builderMethod: CELLAR_RELATIONSHIP_BUILDER,
        builderVersion: CELLAR_RELATIONSHIP_BUILDER_VERSION,
        resolutionStatus: "resolved",
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}
