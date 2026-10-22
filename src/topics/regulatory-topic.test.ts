import { describe, expect, it } from "vitest";
import { loadDocumentViews } from "../data/document-repository";
import { buildExplicitReferences } from "../relationships/explicit-reference";
import {
  buildRegulatoryTopics,
  loadRegulatoryTopicDataset,
} from "./regulatory-topic";

describe("reviewed Regulatory Topics", () => {
  const documents = loadDocumentViews();
  const entities = buildExplicitReferences(documents).entities;
  const knownDocumentIds = new Set(documents.map((document) => document.id));

  it("publishes four cross-file, provision-linked editorial topics", () => {
    const build = buildRegulatoryTopics(documents, entities, knownDocumentIds);

    expect(build.topics.map((topic) => topic.id)).toEqual([
      "topic:banking-governance-internal-control",
      "topic:fund-management-organisation-risk",
      "topic:ict-third-party-risk",
      "topic:major-ict-incident-reporting",
    ]);
    expect(build.assignments).toHaveLength(33);
    expect(build.assignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          topicId: "topic:major-ict-incident-reporting",
          targetEntityId: "eu:32022R2554:article:20",
          provenance: "EDITORIAL",
          role: "primary",
        }),
        expect.objectContaining({
          topicId: "topic:banking-governance-internal-control",
          targetEntityId: "eu:eba:gl:2021:05:paragraph:5",
          provenance: "EDITORIAL",
        }),
      ]),
    );
  });

  it("publishes twenty governance entries without changing official relationship semantics", () => {
    const build = buildRegulatoryTopics(documents, entities, knownDocumentIds);
    const governance = build.assignments.filter(
      (assignment) =>
        assignment.topicId === "topic:banking-governance-internal-control",
    );
    expect(governance).toHaveLength(20);
    expect(
      new Set(governance.map((assignment) => assignment.targetDocumentId)).size,
    ).toBe(3);
    expect(
      governance.every(
        (assignment) =>
          assignment.provenance === "EDITORIAL" &&
          assignment.targetKind === "provision",
      ),
    ).toBe(true);
    expect(
      governance.find(
        (assignment) =>
          assignment.targetEntityId ===
          "lu:cssf:circular-12-552:part:ii:provision:point-25",
      )?.targetPath,
    ).toBe("/read/circular-cssf-12-552/provisions/part-ii-provision-point-25");
    expect(
      governance.find(
        (assignment) =>
          assignment.targetEntityId === "eu:32013L0036:article:76",
      )?.role,
    ).toBe("primary");
  });

  it("fails closed when a selected assignment endpoint drifts", () => {
    const dataset = structuredClone(loadRegulatoryTopicDataset());
    const assignment = dataset.assignments[0];
    if (!assignment) throw new Error("Topic assignment fixture is unavailable");
    assignment.targetEntityId = "eu:32022R2554:article:999";
    assignment.evidenceLocator = assignment.targetEntityId;

    expect(() =>
      buildRegulatoryTopics(documents, entities, knownDocumentIds, dataset),
    ).toThrow("Topic assignment has invalid endpoint");
  });

  it("omits and reports only a drifted assignment in refresh mode", () => {
    const dataset = structuredClone(loadRegulatoryTopicDataset());
    const assignment = dataset.assignments[1];
    if (!assignment) throw new Error("Topic assignment fixture is unavailable");
    assignment.targetEntityId = "eu:32022R2554:article:999";
    assignment.evidenceLocator = assignment.targetEntityId;
    const issues: Array<{
      dataset: string;
      recordId: string;
      message: string;
    }> = [];

    const build = buildRegulatoryTopics(
      documents,
      entities,
      knownDocumentIds,
      dataset,
      { mode: "report", issues },
    );

    expect(build.assignments).toHaveLength(dataset.assignments.length - 1);
    expect(issues).toEqual([
      expect.objectContaining({
        dataset: "regulatory-topics",
        message: expect.stringContaining("invalid endpoint"),
      }),
    ]);
  });

  it("does not publish a partial topic from a reduced corpus", () => {
    const dora = documents.filter((document) => document.slug === "dora");
    const build = buildRegulatoryTopics(
      dora,
      buildExplicitReferences(dora).entities,
      knownDocumentIds,
    );

    expect(build).toMatchObject({ topics: [], assignments: [] });
  });
});
