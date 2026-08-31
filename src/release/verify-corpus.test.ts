import { describe, expect, it } from "vitest";
import { verifyCorpus } from "./verify-corpus";

describe("release corpus verification", () => {
  it("verifies EUR-Lex, CSSF, and EBA registries through Runtime", async () => {
    await expect(verifyCorpus()).resolves.toMatchObject({
      sourceRegistryDocuments: 28,
      verifiedRawSnapshots: 28,
      canonicalDocuments: 28,
      runtimeDocuments: 28,
      runtimeProfileId: "full-corpus",
    });
  });
});
