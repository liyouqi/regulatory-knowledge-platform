import { describe, expect, it } from "vitest";
import { loadSourceRegistry } from "./source-registry";

describe("EU source registry", () => {
  it("contains the six reviewed core legal families with unique CELEX IDs", async () => {
    const sources = await loadSourceRegistry();

    expect(sources).toHaveLength(6);
    expect(new Set(sources.map((source) => source.celex)).size).toBe(6);
    expect(sources.map((source) => source.shortName)).toEqual([
      "DORA",
      "GDPR",
      "AI Act",
      "MiCA",
      "NIS2",
      "Data Act",
    ]);
    expect(sources.every((source) => source.quality !== undefined)).toBe(true);
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
