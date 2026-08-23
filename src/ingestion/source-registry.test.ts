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
  });
});
