import { describe, expect, it } from "vitest";
import { loadSourceRegistry } from "./source-registry";

describe("EU source registry", () => {
  it("contains reviewed Level 1 acts and registered Level 2 measures", async () => {
    const sources = await loadSourceRegistry();

    expect(sources).toHaveLength(13);
    expect(new Set(sources.map((source) => source.celex)).size).toBe(13);
    expect(sources.slice(0, 6).map((source) => source.shortName)).toEqual([
      "DORA",
      "GDPR",
      "AI Act",
      "MiCA",
      "NIS2",
      "Data Act",
    ]);
    expect(sources.every((source) => source.quality !== undefined)).toBe(true);
    expect(
      sources.filter((source) => source.familyId === "family:dora"),
    ).toHaveLength(7);
    expect(
      sources.filter((source) => source.familyId === "family:mica"),
    ).toHaveLength(2);
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
