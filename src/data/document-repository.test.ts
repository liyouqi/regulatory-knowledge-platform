import { describe, expect, it } from "vitest";
import { loadDoraDocumentView } from "./document-repository";

describe("document repository", () => {
  it("falls back to the labelled fixture when no canonical artifact exists", () => {
    const document = loadDoraDocumentView("/path/that/does/not/exist");

    expect(document.id).toBe("eu:32022R2554");
    expect(document.provenance).toBe("fixture");
  });
});
