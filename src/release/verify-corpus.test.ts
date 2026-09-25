import { describe, expect, it } from "vitest";
import { verifyCorpus } from "./verify-corpus";

describe("release corpus verification", () => {
  it("verifies EUR-Lex, CSSF, and EBA registries through Runtime", async () => {
    await expect(verifyCorpus()).resolves.toMatchObject({
      sourceRegistryDocuments: 29,
      verifiedRawSnapshots: 29,
      canonicalDocuments: 29,
      runtimeDocuments: 29,
      runtimeProfileId: "full-corpus",
    });
  });
});
