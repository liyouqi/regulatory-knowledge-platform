import type {
  DocumentSummary,
  DocumentView,
  ProvisionRelationship,
} from "../shared/legal";
import type {
  DocumentRegulatoryContext,
  DomainAssignment,
  RegulatoryDomain,
} from "../shared/regulatory-context";
import {
  type RegulatoryPathResponse,
  regulatoryPathResponseSchema,
} from "../shared/regulatory-path";

const PATH_RELATION_TYPES = new Set<ProvisionRelationship["relationType"]>([
  "MANDATES",
  "SUPPLEMENTS",
  "IMPLEMENTS",
]);
const PATH_RELATION_ORDER = new Map<
  ProvisionRelationship["relationType"],
  number
>([
  ["MANDATES", 0],
  ["SUPPLEMENTS", 1],
  ["IMPLEMENTS", 2],
]);

function documentOrder(document: {
  jurisdiction: string;
  measureType: string;
}): number {
  if (document.jurisdiction !== "EU") return 2;
  return document.measureType === "guideline" ? 1 : 0;
}

export interface RegulatoryPathRepository {
  readonly buildId: string;
  readonly profileId: string;
  readonly profileVersion: string;
  readonly profileDisplayName: string;
  readonly profileHash: string;
  listDocumentViews(): DocumentView[];
  listDocumentSummaries(): DocumentSummary[];
  listRegulatoryDomains(): RegulatoryDomain[];
  listDomainAssignments(domainId: string): DomainAssignment[];
  listCrossDocumentRelationships(): ProvisionRelationship[];
  findDocumentRegulatoryContext(
    documentId: string,
  ): DocumentRegulatoryContext | null;
}

export function regulatoryDomainSlug(domainId: string): string {
  return domainId.replace(/^domain:/u, "");
}

function domainAncestors(
  domain: RegulatoryDomain,
  domainsById: Map<string, RegulatoryDomain>,
): RegulatoryDomain[] {
  const ancestors: RegulatoryDomain[] = [];
  const visited = new Set([domain.id]);
  let parentId = domain.parentId;
  while (parentId) {
    if (visited.has(parentId)) {
      throw new Error(`Regulatory Domain cycle at ${parentId}`);
    }
    const parent = domainsById.get(parentId);
    if (!parent)
      throw new Error(`Unknown parent Regulatory Domain ${parentId}`);
    visited.add(parentId);
    ancestors.unshift(parent);
    parentId = parent.parentId;
  }
  return ancestors;
}

export class RegulatoryPathService {
  constructor(private readonly repository: RegulatoryPathRepository) {}

  findByDomainSlug(slug: string): RegulatoryPathResponse | null {
    const domains = this.repository.listRegulatoryDomains();
    const domain = domains.find(
      (candidate) => regulatoryDomainSlug(candidate.id) === slug,
    );
    if (!domain) return null;

    const assignments = this.repository.listDomainAssignments(domain.id);
    if (assignments.length === 0) return null;
    const assignedDocumentIds = new Set(
      assignments.map((assignment) => assignment.targetDocumentId),
    );
    const relationships = this.repository
      .listCrossDocumentRelationships()
      .filter(
        (relationship) =>
          PATH_RELATION_TYPES.has(relationship.relationType) &&
          relationship.provenance === "OFFICIAL_MAPPING" &&
          assignedDocumentIds.has(relationship.source.documentId) &&
          assignedDocumentIds.has(relationship.target.documentId),
      )
      .sort(
        (left, right) =>
          (PATH_RELATION_ORDER.get(left.relationType) ?? 99) -
            (PATH_RELATION_ORDER.get(right.relationType) ?? 99) ||
          left.id.localeCompare(right.id),
      );
    if (relationships.length === 0) return null;

    const summariesById = new Map(
      this.repository
        .listDocumentSummaries()
        .map((summary) => [summary.id, summary]),
    );
    const documents = this.repository
      .listDocumentViews()
      .filter((document) => assignedDocumentIds.has(document.id))
      .map((document) => {
        const summary = summariesById.get(document.id);
        const context = this.repository.findDocumentRegulatoryContext(
          document.id,
        );
        if (
          !summary ||
          !context ||
          context.buildId !== this.repository.buildId ||
          context.profileId !== this.repository.profileId
        ) {
          throw new Error(
            `Incomplete regulatory path context for ${document.id}`,
          );
        }
        const documentAssignments = assignments.filter(
          (assignment) => assignment.targetDocumentId === document.id,
        );
        if (documentAssignments.length === 0) {
          throw new Error(`Missing domain assignment for ${document.id}`);
        }
        return {
          id: document.id,
          jurisdiction: document.jurisdiction,
          slug: document.slug,
          shortName: document.shortName,
          officialTitle: document.officialTitle,
          documentType: document.documentType,
          sourceUrl: document.sourceUrl,
          defaultPath: summary.defaultPath,
          regulatoryLevel: summary.regulatoryLevel,
          measureType: summary.measureType,
          assignments: documentAssignments,
          authorityRelationships: context.authorityRelationships,
          legalNature: context.legalNature,
        };
      })
      .sort(
        (left, right) =>
          documentOrder(left) - documentOrder(right) ||
          left.id.localeCompare(right.id),
      );
    if (documents.length !== assignedDocumentIds.size) {
      throw new Error(`Regulatory path ${domain.id} crossed Profile scope`);
    }

    const domainsById = new Map(domains.map((item) => [item.id, item]));
    return regulatoryPathResponseSchema.parse({
      schemaVersion: "1.0.0",
      id: `regulatory-path:${domain.id}`,
      slug,
      domain,
      ancestors: domainAncestors(domain, domainsById),
      runtime: {
        buildId: this.repository.buildId,
        profileId: this.repository.profileId,
        profileVersion: this.repository.profileVersion,
        profileDisplayName: this.repository.profileDisplayName,
        profileHash: this.repository.profileHash,
      },
      scope: {
        classificationProvenance: "EDITORIAL",
        relationshipProvenance: "OFFICIAL_MAPPING",
        applicabilityConclusion: false,
      },
      documents,
      relationships,
    });
  }
}
