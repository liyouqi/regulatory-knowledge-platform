import { describe, expect, it } from "vitest";
import { loadDocumentViews } from "../data/document-repository";
import { buildExplicitReferences } from "./explicit-reference";
import {
  buildGuidelineMappings,
  loadGuidelineMappings,
} from "./guideline-mapping";

describe("reviewed Guideline mappings", () => {
  const documents = loadDocumentViews();
  const entities = buildExplicitReferences(documents).entities;

  it("publishes evidence-checked CRD mandate and EBA supplement edges", () => {
    const relationships = buildGuidelineMappings(documents, entities);

    expect(relationships).toHaveLength(2);
    expect(relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceEntityId: "eu:32013L0036:article:74",
          relationType: "MANDATES",
          targetEntityId: "eu:eba:gl:2021:05",
          provenance: "OFFICIAL_MAPPING",
        }),
        expect.objectContaining({
          sourceEntityId: "eu:eba:gl:2021:05:paragraph:5",
          relationType: "SUPPLEMENTS",
          targetEntityId: "eu:32013L0036:article:74",
          provenance: "OFFICIAL_MAPPING",
        }),
      ]),
    );
  });

  it("fails closed when reviewed evidence drifts", () => {
    const mappings = structuredClone(loadGuidelineMappings());
    const first = mappings[0];
    if (!first) throw new Error("Missing Guideline mapping fixture");
    first.guideline.supplementEvidence.text = "invented evidence";
    expect(() => buildGuidelineMappings(documents, entities, mappings)).toThrow(
      /Supplement evidence mismatch/u,
    );
  });
});
