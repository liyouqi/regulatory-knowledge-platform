import { describe, expect, it } from "vitest";
import { loadDocumentViews } from "../data/document-repository";
import { loadAuthorityDataset } from "../regulatory-context/regulatory-context";
import { buildExplicitReferences } from "../relationships/explicit-reference";
import {
  buildSupervisoryDecisions,
  loadSupervisoryDecisionDataset,
} from "./supervisory-decision";

function build() {
  const documents = loadDocumentViews();
  const entities = buildExplicitReferences(documents).entities;
  return buildSupervisoryDecisions(
    documents,
    entities,
    loadAuthorityDataset().authorities,
    loadSupervisoryDecisionDataset(),
    new Set(documents.map((document) => document.id)),
  );
}

describe("reviewed supervisory decisions", () => {
  it("publishes the CNPD 18FR/2022 decision and four exact GDPR findings", () => {
    const result = build();

    expect(result.decisions).toHaveLength(1);
    expect(result.findings).toHaveLength(4);
    expect(result.decisions[0]).toMatchObject({
      id: "decision:lu:cnpd:18fr-2022",
      authorityId: "authority:lu:cnpd",
      decisionNumber: "18FR/2022",
      decisionDate: "2022-12-13",
      fineAmountMinor: 150000,
      fineCurrency: "EUR",
      sourceDocumentSha256:
        "97740ec639232feeb332b80bdde777d93dd9d90619c5632ae912b04668248140",
    });
    expect(result.findings.map((finding) => finding.targetEntityId)).toEqual([
      "eu:32016R0679:article:5",
      "eu:32016R0679:article:6",
      "eu:32016R0679:article:12",
      "eu:32016R0679:article:15",
    ]);
    expect(
      result.findings.every(
        (finding) =>
          finding.provenance === "DECISION_TEXT" &&
          finding.evidenceLocator === "pdf-page:30",
      ),
    ).toBe(true);
  });

  it("fails closed when a finding no longer matches the official disposition", () => {
    const documents = loadDocumentViews();
    const dataset = structuredClone(loadSupervisoryDecisionDataset());
    const finding = dataset.decisions[0]?.findings[0];
    if (!finding) throw new Error("Decision fixture is incomplete");
    finding.evidenceCitation = "Article 99";

    expect(() =>
      buildSupervisoryDecisions(
        documents,
        buildExplicitReferences(documents).entities,
        loadAuthorityDataset().authorities,
        dataset,
        new Set(documents.map((document) => document.id)),
      ),
    ).toThrow("Invalid supervisory decision finding");
  });

  it("omits the decision when GDPR is excluded by the Edition Profile", () => {
    const documents = loadDocumentViews().filter(
      (document) => document.id !== "eu:32016R0679",
    );
    const result = buildSupervisoryDecisions(
      documents,
      buildExplicitReferences(documents).entities,
      loadAuthorityDataset().authorities,
      loadSupervisoryDecisionDataset(),
      new Set(loadDocumentViews().map((document) => document.id)),
    );

    expect(result.decisions).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(result.authorityIds.size).toBe(0);
  });
});
