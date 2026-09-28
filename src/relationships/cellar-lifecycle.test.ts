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

    expect(build.relationships).toHaveLength(67);
    expect(build.works).toHaveLength(77);
    expect(
      build.works.filter((work) => work.availability === "loaded"),
    ).toHaveLength(14);
    expect(
      build.works.filter((work) => work.availability === "external"),
    ).toHaveLength(63);
    expect(
      build.relationships.filter((item) => item.relationType === "AMENDS"),
    ).toHaveLength(26);
    expect(
      build.relationships.filter((item) => item.relationType === "CORRECTS"),
    ).toHaveLength(41);
    expect(
      build.relationships.filter(
        (item) => item.resolutionStatus === "external",
      ),
    ).toHaveLength(64);
    expect(
      build.relationships.filter(
        (item) => item.resolutionStatus === "resolved",
      ),
    ).toEqual([
      expect.objectContaining({
        sourceWorkId: "eu:32023R1114",
        relationType: "AMENDS",
        targetWorkId: "eu:32013L0036",
      }),
      expect.objectContaining({
        sourceWorkId: "eu:32024R1623",
        relationType: "AMENDS",
        targetWorkId: "eu:32013R0575",
      }),
      expect.objectContaining({
        sourceWorkId: "eu:32024L1619",
        relationType: "AMENDS",
        targetWorkId: "eu:32013L0036",
      }),
    ]);
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
