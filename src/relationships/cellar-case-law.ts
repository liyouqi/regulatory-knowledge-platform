import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { caseLogicalId } from "../canonical/ids";
import {
  type CellarCaseLawMetadataRecord,
  cellarCaseLawMetadataDatasetSchema,
} from "../ingestion/cellar-case-law-metadata";
import type { DocumentView } from "../shared/legal";
import { relationshipId } from "./contract";

export const CELLAR_CASE_LAW_BUILDER = "cellar-case-law";
export const CELLAR_CASE_LAW_BUILDER_VERSION = "1.0.0";
export const DEFAULT_CELLAR_CASE_LAW_PATH = resolve(
  process.cwd(),
  "data/official-metadata/cellar-case-law.json",
);

export interface CaseEntityRecord {
  id: string;
  celex: string;
  cellarWorkUri: string;
  ecli: string;
  caseNumber: string;
  caseName: string;
  decisionType: "judgment" | "order";
  decisionDate: string;
  officialTitle: string;
  sourceUrl: string;
}

export interface CaseLawRelationshipRecord {
  id: string;
  caseId: string;
  relationType: "INTERPRETS";
  targetDocumentId: string;
  provenance: "OFFICIAL_METADATA";
  evidenceText: "CELLAR case-law_interpretes_resource_legal";
  evidenceLocator: string;
  sourceRef: string;
  builderMethod: typeof CELLAR_CASE_LAW_BUILDER;
  builderVersion: typeof CELLAR_CASE_LAW_BUILDER_VERSION;
  resolutionStatus: "metadata-only";
}

export interface CellarCaseLawBuild {
  cases: CaseEntityRecord[];
  relationships: CaseLawRelationshipRecord[];
}

export function loadCellarCaseLawMetadata(
  inputPath = DEFAULT_CELLAR_CASE_LAW_PATH,
): CellarCaseLawMetadataRecord[] {
  const dataset = cellarCaseLawMetadataDatasetSchema.parse(
    JSON.parse(readFileSync(inputPath, "utf8")),
  );
  return dataset.records;
}

function officialTitleParts(officialTitle: string): {
  caseNumber: string;
  caseName: string;
  decisionType: "judgment" | "order";
} {
  const parts = officialTitle.split("#").map((part) => part.trim());
  const heading = parts[0];
  const caseName = parts[1];
  const caseNumber = parts.at(-1);
  if (
    (!heading?.startsWith("Judgment of the Court") &&
      !heading?.startsWith("Order of the Court")) ||
    !caseName ||
    !caseNumber ||
    !/^(?:Case|Joined Cases) C-\d+\/\d+(?:(?:,| and) C-\d+\/\d+)*\.$/u.test(
      caseNumber,
    )
  ) {
    throw new Error("Unsupported official CJEU English title structure");
  }
  return {
    caseNumber,
    caseName,
    decisionType: heading.startsWith("Judgment") ? "judgment" : "order",
  };
}

export function buildCellarCaseLaw(
  documents: DocumentView[],
  records = loadCellarCaseLawMetadata(),
): CellarCaseLawBuild {
  const documentsByCelex = new Map(
    documents.flatMap((document) =>
      document.celex ? [[document.celex, document] as const] : [],
    ),
  );
  const cases = new Map<string, CaseEntityRecord>();
  const relationships = records.flatMap(
    (record): CaseLawRelationshipRecord[] => {
      const target = documentsByCelex.get(record.targetCelex);
      if (!target) return [];
      const id = caseLogicalId(record.caseCelex);
      const title = officialTitleParts(record.englishTitle);
      const candidate: CaseEntityRecord = {
        id,
        celex: record.caseCelex,
        cellarWorkUri: record.caseWorkUri,
        ecli: record.ecli,
        caseNumber: title.caseNumber,
        caseName: title.caseName,
        decisionType: title.decisionType,
        decisionDate: record.decisionDate,
        officialTitle: record.englishTitle,
        sourceUrl: record.caseWorkUri,
      };
      const existing = cases.get(id);
      if (existing && JSON.stringify(existing) !== JSON.stringify(candidate)) {
        throw new Error(`Conflicting reviewed CJEU case metadata for ${id}`);
      }
      cases.set(id, candidate);
      const evidenceLocator = `${record.predicate}|${record.caseWorkUri}|${record.targetWorkUri}`;
      return [
        {
          id: relationshipId(
            id,
            "INTERPRETS",
            target.id,
            "OFFICIAL_METADATA",
            evidenceLocator,
          ),
          caseId: id,
          relationType: "INTERPRETS" as const,
          targetDocumentId: target.id,
          provenance: "OFFICIAL_METADATA" as const,
          evidenceText: "CELLAR case-law_interpretes_resource_legal" as const,
          evidenceLocator,
          sourceRef: record.caseWorkUri,
          builderMethod: CELLAR_CASE_LAW_BUILDER,
          builderVersion: CELLAR_CASE_LAW_BUILDER_VERSION,
          resolutionStatus: "metadata-only" as const,
        },
      ];
    },
  );

  return {
    cases: [...cases.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    relationships: relationships.sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
  };
}
