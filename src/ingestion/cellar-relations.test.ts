import { describe, expect, it } from "vitest";
import {
  buildCellarFocusedRelationsQuery,
  parseCellarFocusedRelationResults,
} from "./cellar-relations";

const basedOnPredicate =
  "http://publications.europa.eu/ontology/cdm#resource_legal_based_on_resource_legal";

function resultBinding(predicate = basedOnPredicate) {
  return {
    source: {
      type: "uri",
      value: "http://publications.europa.eu/resource/cellar/source-work-id",
    },
    sourceCelexUri: {
      type: "uri",
      value: "http://publications.europa.eu/resource/celex/32024R1772",
    },
    predicate: { type: "uri", value: predicate },
    target: {
      type: "uri",
      value: "http://publications.europa.eu/resource/cellar/target-work-id",
    },
    targetCelexUri: {
      type: "uri",
      value: "http://publications.europa.eu/resource/celex/32022R2554",
    },
  };
}

describe("CELLAR focused relation ingestion", () => {
  it("builds a deterministic closed-corpus query with only reviewed predicates", () => {
    const query = buildCellarFocusedRelationsQuery([
      "32024R1772",
      "32022R2554",
      "32024R1772",
    ]);

    expect(query).toContain(
      "<http://publications.europa.eu/resource/celex/32022R2554> <http://publications.europa.eu/resource/celex/32024R1772>",
    );
    expect(query).toContain("resource_legal_based_on_resource_legal");
    expect(query).toContain("resource_legal_completes_resource_legal");
    expect(query).not.toContain("work_cites_work");
    expect(buildCellarFocusedRelationsQuery(["32022R2554", "32024R1772"])).toBe(
      query,
    );
  });

  it("normalizes official HTTP Work URIs and removes identical rows", () => {
    expect(
      parseCellarFocusedRelationResults({
        results: { bindings: [resultBinding(), resultBinding()] },
      }),
    ).toEqual([
      {
        sourceCelex: "32024R1772",
        sourceWorkUri:
          "https://publications.europa.eu/resource/cellar/source-work-id",
        predicate: basedOnPredicate,
        targetCelex: "32022R2554",
        targetWorkUri:
          "https://publications.europa.eu/resource/cellar/target-work-id",
      },
    ]);
  });

  it("fails closed for unreviewed predicates and non-CELLAR Work URIs", () => {
    expect(() =>
      parseCellarFocusedRelationResults({
        results: {
          bindings: [
            resultBinding(
              "http://publications.europa.eu/ontology/cdm#work_cites_work",
            ),
          ],
        },
      }),
    ).toThrow();
    expect(() =>
      parseCellarFocusedRelationResults({
        results: {
          bindings: [
            {
              ...resultBinding(),
              source: {
                type: "uri",
                value: "https://example.com/resource/cellar/source",
              },
            },
          ],
        },
      }),
    ).toThrow("Unexpected Cellar host");
  });
});
