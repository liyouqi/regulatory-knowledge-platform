import { describe, expect, it } from "vitest";
import { loadDocumentViews } from "../data/document-repository";
import {
  buildCellarLifecycle,
  loadCellarLifecycleRelations,
} from "./cellar-lifecycle";

describe("CELLAR lifecycle runtime builder", () => {
  const documents = loadDocumentViews();

  it("publishes reviewed lifecycle records without treating external Works as loaded Documents", () => {
    const build = buildCellarLifecycle(documents);

    expect(build.relationships).toHaveLength(70);
    expect(build.works).toHaveLength(82);
    expect(
      build.works.filter((work) => work.availability === "loaded"),
    ).toHaveLength(23);
    expect(
      build.works.filter((work) => work.availability === "external"),
    ).toHaveLength(59);
    expect(
      build.relationships.filter((item) => item.relationType === "AMENDS"),
    ).toHaveLength(29);
    expect(
      build.relationships.filter((item) => item.relationType === "CORRECTS"),
    ).toHaveLength(41);
    expect(
      build.relationships.filter(
        (item) => item.resolutionStatus === "external",
      ),
    ).toHaveLength(60);
    expect(
      build.relationships.filter(
        (item) => item.resolutionStatus === "resolved",
      ),
    ).toEqual([
      expect.objectContaining({
        sourceWorkId: "eu:32015L2366",
        relationType: "AMENDS",
        targetWorkId: "eu:32009L0110",
      }),
      expect.objectContaining({
        sourceWorkId: "eu:32023R1114",
        relationType: "AMENDS",
        targetWorkId: "eu:32013L0036",
      }),
      expect.objectContaining({
        id: "relationship:3a89335d6477cbfac49ee462",
        sourceWorkId: "eu:32022R2554",
        relationType: "AMENDS",
        targetWorkId: "eu:32012R0648",
      }),
      expect.objectContaining({
        sourceWorkId: "eu:32024R1623",
        relationType: "AMENDS",
        targetWorkId: "eu:32013R0575",
      }),
      expect.objectContaining({
        sourceWorkId: "eu:32019L2162",
        relationType: "AMENDS",
        targetWorkId: "eu:32014L0059",
      }),
      expect.objectContaining({
        sourceWorkId: "eu:32024L1619",
        relationType: "AMENDS",
        targetWorkId: "eu:32013L0036",
      }),
      expect.objectContaining({
        sourceWorkId: "eu:32023R1114",
        relationType: "AMENDS",
        targetWorkId: "eu:32010R1093",
      }),
      expect.objectContaining({
        id: "relationship:8fb413b27fb27de3bbae9271",
        sourceWorkId: "eu:32022R2554",
        relationType: "AMENDS",
        targetWorkId: "eu:32014R0909",
      }),
      expect.objectContaining({
        sourceWorkId: "eu:32019R2160",
        relationType: "AMENDS",
        targetWorkId: "eu:32013R0575",
      }),
      expect.objectContaining({
        id: "relationship:c6ffdeffb82af57894b0da07",
        sourceWorkId: "eu:32022R2554",
        relationType: "AMENDS",
        targetWorkId: "eu:32014R0600",
      }),
    ]);
    for (const [celex, uri] of [
      [
        "32012R0648",
        "https://publications.europa.eu/resource/cellar/665d41b1-2085-4584-af8a-45c605d62b94",
      ],
      [
        "32014R0909",
        "https://publications.europa.eu/resource/cellar/e58428b4-2e81-11e4-8c3c-01aa75ed71a1",
      ],
    ] as const) {
      expect(build.works).toContainEqual(
        expect.objectContaining({
          id: `eu:${celex}`,
          cellarWorkUri: uri,
          loadedDocumentId: `eu:${celex}`,
          availability: "loaded",
        }),
      );
    }
    expect(build.works).toContainEqual(
      expect.objectContaining({
        id: "eu:32013L0036",
        loadedDocumentId: "eu:32013L0036",
        label: "CRD IV",
        availability: "loaded",
      }),
    );
    expect(build.works).toContainEqual(
      expect.objectContaining({
        id: "eu:32010R1093",
        loadedDocumentId: "eu:32010R1093",
        label: "EBA Regulation",
        availability: "loaded",
      }),
    );
    expect(build.works).toContainEqual(
      expect.objectContaining({
        id: "eu:32014R0600",
        cellarWorkUri:
          "https://publications.europa.eu/resource/cellar/3b729ddf-f1f7-11e3-8cd4-01aa75ed71a1",
        loadedDocumentId: "eu:32014R0600",
        label: "MiFIR",
        availability: "loaded",
      }),
    );
    expect(build.works).toContainEqual(
      expect.objectContaining({
        id: "eu:32024R2956",
        loadedDocumentId: "eu:32024R2956",
        label: "DORA ITS Register of Information",
        availability: "loaded",
      }),
    );
    expect(build.works).toContainEqual(
      expect.objectContaining({
        id: "eu:32024R2956R(01)",
        loadedDocumentId: null,
        label: "Corrigendum 1",
        title: null,
        availability: "external",
      }),
    );
  });

  it("is deterministic, filters unrelated seed records, and rejects Work URI conflicts", () => {
    const records = loadCellarLifecycleRelations();
    const first = buildCellarLifecycle(documents, records);

    expect(buildCellarLifecycle(documents, records)).toEqual(first);
    expect(new Set(first.relationships.map((item) => item.id)).size).toBe(
      first.relationships.length,
    );
    expect(
      buildCellarLifecycle([documents[0]], records).relationships.length,
    ).toBe(14);
    expect(() =>
      buildCellarLifecycle(documents, [
        records[0],
        {
          ...records[0],
          sourceWorkUri:
            "https://publications.europa.eu/resource/cellar/conflicting-work",
          targetCelex: "32022R2554",
          targetWorkUri:
            "https://publications.europa.eu/resource/cellar/0caf473a-85bd-11ed-9887-01aa75ed71a1",
        },
      ]),
    ).toThrow();
  });
});
