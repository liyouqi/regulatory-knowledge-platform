import { describe, expect, it } from "vitest";
import {
  cssfDocumentLogicalId,
  loadCssfSourceRegistry,
  officialCssfHttpsUrl,
} from "./cssf-source-registry";

describe("CSSF source registry", () => {
  it("contains the reviewed HTML/PDF representative set", async () => {
    const sources = await loadCssfSourceRegistry();

    expect(sources).toHaveLength(3);
    expect(
      sources.map((source) => [source.localId, source.contentMediaType]),
    ).toEqual([
      ["communication-2025-04-09-ict-risk-updates", "text/html"],
      ["circular-25-893", "application/pdf"],
      ["circular-12-552", "application/pdf"],
    ]);
    expect(sources.every((source) => source.familyId === "family:cssf")).toBe(
      true,
    );
    expect(
      sources.every((source) =>
        source.topics.some((topic) => /ICT|DORA/iu.test(topic)),
      ),
    ).toBe(true);
  });

  it("uses stable LU logical IDs independent of source URLs", () => {
    expect(cssfDocumentLogicalId("circular-25-893")).toBe(
      "lu:cssf:circular-25-893",
    );
    expect(() => cssfDocumentLogicalId("../25-893")).toThrow(
      "Invalid CSSF local identifier",
    );
  });

  it("accepts only official CSSF HTTPS URLs", () => {
    expect(
      officialCssfHttpsUrl(
        "https://www.cssf.lu/wp-content/uploads/cssf25_893eng.pdf",
      ),
    ).toBe("https://www.cssf.lu/wp-content/uploads/cssf25_893eng.pdf");
    expect(() => officialCssfHttpsUrl("http://www.cssf.lu/source.pdf")).toThrow(
      "Unexpected CSSF official URL",
    );
    expect(() =>
      officialCssfHttpsUrl("https://example.com/source.pdf"),
    ).toThrow("Unexpected CSSF official URL");
  });
});
