import { describe, expect, it } from "vitest";
import {
  buildCellarCaseLawQuery,
  parseCellarCaseLawResults,
} from "./cellar-case-law";

const predicate =
  "http://publications.europa.eu/ontology/cdm#case-law_interpretes_resource_legal";

function resultBinding(caseCelex = "62017CJ0496") {
  return {
    case: {
      type: "uri",
      value: "http://publications.europa.eu/resource/cellar/case-work-id",
    },
    caseCelexUri: {
      type: "uri",
      value: `http://publications.europa.eu/resource/celex/${caseCelex}`,
    },
    predicate: { type: "uri", value: predicate },
    target: {
      type: "uri",
      value: "http://publications.europa.eu/resource/cellar/gdpr-work-id",
    },
    targetCelexUri: {
      type: "uri",
      value: "http://publications.europa.eu/resource/celex/32016R0679",
    },
  };
}

describe("CELLAR CJEU case-law discovery", () => {
  it("builds a deterministic query for the reviewed direct interpretation predicate", () => {
    const query = buildCellarCaseLawQuery([
      "32016R0679",
      "32022R2554",
      "32016R0679",
    ]);

    expect(query).toContain(
      "<http://publications.europa.eu/resource/celex/32016R0679> <http://publications.europa.eu/resource/celex/32022R2554>",
    );
    expect(query).toContain("case-law_interpretes_resource_legal");
    expect(query).toContain("resource/celex/6");
    expect(query).not.toContain("work_cites_work");
    expect(buildCellarCaseLawQuery(["32022R2554", "32016R0679"])).toBe(query);
  });

  it("normalizes official CJEU and target Work identities", () => {
    expect(
      parseCellarCaseLawResults(
        { results: { bindings: [resultBinding(), resultBinding()] } },
        ["32016R0679"],
      ),
    ).toEqual([
      {
        caseCelex: "62017CJ0496",
        caseWorkUri:
          "https://publications.europa.eu/resource/cellar/case-work-id",
        predicate,
        targetCelex: "32016R0679",
        targetWorkUri:
          "https://publications.europa.eu/resource/cellar/gdpr-work-id",
      },
    ]);
    expect(
      parseCellarCaseLawResults(
        { results: { bindings: [resultBinding("62021CJ0340_1")] } },
        ["32016R0679"],
      )[0]?.caseCelex,
    ).toBe("62021CJ0340_1");
  });

  it("fails closed for non-CJEU identities and targets outside the seeds", () => {
    expect(() =>
      parseCellarCaseLawResults(
        { results: { bindings: [resultBinding("32017CJ0496")] } },
        ["32016R0679"],
      ),
    ).toThrow("CJEU case-law CELEX");
    expect(() =>
      parseCellarCaseLawResults({ results: { bindings: [resultBinding()] } }, [
        "32022R2554",
      ]),
    ).toThrow("outside the seed neighborhood");
  });
});
