import { describe, expect, it } from "vitest";
import {
  caseLogicalId,
  decisionLogicalId,
  documentLogicalId,
  normalizeLegalNumber,
  provisionLogicalId,
  sourceVersionId,
} from "./ids";

describe("stable legal identifiers", () => {
  it("uses the CELEX work identifier for EU documents", () => {
    expect(documentLogicalId(" 32022r2554 ")).toBe("eu:32022R2554");
  });

  it("keeps CJEU cases in a separate stable identity namespace", () => {
    expect(caseLogicalId("62017cj0496")).toBe("case:eu:62017CJ0496");
    expect(caseLogicalId("62021CJ0340_1")).toBe("case:eu:62021CJ0340_1");
    expect(() => caseLogicalId("32016R0679")).toThrow(
      "Invalid EU case CELEX identifier",
    );
  });

  it("keeps supervisory decisions in an authority-scoped namespace", () => {
    expect(decisionLogicalId("authority:lu:cnpd", "18FR/2022")).toBe(
      "decision:lu:cnpd:18fr-2022",
    );
    expect(() => decisionLogicalId("cnpd", "18FR/2022")).toThrow(
      "Invalid supervisory decision identifier",
    );
  });

  it.each([
    ["06A", "6a"],
    ["(b)", "b"],
    ["12.", "12"],
    ["iii)", "iii"],
    ["IV", "iv"],
    ["Annex A", "annex-a"],
    ["2(a)", "2-a"],
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
