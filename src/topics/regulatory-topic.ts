import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import type { LegalEntityRecord } from "../relationships/explicit-reference";
import {
  type ReviewValidationOptions,
  rejectReviewedInput,
} from "../relationships/review-validation";
import type { DocumentView } from "../shared/legal";
import type {
  RegulatoryTopic,
  TopicAssignment,
} from "../shared/regulatory-topic";

export const REGULATORY_TOPIC_BUILDER = "regulatory-topic";
export const REGULATORY_TOPIC_BUILDER_VERSION = "1.0.0";
export const DEFAULT_REGULATORY_TOPICS_PATH = resolve(
  process.cwd(),
  "data/editorial/regulatory-topics.json",
);

const topicInputSchema = z
  .object({
    id: z.string().startsWith("topic:"),
    label: z.string().min(1),
    description: z.string().min(1),
  })
  .strict();

const topicAssignmentInputSchema = z
  .object({
    topicId: z.string().startsWith("topic:"),
    targetDocumentId: z.string().min(1),
    targetEntityId: z.string().min(1),
    targetKind: z.enum(["document", "provision"]),
    role: z.enum(["primary", "supporting"]),
    assignmentVersion: z.string().min(1),
    reviewedAt: z.string().datetime(),
    rationale: z.string().min(1),
    reviewNote: z.string().min(1),
    evidenceLocator: z.string().min(1),
  })
  .strict();

export const regulatoryTopicDatasetSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    taxonomy: z
      .object({
        id: z.literal("taxonomy:regulatory-topic"),
        version: z.string().min(1),
        provenance: z.literal("EDITORIAL"),
        reviewStatus: z.literal("reviewed"),
        reviewedAt: z.string().datetime(),
      })
      .strict(),
    topics: z.array(topicInputSchema).min(1),
    assignments: z.array(topicAssignmentInputSchema).min(1),
  })
  .strict();

export type RegulatoryTopicDataset = z.infer<
  typeof regulatoryTopicDatasetSchema
>;

export interface RegulatoryTopicBuild {
  taxonomyId: "taxonomy:regulatory-topic";
  taxonomyVersion: string;
  taxonomyReviewedAt: string;
  topics: RegulatoryTopic[];
  assignments: TopicAssignment[];
}

function stableId(parts: string[]): string {
  const hash = createHash("sha256")
    .update(parts.join("\n"))
    .digest("hex")
    .slice(0, 24);
  return `topic-assignment:${hash}`;
}

function assertUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} values must be unique`);
  }
}

export function topicSlug(topicId: string): string {
  return topicId.replace(/^topic:/u, "");
}

export function loadRegulatoryTopicDataset(
  inputPath = DEFAULT_REGULATORY_TOPICS_PATH,
): RegulatoryTopicDataset {
  return regulatoryTopicDatasetSchema.parse(
    JSON.parse(readFileSync(inputPath, "utf8")),
  );
}

export function buildRegulatoryTopics(
  documents: DocumentView[],
  entities: LegalEntityRecord[],
  knownDocumentIds: Set<string> | null,
  dataset = loadRegulatoryTopicDataset(),
  validation: ReviewValidationOptions = {},
): RegulatoryTopicBuild {
  assertUnique(
    dataset.topics.map((topic) => topic.id),
    "Topic ID",
  );
  const topicIds = new Set(dataset.topics.map((topic) => topic.id));
  const selectedDocumentIds = new Set(documents.map((document) => document.id));
  const entitiesById = new Map(entities.map((entity) => [entity.id, entity]));

  const assignments = dataset.assignments.flatMap((assignment) => {
    const recordId = `${assignment.topicId}:${assignment.targetEntityId}`;
    if (!topicIds.has(assignment.topicId)) {
      rejectReviewedInput(
        validation,
        "regulatory-topics",
        recordId,
        new Error(
          `Topic assignment targets unknown Topic ${assignment.topicId}`,
        ),
      );
      return [];
    }
    if (
      knownDocumentIds &&
      !knownDocumentIds.has(assignment.targetDocumentId)
    ) {
      rejectReviewedInput(
        validation,
        "regulatory-topics",
        recordId,
        new Error(
          `Topic assignment targets unknown Document ${assignment.targetDocumentId}`,
        ),
      );
      return [];
    }
    if (!selectedDocumentIds.has(assignment.targetDocumentId)) return [];
    const entity = entitiesById.get(assignment.targetEntityId);
    const hasExpectedKind =
      assignment.targetKind === "document"
        ? entity?.kind === "document"
        : entity?.kind !== "document" && entity?.rootProvisionId === null;
    if (
      !entity ||
      entity.documentId !== assignment.targetDocumentId ||
      !hasExpectedKind ||
      assignment.evidenceLocator !== assignment.targetEntityId
    ) {
      rejectReviewedInput(
        validation,
        "regulatory-topics",
        recordId,
        new Error(
          `Topic assignment has invalid endpoint ${assignment.targetEntityId}`,
        ),
      );
      return [];
    }
    return [
      {
        id: stableId([
          assignment.topicId,
          assignment.targetEntityId,
          assignment.role,
          assignment.assignmentVersion,
        ]),
        ...assignment,
        targetLabel: entity.label,
        targetTitle: entity.title,
        targetPath: entity.path,
        provenance: "EDITORIAL" as const,
        reviewStatus: "reviewed" as const,
      },
    ];
  });
  assertUnique(
    assignments.map((assignment) => assignment.id),
    "Topic assignment",
  );
  const selectedTopicIds = new Set(
    dataset.topics.flatMap((topic) => {
      const topicAssignments = assignments.filter(
        (assignment) => assignment.topicId === topic.id,
      );
      return new Set(
        topicAssignments.map((assignment) => assignment.targetDocumentId),
      ).size >= 2 &&
        topicAssignments.some(
          (assignment) => assignment.targetKind === "provision",
        )
        ? [topic.id]
        : [];
    }),
  );
  const topics = dataset.topics
    .filter((topic) => selectedTopicIds.has(topic.id))
    .map((topic) => ({
      ...topic,
      slug: topicSlug(topic.id),
      taxonomyId: dataset.taxonomy.id,
      taxonomyVersion: dataset.taxonomy.version,
      provenance: dataset.taxonomy.provenance,
      reviewStatus: dataset.taxonomy.reviewStatus,
      reviewedAt: dataset.taxonomy.reviewedAt,
    }));

  return {
    taxonomyId: dataset.taxonomy.id,
    taxonomyVersion: dataset.taxonomy.version,
    taxonomyReviewedAt: dataset.taxonomy.reviewedAt,
    topics: topics.sort((left, right) => left.id.localeCompare(right.id)),
    assignments: assignments
      .filter((assignment) => selectedTopicIds.has(assignment.topicId))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}
