import { describe, expect, it } from "vitest";
import { loadSourceRegistry } from "./source-registry";

describe("EU source registry", () => {
  it("contains reviewed Level 1 acts and registered Level 2 measures", async () => {
    const sources = await loadSourceRegistry();

    expect(sources).toHaveLength(25);
    expect(new Set(sources.map((source) => source.celex)).size).toBe(25);
    expect(sources.slice(0, 8).map((source) => source.shortName)).toEqual([
      "DORA",
      "GDPR",
      "AI Act",
      "MiCA",
      "NIS2",
      "Data Act",
      "CRD IV",
      "CRR",
    ]);
    expect(sources.every((source) => source.quality !== undefined)).toBe(true);
    expect(
      sources.filter((source) => source.familyId === "family:dora"),
    ).toHaveLength(14);
    expect(
      sources.filter((source) => source.familyId === "family:mica"),
    ).toHaveLength(2);
    expect(
      sources
        .filter((source) => source.familyId === "family:aml")
        .map((source) => source.celex),
    ).toEqual(["32015L0849", "32016R1675", "32023R1113"]);
    expect(sources.every((source) => source.aliases.length > 0)).toBe(true);
    expect(
      sources.find((source) => source.celex === "32024R2956")?.sourceStatus,
    ).toMatchObject({
      basis: "original-oj",
      textAsOf: "2024-12-02",
      checkedAt: "2026-08-23T23:37:57.439Z",
      corrections: [{ date: "2025-09-19" }],
    });
    expect(
      sources.find((source) => source.celex === "32013L0036"),
    ).toMatchObject({
      familyId: "family:crd",
      quality: {
        articleCount: 165,
        annexCount: 2,
        maximumWarnings: 0,
      },
      sourceStatus: {
        basis: "original-oj",
        textAsOf: "2013-06-27",
        corrections: [{ date: "2013-08-02" }, { date: "2017-01-25" }],
      },
    });
    expect(
      sources.find((source) => source.celex === "32013R0575"),
    ).toMatchObject({
      familyId: "family:crr",
      quality: {
        articleCount: 521,
        annexCount: 4,
        maximumWarnings: 2,
      },
      sourceStatus: {
        basis: "original-oj",
        textAsOf: "2013-06-27",
        currentVersionUrl: "https://eur-lex.europa.eu/eli/reg/2013/575",
      },
    });
    expect(
      sources.find((source) => source.celex === "32015L0849"),
    ).toMatchObject({
      familyId: "family:aml",
      quality: { articleCount: 69, annexCount: 4, maximumWarnings: 0 },
      sourceStatus: {
        basis: "original-oj",
        textAsOf: "2015-06-05",
        currentVersionUrl: "https://eur-lex.europa.eu/eli/dir/2015/849",
      },
    });
    expect(
      sources
        .filter(
          (source) =>
            source.familyId === "family:dora" &&
            ["32025R0301", "32025R0302"].includes(source.celex),
        )
        .map((source) => [source.celex, source.measureType]),
    ).toEqual([
      ["32025R0301", "rts"],
      ["32025R0302", "its"],
    ]);
    expect(
      new Set(
        sources.flatMap((source) =>
          [source.shortName, ...source.aliases].map((alias) =>
            alias.toLowerCase(),
          ),
        ),
      ).size,
    ).toBe(
      sources.reduce((count, source) => count + source.aliases.length + 1, 0),
    );
  });
});
