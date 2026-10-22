import { describe, expect, it } from "vitest";
import { documentExpressionMetadataRecordSchema } from "../versions/document-expression-metadata";
import { editionProfileSchema } from "./edition-profile";

describe("AMF profile and expression contracts", () => {
  it("allows only the exact AMF identifier in an allowlist", () => {
    const profile = {
      id: "fr-test",
      version: "1.0.0",
      displayName: "FR",
      description: "FR",
      selection: {
        mode: "allowlist",
        familyIds: [],
        documentIds: ["fr:amf:rg"],
      },
    };
    expect(editionProfileSchema.safeParse(profile).success).toBe(true);
    expect(
      editionProfileSchema.safeParse({
        ...profile,
        selection: { ...profile.selection, documentIds: ["fr:amf:rg:extra"] },
      }).success,
    ).toBe(false);
  });
  it("accepts reviewed French expression metadata with an unassessed currency", () => {
    expect(
      documentExpressionMetadataRecordSchema.safeParse({
        documentId: "fr:amf:rg",
        language: "fr",
        issuers: ["AMF"],
        textKind: "consolidated",
        currencyStatus: "not_assessed",
        versionSelectionPolicy:
          "prefer_reviewed_consolidated_else_reviewed_official_publication",
        fallbackReason: null,
        reviewStatus: "reviewed",
        reviewedAt: "2026-10-21T00:00:00.000Z",
      }).success,
    ).toBe(true);
  });
});
