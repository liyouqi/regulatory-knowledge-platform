import { describe, expect, it } from "vitest";
import { loadDocumentViews } from "../data/document-repository";
import {
  buildApplicabilityRules,
  loadApplicabilityRuleDataset,
} from "./applicability-rule";

describe("reviewed applicability rules", () => {
  const documents = loadDocumentViews();

  it("publishes the exact DORA credit-institution listing and qualifications", () => {
    const build = buildApplicabilityRules(documents);

    expect(build.rules).toEqual([
      expect.objectContaining({
        id: "applicability-rule:dora:credit-institution",
        documentId: "eu:32022R2554",
        entityTypeId: "credit-institution",
        status: "listed-in-scope-subject-to-qualifications",
        scopeProvisionId: "eu:32022R2554:article:2",
        provenance: "LEGAL_TEXT",
        reviewStatus: "reviewed",
      }),
    ]);
    expect(build.evidence).toHaveLength(10);
    expect(
      build.evidence.filter((item) => item.role === "qualification"),
    ).toHaveLength(8);
    expect(build.evidence[1]).toMatchObject({
      sourceEntityId: "eu:32022R2554:article:2:paragraph:1:point:a",
      evidenceText: "credit institutions;",
    });
    expect(build.navigation.map((item) => item.provisionId)).toEqual([
      "eu:32022R2554:article:20",
      "eu:32022R2554:article:28",
    ]);
  });

  it("fails closed when reviewed legal-text evidence drifts", () => {
    const dataset = structuredClone(loadApplicabilityRuleDataset());
    const evidence = dataset.rules[0]?.evidence[1];
    if (!evidence) throw new Error("DORA applicability fixture is unavailable");
    evidence.evidenceText = "credit institution;";

    expect(() => buildApplicabilityRules(documents, dataset)).toThrow(
      "Applicability legal-text evidence drift",
    );
  });

  it("fails closed when a qualification subtree is incomplete", () => {
    const dataset = structuredClone(loadApplicabilityRuleDataset());
    const rule = dataset.rules[0];
    if (!rule) throw new Error("DORA applicability fixture is unavailable");
    rule.evidence = rule.evidence.filter(
      (item) =>
        item.sourceEntityId !== "eu:32022R2554:article:2:paragraph:3:point:f",
    );

    expect(() => buildApplicabilityRules(documents, dataset)).toThrow(
      "Incomplete applicability qualification subtree",
    );
  });

  it("omits rules for documents excluded by an Edition Profile", () => {
    const withoutDora = documents.filter(
      (document) => document.id !== "eu:32022R2554",
    );
    const build = buildApplicabilityRules(
      withoutDora,
      loadApplicabilityRuleDataset(),
      new Set(documents.map((document) => document.id)),
    );

    expect(build).toEqual({ rules: [], evidence: [], navigation: [] });
  });
});
