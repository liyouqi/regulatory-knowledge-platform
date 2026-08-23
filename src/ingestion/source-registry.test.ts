import { describe, expect, it } from "vitest";
import { loadSourceRegistry } from "./source-registry";

describe("EU source registry", () => {
  it("contains reviewed Level 1 acts and registered Level 2 measures", async () => {
    const sources = await loadSourceRegistry();

    expect(sources).toHaveLength(10);
    expect(new Set(sources.map((source) => source.celex)).size).toBe(10);
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
    ).toHaveLength(4);
    expect(
      sources.filter((source) => source.familyId === "family:mica"),
    ).toHaveLength(2);
    expect(sources.every((source) => source.aliases.length > 0)).toBe(true);
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
