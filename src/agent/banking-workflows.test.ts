import { describe, expect, it } from "vitest";
import { evaluateBankingWorkflows } from "./banking-workflows";

type Report = Parameters<typeof evaluateBankingWorkflows>[0];

describe("banking business workflow audit boundaries", () => {
  it("fails an empty walk-through and never fabricates human acceptance or current-law clearance", () => {
    const report = {
      cases: [],
      runtime: {},
      datasetSha256: "fixture",
    } as unknown as Report;
    const result = evaluateBankingWorkflows(report, []);
    expect(result.workflows).toHaveLength(3);
    expect(result.userValueVerified).toBe(false);
    expect(
      result.workflows.every(
        (workflow) =>
          !workflow.technicalWalkthroughPassed &&
          !workflow.currentLawClearance &&
          !workflow.institutionApplicabilityAssessed,
      ),
    ).toBe(true);
    expect(
      result.workflows.every(
        (workflow) =>
          workflow.humanTrial.operator === null &&
          workflow.humanTrial.evidenceAccepted === null,
      ),
    ).toBe(true);
    expect(
      result.workflows.every(
        (workflow) => workflow.missingCaseIds.length === 3,
      ),
    ).toBe(true);
  });
  it("requires scoped retrieval as well as evidence integrity and navigation", () => {
    const cases = [
      "institutional-conflicts",
      "permanent-compliance",
      "compliance-charter",
    ].map((id) => ({
      id: `banking-governance:${id}`,
      evidencePassed: true,
      navigationPassed: true,
      documentSearch: { hit: true },
      globalSearch: { hit: false },
    }));
    const report = {
      cases,
      runtime: {},
      datasetSha256: "fixture",
    } as unknown as Report;
    expect(
      evaluateBankingWorkflows(report, []).workflows[0]
        .technicalWalkthroughPassed,
    ).toBe(true);
    cases[0].documentSearch.hit = false;
    expect(
      evaluateBankingWorkflows(report, []).workflows[0]
        .technicalWalkthroughPassed,
    ).toBe(false);
    cases[0].documentSearch.hit = true;
    cases[1].evidencePassed = false;
    expect(
      evaluateBankingWorkflows(report, []).workflows[0]
        .technicalWalkthroughPassed,
    ).toBe(false);
  });
});
