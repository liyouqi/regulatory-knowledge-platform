import { describe, expect, it } from "vitest";
import { loadDocumentViews } from "../data/document-repository";
import { buildExplicitReferences } from "./explicit-reference";
import {
  OFFICIAL_MAPPING_BUILDER,
  OFFICIAL_MAPPING_BUILDER_VERSION,
  buildOfficialMappings,
  loadOfficialMappings,
} from "./official-mapping";

const documents = loadDocumentViews();
const entities = buildExplicitReferences(documents).entities;

describe("official Level 2 mapping builder", () => {
  it("builds paired mandate and adoption edges from reviewed source data", () => {
    const relationships = buildOfficialMappings(documents, entities);

    expect(relationships).toHaveLength(6);
    expect(relationships).toContainEqual(
      expect.objectContaining({
        sourceEntityId: "eu:32022R2554:article:15",
        relationType: "MANDATES",
        targetEntityId: "eu:32024R1774",
        provenance: "OFFICIAL_MAPPING",
        builderMethod: OFFICIAL_MAPPING_BUILDER,
        builderVersion: OFFICIAL_MAPPING_BUILDER_VERSION,
      }),
    );
    expect(relationships).toContainEqual(
      expect.objectContaining({
        sourceEntityId: "eu:32025R0305",
        relationType: "ADOPTED_UNDER",
        targetEntityId: "eu:32023R1114:article:62",
      }),
    );
  });

  it("rejects a mapping whose exact mandate evidence is not in the official Article", () => {
    const mappings = loadOfficialMappings();
    const invalid = structuredClone(mappings);
    invalid[0].level1.mandateEvidence.text = "invented mandate";

    expect(() => buildOfficialMappings(documents, entities, invalid)).toThrow(
      "Mandate evidence mismatch",
    );
  });

  it("produces deterministic unique relationship IDs", () => {
    const relationships = buildOfficialMappings(documents, entities);
    expect(new Set(relationships.map((item) => item.id)).size).toBe(
      relationships.length,
    );
    expect(buildOfficialMappings(documents, entities)).toEqual(relationships);
  });
});
