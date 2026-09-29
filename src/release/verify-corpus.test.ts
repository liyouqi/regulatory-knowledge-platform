import { describe, expect, it } from "vitest";
import { verifyCorpus } from "./verify-corpus";

describe("release corpus verification", () => {
  it("verifies EUR-Lex, CSSF, and EBA registries through Runtime", async () => {
    const verification = await verifyCorpus();
    expect(verification).toMatchObject({
      sourceRegistryDocuments: 39,
      canonicalDocuments: 39,
      runtimeDocuments: 39,
      runtimeProfileId: "full-corpus",
    });
    expect(verification.verifiedRawSnapshots).toBeGreaterThanOrEqual(
      verification.sourceRegistryDocuments,
    );
  });
});
