import { describe, expect, it } from "vitest";
import { findDocument, findDocumentBySlug } from "./app";

describe("Document lookup", () => {
  it("returns the DORA fixture by stable document ID", async () => {
    const document = findDocument("eu:32022R2554");

    expect(document?.id).toBe("eu:32022R2554");
    expect(["official", "fixture"]).toContain(document?.provenance);
    expect(document?.provisions[0].blocks[0].id).toBe(
      "eu:32022R2554:article:1:paragraph:1",
    );
  });

  it("returns null for an unknown stable document ID", () => {
    expect(findDocument("eu:32099R0000")).toBeNull();
  });

  it("resolves a document by its stable reader slug", () => {
    expect(findDocumentBySlug("dora")?.id).toBe("eu:32022R2554");
    expect(findDocumentBySlug("unknown-law")).toBeNull();
  });
});
