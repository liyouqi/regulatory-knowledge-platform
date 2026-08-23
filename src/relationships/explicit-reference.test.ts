import { describe, expect, it } from "vitest";
import { loadDocumentViews } from "../data/document-repository";
import {
  EXPLICIT_REFERENCE_BUILDER,
  EXPLICIT_REFERENCE_BUILDER_VERSION,
  buildExplicitReferences,
} from "./explicit-reference";

const documents = loadDocumentViews();
const result = buildExplicitReferences(documents);

describe("explicit legal reference builder", () => {
  it("resolves a cross-law Article reference to a loaded stable entity", () => {
    expect(result.relationships).toContainEqual(
      expect.objectContaining({
        sourceEntityId: "eu:32022R2554:article:1:paragraph:2",
        targetEntityId: "eu:32022L2555:article:3",
        evidenceText: "Article 3 of Directive (EU) 2022/2555",
        relationType: "REFERENCES",
        provenance: "LEGAL_TEXT",
        builderMethod: EXPLICIT_REFERENCE_BUILDER,
        builderVersion: EXPLICIT_REFERENCE_BUILDER_VERSION,
        resolutionStatus: "resolved",
      }),
    );
  });

  it("resolves internal Annex and cross-law GDPR references", () => {
    expect(result.relationships).toContainEqual(
      expect.objectContaining({
        sourceEntityId: "eu:32024R1689:article:11:paragraph:1",
        targetEntityId: "eu:32024R1689:annex:iv",
        evidenceText: "Annex IV",
      }),
    );
    expect(result.relationships).toContainEqual(
      expect.objectContaining({
        sourceEntityId: "eu:32024R1689:article:3:subparagraph:1:point:50",
        targetEntityId: "eu:32016R0679:article:4",
        evidenceText: "Article 4, point (1), of Regulation (EU) 2016/679",
      }),
    );
  });

  it("does not turn an unresolved external Article into an internal link", () => {
    expect(result.relationships).not.toContainEqual(
      expect.objectContaining({
        sourceEntityId: "eu:32022R2554:article:3:subparagraph:1:point:12",
        targetEntityId: "eu:32022R2554:article:2",
      }),
    );
    expect(result.unresolvedCount).toBeGreaterThan(0);
  });

  it("produces stable unique IDs and one legal entity per stable ID", () => {
    const repeated = buildExplicitReferences(documents);
    expect(repeated.relationships.map((relation) => relation.id)).toEqual(
      result.relationships.map((relation) => relation.id),
    );
    expect(
      new Set(result.relationships.map((relation) => relation.id)).size,
    ).toBe(result.relationships.length);
    expect(new Set(result.entities.map((entity) => entity.id)).size).toBe(
      result.entities.length,
    );
  });
});
