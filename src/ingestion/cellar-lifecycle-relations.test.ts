import { describe, expect, it } from "vitest";
import {
  buildCellarLifecycleRelationsQuery,
  parseCellarLifecycleRelationResults,
} from "./cellar-lifecycle-relations";

const correctsPredicate =
  "http://publications.europa.eu/ontology/cdm#resource_legal_corrects_resource_legal";

function resultBinding(predicate = correctsPredicate) {
  return {
    source: {
      type: "uri",
      value:
        "http://publications.europa.eu/resource/cellar/corrigendum-work-id",
    },
    sourceCelexUri: {
      type: "uri",
      value: "http://publications.europa.eu/resource/celex/32024R2956R%2801%29",
    },
    predicate: { type: "uri", value: predicate },
    target: {
      type: "uri",
      value: "http://publications.europa.eu/resource/cellar/seed-work-id",
    },
    targetCelexUri: {
      type: "uri",
      value: "http://publications.europa.eu/resource/celex/32024R2956",
    },
  };
}

describe("CELLAR lifecycle relation discovery", () => {
  it("builds a deterministic open-neighborhood query with reviewed predicates", () => {
    const query = buildCellarLifecycleRelationsQuery([
      "32024R2956",
      "32022R2554",
      "32024R2956",
    ]);

    expect(query).toContain(
      "<http://publications.europa.eu/resource/celex/32022R2554> <http://publications.europa.eu/resource/celex/32024R2956>",
    );
    expect(query).toContain("resource_legal_amends_resource_legal");
    expect(query).toContain("resource_legal_corrects_resource_legal");
    expect(query).not.toContain("work_cites_work");
    expect(
      buildCellarLifecycleRelationsQuery(["32022R2554", "32024R2956"]),
    ).toBe(query);
  });

  it("normalizes encoded corrigendum CELEX identifiers and official Work URIs", () => {
    expect(
      parseCellarLifecycleRelationResults(
        { results: { bindings: [resultBinding(), resultBinding()] } },
        ["32024R2956"],
      ),
    ).toEqual([
      {
        sourceCelex: "32024R2956R(01)",
        sourceWorkUri:
          "https://publications.europa.eu/resource/cellar/corrigendum-work-id",
        predicate: correctsPredicate,
        targetCelex: "32024R2956",
        targetWorkUri:
          "https://publications.europa.eu/resource/cellar/seed-work-id",
      },
    ]);
  });

  it("fails closed for unreviewed predicates and records outside the seeds", () => {
    expect(() =>
      parseCellarLifecycleRelationResults({
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
      parseCellarLifecycleRelationResults(
        { results: { bindings: [resultBinding()] } },
        ["32022R2554"],
      ),
    ).toThrow("outside the seed neighborhood");
  });
});
