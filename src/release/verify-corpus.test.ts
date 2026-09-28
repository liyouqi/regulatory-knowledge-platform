import { describe, expect, it } from "vitest";
import { verifyCorpus } from "./verify-corpus";

describe("release corpus verification", () => {
  it("verifies EUR-Lex, CSSF, and EBA registries through Runtime", async () => {
    await expect(verifyCorpus()).resolves.toMatchObject({
      sourceRegistryDocuments: 31,
      verifiedRawSnapshots: 31,
      canonicalDocuments: 31,
      runtimeDocuments: 31,
      runtimeProfileId: "full-corpus",
    });
  });
});
