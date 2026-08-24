import { createHash } from "node:crypto";

export type RelationshipType =
  | "REFERENCES"
  | "MANDATES"
  | "ADOPTED_UNDER"
  | "AMENDS"
  | "CORRECTS"
  | "SUPPLEMENTS"
  | "RELATED_DOCUMENT"
  | "RELATED_RECITAL";

export type RelationshipProvenance =
  | "LEGAL_TEXT"
  | "OFFICIAL_METADATA"
  | "OFFICIAL_MAPPING"
  | "CASE_TEXT"
  | "EDITORIAL"
  | "TFIDF";

export interface RelationshipRecord {
  id: string;
  sourceEntityId: string;
  relationType: RelationshipType;
  targetEntityId: string;
  provenance: RelationshipProvenance;
  evidenceText: string;
  evidenceLocator: string;
  sourceRef: string;
  builderMethod: string;
  builderVersion: string;
  resolutionStatus: "resolved";
  score?: number;
}

export function relationshipId(
  sourceEntityId: string,
  relationType: RelationshipType,
  targetEntityId: string,
  provenance: RelationshipProvenance,
  evidenceLocator: string,
): string {
  const hash = createHash("sha256")
    .update(
      [
        sourceEntityId,
        relationType,
        targetEntityId,
        provenance,
        evidenceLocator,
      ].join("\n"),
    )
    .digest("hex")
    .slice(0, 24);
  return `relationship:${hash}`;
}
