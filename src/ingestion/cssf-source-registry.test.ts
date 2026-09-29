import { describe, expect, it } from "vitest";
import {
  cssfDocumentLogicalId,
  cssfSourceDefinitionSchema,
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
      sources.every(
        (source) =>
          source.regulatoryLevel === "level-3" &&
          source.measureType === "other",
      ),
    ).toBe(true);
    expect(
      sources.every((source) =>
        source.topics.some((topic) => /ICT|DORA/iu.test(topic)),
      ),
    ).toBe(true);
    expect(sources[0]?.quality).toMatchObject({
      sectionCount: 3,
      blockCount: 21,
      maximumWarnings: 3,
    });
    expect(
      sources.slice(1).every((source) => source.quality === undefined),
    ).toBe(true);
    expect(sources[1]?.pdfQuality).toMatchObject({
      pageCount: 9,
      structuralNodeCount: 4,
      provisionCount: 16,
      pointCount: 50,
      maximumWarnings: 1,
    });
    expect(sources[1]?.pdfProfile).toBe("incident-reporting");
    expect(sources[2]?.pdfProfile).toBe("consolidated-governance");
    expect(sources[2]?.pdfQuality).toMatchObject({
      pageCount: 83,
      structuralNodeCount: 82,
      provisionCount: 260,
      pointCount: 349,
      maximumWarnings: 1,
    });
  });

  it("uses stable LU logical IDs independent of source URLs", () => {
    expect(cssfDocumentLogicalId("circular-25-893")).toBe(
      "lu:cssf:circular-25-893",
    );
    expect(() => cssfDocumentLogicalId("../25-893")).toThrow(
      "Invalid CSSF local identifier",
    );
  });

  it("requires an explicit parser profile for each PDF source", async () => {
    const source = (await loadCssfSourceRegistry())[1];
    expect(
      cssfSourceDefinitionSchema.safeParse({
        ...source,
        pdfProfile: undefined,
      }).success,
    ).toBe(false);
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
