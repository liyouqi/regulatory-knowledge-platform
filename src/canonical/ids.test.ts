import { describe, expect, it } from "vitest";
import {
  documentLogicalId,
  normalizeLegalNumber,
  provisionLogicalId,
  sourceVersionId,
} from "./ids";

describe("stable legal identifiers", () => {
  it("uses the CELEX work identifier for EU documents", () => {
    expect(documentLogicalId(" 32022r2554 ")).toBe("eu:32022R2554");
  });

  it.each([
    ["06A", "6a"],
    ["(b)", "b"],
    ["12.", "12"],
    ["iii)", "iii"],
    ["IV", "iv"],
    ["Annex A", "annex-a"],
  ])("normalizes %s without changing its legal meaning", (raw, expected) => {
    expect(normalizeLegalNumber(raw)).toBe(expected);
  });

  it("keeps duplicate source numbering addressable by occurrence", () => {
    expect(provisionLogicalId("eu:32022R2554", "article", "6a", 2)).toBe(
      "eu:32022R2554:article:6a:occurrence:2",
    );
  });

  it("separates logical identity from the source version", () => {
    expect(sourceVersionId("eu:32022R2554:article:1", "etag-123")).toBe(
      "eu:32022R2554:article:1@etag-123",
    );
  });
});
