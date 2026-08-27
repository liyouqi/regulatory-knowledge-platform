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

  it("publishes three cross-file, provision-linked editorial topics", () => {
    const build = buildRegulatoryTopics(documents, entities, knownDocumentIds);

    expect(build.topics.map((topic) => topic.id)).toEqual([
      "topic:banking-governance-internal-control",
      "topic:ict-third-party-risk",
      "topic:major-ict-incident-reporting",
    ]);
    expect(build.assignments).toHaveLength(10);
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
