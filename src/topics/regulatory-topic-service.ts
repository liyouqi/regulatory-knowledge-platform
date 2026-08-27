import type {
  DocumentSummary,
  DocumentView,
  ProvisionRelationship,
} from "../shared/legal";
import {
  type RegulatoryTopic,
  type RegulatoryTopicResponse,
  type TopicAssignment,
  type TopicCatalogResponse,
  regulatoryTopicResponseSchema,
  topicCatalogResponseSchema,
} from "../shared/regulatory-topic";

const TOPIC_RELATION_TYPES = new Set<ProvisionRelationship["relationType"]>([
  "MANDATES",
  "ADOPTED_UNDER",
  "SUPPLEMENTS",
  "IMPLEMENTS",
]);

export interface RegulatoryTopicRepository {
  readonly buildId: string;
  readonly profileId: string;
  readonly profileVersion: string;
  readonly profileDisplayName: string;
  readonly profileHash: string;
  readonly regulatoryTopicTaxonomyId: "taxonomy:regulatory-topic";
  readonly regulatoryTopicTaxonomyVersion: string;
  readonly regulatoryTopicTaxonomyReviewedAt: string;
  listRegulatoryTopics(): RegulatoryTopic[];
  listTopicAssignments(topicId?: string): TopicAssignment[];
  listDocumentViews(): DocumentView[];
  listDocumentSummaries(): DocumentSummary[];
  listCrossDocumentRelationships(): ProvisionRelationship[];
}

export class RegulatoryTopicService {
  constructor(private readonly repository: RegulatoryTopicRepository) {}

  private runtime() {
    return {
      buildId: this.repository.buildId,
      profileId: this.repository.profileId,
      profileVersion: this.repository.profileVersion,
      profileDisplayName: this.repository.profileDisplayName,
      profileHash: this.repository.profileHash,
    };
  }

  list(): TopicCatalogResponse {
    const topics = this.repository.listRegulatoryTopics();
    const assignments = this.repository.listTopicAssignments();
    return topicCatalogResponseSchema.parse({
      schemaVersion: "1.0.0",
      runtime: this.runtime(),
      taxonomy: {
        id: this.repository.regulatoryTopicTaxonomyId,
        version: this.repository.regulatoryTopicTaxonomyVersion,
        provenance: "EDITORIAL",
        reviewStatus: "reviewed",
        reviewedAt: this.repository.regulatoryTopicTaxonomyReviewedAt,
      },
      topics: topics.map((topic) => {
        const topicAssignments = assignments.filter(
          (assignment) => assignment.topicId === topic.id,
        );
        return {
          ...topic,
          documentCount: new Set(
            topicAssignments.map((assignment) => assignment.targetDocumentId),
          ).size,
          provisionCount: topicAssignments.filter(
            (assignment) => assignment.targetKind === "provision",
          ).length,
          path: `/topics/${encodeURIComponent(topic.slug)}`,
        };
      }),
    });
  }

  findBySlug(slug: string): RegulatoryTopicResponse | null {
    const topic = this.repository
      .listRegulatoryTopics()
      .find((candidate) => candidate.slug === slug);
    if (!topic) return null;
    const assignments = this.repository.listTopicAssignments(topic.id);
    const assignmentsByDocument = new Map<string, TopicAssignment[]>();
    for (const assignment of assignments) {
      assignmentsByDocument.set(assignment.targetDocumentId, [
        ...(assignmentsByDocument.get(assignment.targetDocumentId) ?? []),
        assignment,
      ]);
    }
    const summaries = new Map(
      this.repository
        .listDocumentSummaries()
        .map((summary) => [summary.id, summary]),
    );
    const documents = this.repository
      .listDocumentViews()
      .flatMap((document) => {
        const documentAssignments = assignmentsByDocument.get(document.id);
        const summary = summaries.get(document.id);
        if (!documentAssignments || !summary) return [];
        return [
          {
            id: document.id,
            slug: document.slug,
            shortName: document.shortName,
            officialTitle: document.officialTitle,
            jurisdiction: document.jurisdiction,
            documentType: document.documentType,
            regulatoryLevel: summary.regulatoryLevel,
            measureType: summary.measureType,
            defaultPath: summary.defaultPath,
            assignments: documentAssignments,
          },
        ];
      })
      .sort(
        (left, right) =>
          Number(left.regulatoryLevel.slice(-1)) -
            Number(right.regulatoryLevel.slice(-1)) ||
          left.shortName.localeCompare(right.shortName),
      );
    const documentIds = new Set(documents.map((document) => document.id));
    const relationships = this.repository
      .listCrossDocumentRelationships()
      .filter(
        (relationship) =>
          relationship.provenance === "OFFICIAL_MAPPING" &&
          TOPIC_RELATION_TYPES.has(relationship.relationType) &&
          documentIds.has(relationship.source.documentId) &&
          documentIds.has(relationship.target.documentId),
      );

    return regulatoryTopicResponseSchema.parse({
      schemaVersion: "1.0.0",
      runtime: this.runtime(),
      topic,
      scope: {
        classificationProvenance: "EDITORIAL",
        applicabilityConclusion: false,
      },
      documents,
      relationships,
    });
  }
}
