import { describe, expect, it } from "vitest";
import { assertContainsIds, verifyCorpus } from "./verify-corpus";

describe("raw snapshot release boundary", () => {
  it("allows verified candidate snapshots while still requiring every published source", () => {
    expect(() =>
      assertContainsIds(
        "Verified raw snapshots",
        new Set(["eu:published", "eu:candidate"]),
        new Set(["eu:published"]),
      ),
    ).not.toThrow();

    expect(() =>
      assertContainsIds(
        "Verified raw snapshots",
        new Set(["eu:candidate"]),
        new Set(["eu:published"]),
      ),
    ).toThrow(
      "Verified raw snapshots is missing source-registry documents: [eu:published]",
    );
  });
});

describe("release corpus verification", () => {
  it("verifies EUR-Lex, CSSF, and EBA registries through Runtime", async () => {
    const verification = await verifyCorpus();
    expect(verification).toMatchObject({
      sourceRegistryDocuments: 121,
      canonicalDocuments: 121,
      runtimeDocuments: 121,
      runtimeProfileId: "full-corpus",
    });
    expect(verification.verifiedRawSnapshots).toBeGreaterThanOrEqual(
      verification.sourceRegistryDocuments,
    );
  }, 60_000);
});
