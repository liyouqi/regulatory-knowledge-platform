import { describe, expect, it } from "vitest";
import { doraCanonicalFixture } from "../data/dora-fixture";
import { validateCanonicalDocument } from "./validate";

describe("canonical document integrity", () => {
  it("accepts a document whose identity, provenance, and content agree", () => {
    expect(validateCanonicalDocument(doraCanonicalFixture).logicalId).toBe(
      "eu:32022R2554",
    );
  });

  it("rejects changed text when the stored content hash is unchanged", () => {
    const changed = structuredClone(doraCanonicalFixture);
    changed.provisions[1].text = "changed without rebuilding the hash";

    expect(() => validateCanonicalDocument(changed)).toThrow(
      "Content hash mismatch",
    );
  });

  it("rejects duplicate logical IDs", () => {
    const changed = structuredClone(doraCanonicalFixture);
    changed.provisions[1].logicalId = changed.provisions[0].logicalId;
    changed.provisions[1].sourceVersionId =
      changed.provisions[0].sourceVersionId;

    expect(() => validateCanonicalDocument(changed)).toThrow(
      "Duplicate logical ID",
    );
  });
});
