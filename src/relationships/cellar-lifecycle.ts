import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { documentLogicalId } from "../canonical/ids";
import {
  type CellarLifecycleRelationRecord,
  cellarLifecycleRelationDatasetSchema,
  validateCellarLifecycleRelationRecords,
} from "../ingestion/cellar-lifecycle-relations";
import type { DocumentView } from "../shared/legal";
import { type RelationshipProvenance, relationshipId } from "./contract";

export const CELLAR_LIFECYCLE_BUILDER = "cellar-lifecycle";
export const CELLAR_LIFECYCLE_BUILDER_VERSION = "1.0.0";
export const DEFAULT_CELLAR_LIFECYCLE_PATH = resolve(
  process.cwd(),
  "data/official-metadata/cellar-lifecycle-relations.json",
);

export interface LegalWorkRecord {
  id: string;
  celex: string;
  cellarWorkUri: string;
  loadedDocumentId: string | null;
  label: string;
  title: string | null;
  sourceUrl: string;
  availability: "loaded" | "external";
}

export interface LifecycleRelationshipRecord {
  id: string;
  sourceWorkId: string;
  relationType: "AMENDS" | "CORRECTS";
  targetWorkId: string;
  provenance: RelationshipProvenance;
  evidenceText: string;
  evidenceLocator: string;
  sourceRef: string;
  builderMethod: typeof CELLAR_LIFECYCLE_BUILDER;
  builderVersion: typeof CELLAR_LIFECYCLE_BUILDER_VERSION;
  resolutionStatus: "resolved" | "external";
}

export interface CellarLifecycleBuild {
  works: LegalWorkRecord[];
  relationships: LifecycleRelationshipRecord[];
}

const predicateDetails = {
  "http://publications.europa.eu/ontology/cdm#resource_legal_amends_resource_legal":
    {
      relationType: "AMENDS",
      evidenceText: "Legal resource amends legal resource",
    },
  "http://publications.europa.eu/ontology/cdm#resource_legal_corrects_resource_legal":
    {
      relationType: "CORRECTS",
      evidenceText: "Legal resource corrects legal resource",
    },
} as const;

export function loadCellarLifecycleRelations(
  inputPath = DEFAULT_CELLAR_LIFECYCLE_PATH,
): CellarLifecycleRelationRecord[] {
  const dataset = cellarLifecycleRelationDatasetSchema.parse(
    JSON.parse(readFileSync(inputPath, "utf8")),
  );
  return validateCellarLifecycleRelationRecords(
    dataset.records,
    dataset.seedCelexes,
  );
}

function externalLabel(celex: string): string {
  const correction = /R\(([0-9]+)\)$/u.exec(celex);
  return correction
    ? `Corrigendum ${Number.parseInt(correction[1], 10)}`
    : `CELEX ${celex}`;
}

export function buildCellarLifecycle(
  documents: DocumentView[],
  records = loadCellarLifecycleRelations(),
): CellarLifecycleBuild {
  const documentsByCelex = new Map(
    documents.flatMap((document) =>
      document.celex ? [[document.celex, document] as const] : [],
    ),
  );
  const works = new Map<string, LegalWorkRecord>();

  function addWork(celex: string, cellarWorkUri: string): LegalWorkRecord {
    const id = documentLogicalId(celex);
    const existing = works.get(id);
    if (existing && existing.cellarWorkUri !== cellarWorkUri) {
      throw new Error(`Conflicting CELLAR Work URI for ${celex}`);
    }
    if (existing) return existing;
    const document = documentsByCelex.get(celex);
    const work: LegalWorkRecord = document
      ? {
          id,
          celex,
          cellarWorkUri,
          loadedDocumentId: document.id,
          label: document.shortName,
          title: document.officialTitle,
          sourceUrl: document.sourceUrl,
          availability: "loaded",
        }
      : {
          id,
          celex,
          cellarWorkUri,
          loadedDocumentId: null,
          label: externalLabel(celex),
          title: null,
          sourceUrl: cellarWorkUri,
          availability: "external",
        };
    works.set(id, work);
    return work;
  }

  const relationships = validateCellarLifecycleRelationRecords(records)
    .filter(
      (record) =>
        documentsByCelex.has(record.sourceCelex) ||
        documentsByCelex.has(record.targetCelex),
    )
    .map((record): LifecycleRelationshipRecord => {
      const source = addWork(record.sourceCelex, record.sourceWorkUri);
      const target = addWork(record.targetCelex, record.targetWorkUri);
      const details = predicateDetails[record.predicate];
      const evidenceLocator = `${record.predicate}|${record.sourceWorkUri}|${record.targetWorkUri}`;
      return {
        id: relationshipId(
          source.id,
          details.relationType,
          target.id,
          "OFFICIAL_METADATA",
          evidenceLocator,
        ),
        sourceWorkId: source.id,
        relationType: details.relationType,
        targetWorkId: target.id,
        provenance: "OFFICIAL_METADATA",
        evidenceText: details.evidenceText,
        evidenceLocator,
        sourceRef: record.sourceWorkUri,
        builderMethod: CELLAR_LIFECYCLE_BUILDER,
        builderVersion: CELLAR_LIFECYCLE_BUILDER_VERSION,
        resolutionStatus:
          source.availability === "loaded" && target.availability === "loaded"
            ? "resolved"
            : "external",
      };
    });

  return {
    works: [...works.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    relationships: relationships.sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
  };
}
