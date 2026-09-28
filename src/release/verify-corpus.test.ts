import { describe, expect, it } from "vitest";
import { verifyCorpus } from "./verify-corpus";

describe("release corpus verification", () => {
  it("verifies EUR-Lex, CSSF, and EBA registries through Runtime", async () => {
    await expect(verifyCorpus()).resolves.toMatchObject({
      sourceRegistryDocuments: 35,
      verifiedRawSnapshots: 35,
      canonicalDocuments: 35,
      runtimeDocuments: 35,
      runtimeProfileId: "full-corpus",
    });
  });
});
