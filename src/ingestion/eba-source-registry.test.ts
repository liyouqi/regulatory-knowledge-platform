import { describe, expect, it } from "vitest";
import {
  ebaSourceDefinitionSchema,
  loadEbaSourceRegistrySync,
  officialEbaHttpsUrl,
} from "./eba-source-registry";

describe("EBA source registry", () => {
  it("publishes one official, quality-gated guideline source", () => {
    const sources = loadEbaSourceRegistrySync();
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      localId: "eba-gl-2021-05",
      documentId: "eu:eba:gl:2021:05",
      familyId: "family:crd",
      authority: "EBA",
      regulatoryLevel: "level-3",
      measureType: "guideline",
      quality: {
        pageCount: 93,
        provisionCount: 235,
        structuralNodeCount: 57,
        blockCount: 470,
      },
    });
  });

  it("fails closed for non-EBA URLs and inconsistent stable IDs", () => {
    expect(() => officialEbaHttpsUrl("https://example.com/source.pdf")).toThrow(
      /Unexpected EBA official URL/u,
    );
    const source = structuredClone(loadEbaSourceRegistrySync()[0]);
    if (!source) throw new Error("Missing EBA source fixture");
    expect(() =>
      ebaSourceDefinitionSchema.parse({
        ...source,
        documentId: "eu:eba:gl:2021:06",
      }),
    ).toThrow(/does not match local ID/u);
  });
});
