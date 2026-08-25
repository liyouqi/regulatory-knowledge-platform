import { describe, expect, it } from "vitest";
import { loadDocumentViews } from "../data/document-repository";
import {
  buildCellarCaseLaw,
  loadCellarCaseLawMetadata,
} from "./cellar-case-law";

describe("CELLAR CJEU runtime builder", () => {
  const documents = loadDocumentViews();

  it("publishes reviewed Work-level interpretation metadata as separate Case entities", () => {
    const build = buildCellarCaseLaw(documents);

    expect(build.cases).toHaveLength(72);
    expect(build.relationships).toHaveLength(72);
    expect(build.cases).toContainEqual(
      expect.objectContaining({
        id: "case:eu:62017CJ0496",
        celex: "62017CJ0496",
        ecli: "ECLI:EU:C:2019:26",
        caseNumber: "Case C-496/17.",
        caseName: "Deutsche Post AG v Hauptzollamt Köln.",
        decisionType: "judgment",
        decisionDate: "2019-01-16",
      }),
    );
    expect(build.cases).toContainEqual(
      expect.objectContaining({
        id: "case:eu:62022CJ0017",
        caseNumber: "Joined Cases C-17/22 and C-18/22.",
      }),
    );
    expect(build.cases).toContainEqual(
      expect.objectContaining({
        id: "case:eu:62023CO0312",
        decisionType: "order",
      }),
    );
    expect(
      build.cases.filter((item) => item.decisionType === "judgment"),
    ).toHaveLength(71);
    expect(
      build.relationships.every((item) => item.relationType === "INTERPRETS"),
    ).toBe(true);
    expect(
      build.relationships.every(
        (item) =>
          item.targetDocumentId === "eu:32016R0679" &&
          item.provenance === "OFFICIAL_METADATA" &&
          item.resolutionStatus === "metadata-only",
      ),
    ).toBe(true);
  });

  it("is deterministic, filters unloaded targets, and fails closed on title changes", () => {
    const records = loadCellarCaseLawMetadata();
    const first = buildCellarCaseLaw(documents, records);

    expect(buildCellarCaseLaw(documents, records)).toEqual(first);
    expect(new Set(first.cases.map((item) => item.id)).size).toBe(72);
    expect(buildCellarCaseLaw([], records)).toEqual({
      cases: [],
      relationships: [],
    });
    expect(() =>
      buildCellarCaseLaw(documents, [
        { ...records[0], englishTitle: "Unofficial short title" },
      ]),
    ).toThrow("Unsupported official CJEU English title structure");
  });
});
