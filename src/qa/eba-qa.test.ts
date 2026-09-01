import { describe, expect, it } from "vitest";
import { toDocumentView } from "../canonical/to-document-view";
import { doraCanonicalFixture } from "../data/dora-fixture";
import { buildExplicitReferences } from "../relationships/explicit-reference";
import { buildEbaQa, loadEbaQaCatalog, loadEbaQaDetails } from "./eba-qa";

describe("EBA Q&A build", () => {
  it("loads the committed complete catalogue and bounded DORA details", () => {
    const catalog = loadEbaQaCatalog();
    const details = loadEbaQaDetails();
    expect(catalog.records).toHaveLength(2709);
    expect(details.records).toHaveLength(25);
    expect(
      catalog.records.filter((record) => record.detailAvailable),
    ).toHaveLength(25);
  });

  it("keeps Q&A references outside legal relationships and exact-resolves DORA", () => {
    const document = toDocumentView(doraCanonicalFixture, "qa-test");
    const relationshipBuild = buildExplicitReferences([document]);
    const result = buildEbaQa([document], relationshipBuild.entities);
    expect(result.references).toContainEqual(
      expect.objectContaining({
        qaId: "qa:eba:2025_7613",
        role: "declared-legal-act",
        targetEntityId: "eu:32022R2554",
        provenance: "OFFICIAL_QA_METADATA",
        resolutionStatus: "resolved",
      }),
    );
    expect(
      result.references.every((reference) =>
        reference.qaId.startsWith("qa:eba:"),
      ),
    ).toBe(true);
  });
});
