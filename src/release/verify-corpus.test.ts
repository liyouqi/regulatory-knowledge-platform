import { describe, expect, it } from "vitest";
import { verifyCorpus } from "./verify-corpus";

describe("release corpus verification", () => {
  it("verifies EUR-Lex, CSSF, and EBA registries through Runtime", async () => {
    const verification = await verifyCorpus();
    expect(verification).toMatchObject({
      sourceRegistryDocuments: 59,
      canonicalDocuments: 59,
      runtimeDocuments: 59,
      runtimeProfileId: "full-corpus",
    });
    expect(verification.verifiedRawSnapshots).toBeGreaterThanOrEqual(
      verification.sourceRegistryDocuments,
    );
  }, 60_000);
});
