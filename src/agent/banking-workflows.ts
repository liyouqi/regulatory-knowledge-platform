import type { evaluateBankingGovernance } from "./banking-governance-evaluation";

export const BANKING_WORKFLOWS = [
  {
    id: "compliance-review",
    title: "合规检查：利益冲突政策与合规职能",
    caseIds: [
      "institutional-conflicts",
      "permanent-compliance",
      "compliance-charter",
    ],
  },
  {
    id: "internal-audit",
    title: "内部审计：独立性、章程与风险导向计划",
    caseIds: ["audit-resources", "audit-charter", "risk-based-audit"],
  },
  {
    id: "board-materials",
    title: "董事会材料：治理责任、职责分工与会议记录",
    caseIds: [
      "governance-accountability",
      "documented-duties",
      "board-records",
    ],
  },
] as const;

export interface CurrencyObservation {
  documentId: string;
  loadedSnapshotId: string;
  status: string;
  officialUrl: string;
  nextAction: string;
}

export function evaluateBankingWorkflows(
  report: ReturnType<typeof evaluateBankingGovernance>,
  observations: CurrencyObservation[],
) {
  return {
    schemaVersion: "1.1.0",
    runtime: report.runtime,
    datasetSha256: report.datasetSha256,
    walkThroughKind: "internal-editorial-scenarios",
    userValueVerified: false,
    legalConclusionProvided: false,
    workflows: BANKING_WORKFLOWS.map((workflow) => {
      const cases = workflow.caseIds.map((id) =>
        report.cases.find((item) => item.id === `banking-governance:${id}`),
      );
      const missingCaseIds = workflow.caseIds.filter(
        (_, index) => !cases[index],
      );
      return {
        id: workflow.id,
        title: workflow.title,
        technicalWalkthroughPassed:
          missingCaseIds.length === 0 &&
          cases.every(
            (item) =>
              item?.evidencePassed &&
              item.navigationPassed &&
              item.documentSearch.hit,
          ),
        expectedCaseCount: workflow.caseIds.length,
        scopedRetrievalHits: cases.filter((item) => item?.documentSearch.hit)
          .length,
        globalRetrievalHits: cases.filter((item) => item?.globalSearch.hit)
          .length,
        missingCaseIds,
        cases: cases.filter((item) => item !== undefined),
        sourceReviewActions: observations.map((item) => ({
          documentId: item.documentId,
          status: item.status,
          officialUrl: item.officialUrl,
          nextAction: item.nextAction,
        })),
        currentLawClearance: false,
        institutionApplicabilityAssessed: false,
        humanTrial: {
          status: "not-performed",
          operator: null,
          institutionScope: null,
          startedAt: null,
          finishedAt: null,
          evidenceAccepted: null,
          missingEvidenceNotes: null,
        },
      };
    }),
  };
}
