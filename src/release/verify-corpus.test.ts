import { describe, expect, it } from "vitest";
import { verifyCorpus } from "./verify-corpus";

describe("release corpus verification", () => {
  it("verifies EUR-Lex, CSSF, and EBA registries through Runtime", async () => {
    await expect(verifyCorpus()).resolves.toMatchObject({
      sourceRegistryDocuments: 18,
      verifiedRawSnapshots: 18,
      canonicalDocuments: 18,
      runtimeDocuments: 18,
      runtimeProfileId: "full-corpus",
    });
  });
});
