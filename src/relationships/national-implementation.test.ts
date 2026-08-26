import { describe, expect, it } from "vitest";
import { loadDocumentViews } from "../data/document-repository";
import { buildExplicitReferences } from "./explicit-reference";
import {
  buildNationalImplementationMappings,
  loadNationalImplementationMappings,
} from "./national-implementation";

describe("reviewed national implementation mappings", () => {
  it("publishes the evidence-checked CSSF to EBA implementation edge", () => {
    const documents = loadDocumentViews();
    const entities = buildExplicitReferences(documents).entities;

    expect(buildNationalImplementationMappings(documents, entities)).toEqual([
      expect.objectContaining({
        sourceEntityId:
          "lu:cssf:circular-12-552:provision:introduction:block:7",
        relationType: "IMPLEMENTS",
        targetEntityId: "eu:eba:gl:2021:05",
        provenance: "OFFICIAL_MAPPING",
      }),
    ]);
  });

  it("fails closed when reviewed implementation evidence drifts", () => {
    const documents = loadDocumentViews();
    const entities = buildExplicitReferences(documents).entities;
    const mappings = structuredClone(loadNationalImplementationMappings());
    const first = mappings[0];
    if (!first) throw new Error("Missing national implementation fixture");
    first.evidence.text = "invented evidence";

    expect(() =>
      buildNationalImplementationMappings(documents, entities, mappings),
    ).toThrow(/Implementation evidence mismatch/u);
  });
});
