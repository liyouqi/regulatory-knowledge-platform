import { describe, expect, it } from "vitest";
import {
  loadNationalSourceCatalogSync,
  loadNationalSourceRegistrySync,
  nationalSourceDefinitionSchema,
  officialNationalHttpsUrl,
} from "./national-source-registry";

describe("German national sources", () => {
  it("keeps unreviewed sources out of active registry", () => {
    const catalog = loadNationalSourceCatalogSync();
    expect(catalog.map((s) => s.localId)).toEqual([
      "de-gwg-2017",
      "de-wpig",
      "de-kagb",
      "de-kwg",
    ]);
    expect(loadNationalSourceRegistrySync().map((s) => s.localId)).toEqual([
      "de-gwg-2017",
      "de-wpig",
      "de-kagb",
      "de-kwg",
    ]);
    expect(
      catalog.filter((s) => s.status === "candidate").map((s) => s.localId),
    ).toEqual([]);
  });
  it("rejects active sources without both reviewed quality and publication date", () => {
    const source = loadNationalSourceCatalogSync()[0];
    expect(
      nationalSourceDefinitionSchema.safeParse({
        ...source,
        status: "active",
        quality: undefined,
      }).success,
    ).toBe(false);
    expect(
      nationalSourceDefinitionSchema.safeParse({
        ...source,
        documentId: "de:gii:bjnr000",
      }).success,
    ).toBe(false);
  });
  it("rejects non-official hosts and misleading URLs", () => {
    expect(() =>
      officialNationalHttpsUrl(
        "https://www.gesetze-im-internet.de.evil.example/x",
      ),
    ).toThrow();
    const source = loadNationalSourceCatalogSync()[0];
    expect(
      nationalSourceDefinitionSchema.safeParse({
        ...source,
        contentUrl: "https://www.gesetze-im-internet.de/wpig/xml.zip",
      }).success,
    ).toBe(false);
  });
});
