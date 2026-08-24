import { describe, expect, it } from "vitest";
import { loadDocumentViews } from "../data/document-repository";
import {
  buildCellarOfficialRelations,
  loadCellarOfficialRelations,
} from "./cellar-official-relations";
import { buildExplicitReferences } from "./explicit-reference";

describe("CELLAR official relationship builder", () => {
  const documents = loadDocumentViews();
  const entities = buildExplicitReferences(documents).entities;

  it("publishes only reviewed closed-corpus structural relationships", () => {
    const relationships = buildCellarOfficialRelations(documents, entities);

    expect(relationships).toHaveLength(12);
    expect(
      relationships.filter((item) => item.relationType === "ADOPTED_UNDER"),
    ).toHaveLength(7);
    expect(
      relationships.filter((item) => item.relationType === "SUPPLEMENTS"),
    ).toHaveLength(5);
    expect(relationships).toContainEqual(
      expect.objectContaining({
        sourceEntityId: "eu:32025R0301",
        relationType: "SUPPLEMENTS",
        targetEntityId: "eu:32022R2554",
        provenance: "OFFICIAL_METADATA",
        evidenceText: "Legal resource completes legal resource",
        sourceRef:
          "https://publications.europa.eu/resource/cellar/36795cde-ef2b-11ef-981b-01aa75ed71a1",
        builderMethod: "cellar-focused-relations",
        builderVersion: "1.0.0",
      }),
    );
    expect(relationships).toContainEqual(
      expect.objectContaining({
        sourceEntityId: "eu:32025R0305",
        relationType: "ADOPTED_UNDER",
        targetEntityId: "eu:32023R1114",
        provenance: "OFFICIAL_METADATA",
      }),
    );
  });

  it("is deterministic and fails when a reviewed endpoint is not loaded", () => {
    const records = loadCellarOfficialRelations();
    const first = buildCellarOfficialRelations(documents, entities, records);
    expect(buildCellarOfficialRelations(documents, entities, records)).toEqual(
      first,
    );
    expect(new Set(first.map((item) => item.id)).size).toBe(first.length);
    expect(() =>
      buildCellarOfficialRelations(
        documents.filter((document) => document.celex !== "32022R2554"),
        entities,
        records.slice(0, 1),
      ),
    ).toThrow("requires loaded documents");
  });
});
