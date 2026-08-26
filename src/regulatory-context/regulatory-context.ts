import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import type { LegalEntityRecord } from "../relationships/explicit-reference";
import type { BodyBlock, DocumentView } from "../shared/legal";
import type {
  Authority,
  LegalNature,
  RegulatoryDomain,
} from "../shared/regulatory-context";

export const REGULATORY_CONTEXT_BUILDER = "regulatory-context";
export const REGULATORY_CONTEXT_BUILDER_VERSION = "1.0.0";
export const DEFAULT_REGULATORY_DOMAINS_PATH = resolve(
  process.cwd(),
  "data/editorial/regulatory-domains.json",
);
export const DEFAULT_AUTHORITIES_PATH = resolve(
  process.cwd(),
  "data/official-metadata/authorities.json",
);
export const DEFAULT_LEGAL_NATURES_PATH = resolve(
  process.cwd(),
  "data/official-metadata/legal-natures.json",
);

const reviewedAtSchema = z.string().datetime();

const domainDefinitionSchema = z
  .object({
    id: z.string().startsWith("domain:"),
    parentId: z.string().startsWith("domain:").nullable(),
    label: z.string().min(1),
    description: z.string().min(1),
  })
  .strict();

const domainAssignmentInputSchema = z
  .object({
    domainId: z.string().startsWith("domain:"),
    targetDocumentId: z.string().min(1),
    targetEntityId: z.string().min(1),
    targetKind: z.enum(["document", "provision"]),
    role: z.enum(["contains", "primary"]),
    assignmentVersion: z.string().min(1),
    reviewedAt: reviewedAtSchema,
    rationale: z.string().min(1),
    reviewNote: z.string().min(1),
    evidenceLocator: z.string().min(1),
  })
  .strict();

export const regulatoryDomainDatasetSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    taxonomy: z
      .object({
        id: z.string().startsWith("taxonomy:"),
        version: z.string().min(1),
        provenance: z.literal("EDITORIAL"),
        reviewStatus: z.literal("reviewed"),
        reviewedAt: reviewedAtSchema,
      })
      .strict(),
    domains: z.array(domainDefinitionSchema).min(1),
    assignments: z.array(domainAssignmentInputSchema),
  })
  .strict();

const authorityInputSchema = z
  .object({
    id: z.string().startsWith("authority:"),
    officialName: z.string().min(1),
    acronym: z.string().min(1).nullable(),
    authorityType: z.enum(["legislative-institution", "supervisory-authority"]),
    jurisdiction: z.string().min(1),
    sourceUrl: z.string().url(),
    checkedAt: reviewedAtSchema,
  })
  .strict();

const authorityRelationshipInputSchema = z
  .object({
    sourceDocumentId: z.string().min(1),
    relationType: z.literal("ISSUED_BY"),
    targetAuthorityId: z.string().startsWith("authority:"),
    provenance: z.literal("OFFICIAL_METADATA"),
    evidenceText: z.string().min(1),
    evidenceLocator: z.string().min(1),
    sourceRef: z.string().url(),
    reviewStatus: z.literal("reviewed"),
    reviewedAt: reviewedAtSchema,
  })
  .strict();

export const authorityDatasetSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    version: z.string().min(1),
    authorities: z.array(authorityInputSchema).min(1),
    relationships: z.array(authorityRelationshipInputSchema),
  })
  .strict();

const legalNatureEvidenceSchema = z
  .object({
    entityId: z.string().min(1),
    text: z.string().min(1),
    sourceUrl: z.string().url(),
  })
  .strict();

export const legalNatureDatasetSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    version: z.string().min(1),
    records: z.array(
      z
        .object({
          documentId: z.string().min(1),
          instrumentType: z.literal("guideline"),
          complianceExpectation: z.literal("make-every-effort-to-comply"),
          currentStatus: z.literal("in-force"),
          underReview: z.boolean(),
          applicationDate: z.string().date(),
          statusCheckedAt: reviewedAtSchema,
          legalBasisEvidence: legalNatureEvidenceSchema,
          applicationEvidence: legalNatureEvidenceSchema,
          statusSourceUrl: z.string().url(),
          reviewStatus: z.literal("reviewed"),
          reviewedAt: reviewedAtSchema,
        })
        .strict(),
    ),
  })
  .strict();

export type RegulatoryDomainDataset = z.infer<
  typeof regulatoryDomainDatasetSchema
>;
export type AuthorityDataset = z.infer<typeof authorityDatasetSchema>;
export type LegalNatureDataset = z.infer<typeof legalNatureDatasetSchema>;

export interface DomainAssignmentRecord {
  id: string;
  domainId: string;
  targetDocumentId: string;
  targetEntityId: string;
  targetKind: "document" | "provision";
  role: "contains" | "primary";
  provenance: "EDITORIAL";
  assignmentVersion: string;
  reviewStatus: "reviewed";
  reviewedAt: string;
  rationale: string;
  reviewNote: string;
  evidenceLocator: string;
}

export interface AuthorityRelationshipRecord {
  id: string;
  sourceDocumentId: string;
  relationType: "ISSUED_BY";
  targetAuthorityId: string;
  provenance: "OFFICIAL_METADATA";
  evidenceText: string;
  evidenceLocator: string;
  sourceRef: string;
  builderMethod: typeof REGULATORY_CONTEXT_BUILDER;
  builderVersion: typeof REGULATORY_CONTEXT_BUILDER_VERSION;
  reviewStatus: "reviewed";
  reviewedAt: string;
}

export interface RegulatoryContextBuild {
  taxonomyId: string;
  taxonomyVersion: string;
  domains: RegulatoryDomain[];
  assignments: DomainAssignmentRecord[];
  authorities: Authority[];
  authorityRelationships: AuthorityRelationshipRecord[];
  legalNatures: LegalNature[];
}

function stableId(prefix: string, parts: string[]): string {
  const hash = createHash("sha256")
    .update(parts.join("\n"))
    .digest("hex")
    .slice(0, 24);
  return `${prefix}:${hash}`;
}

function assertUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} IDs must be unique`);
  }
}

function findBlockText(blocks: BodyBlock[], entityId: string): string | null {
  for (const block of blocks) {
    if (block.id === entityId) return block.text;
    const nested = findBlockText(block.children, entityId);
    if (nested !== null) return nested;
  }
  return null;
}

function validateDomainHierarchy(dataset: RegulatoryDomainDataset): void {
  const byId = new Map(dataset.domains.map((domain) => [domain.id, domain]));
  assertUnique(
    dataset.domains.map((domain) => domain.id),
    "Domain",
  );
  for (const domain of dataset.domains) {
    if (domain.parentId && !byId.has(domain.parentId)) {
      throw new Error(`Unknown parent Domain ${domain.parentId}`);
    }
    const visited = new Set<string>([domain.id]);
    let current = domain;
    while (current.parentId) {
      if (visited.has(current.parentId)) {
        throw new Error(
          `Regulatory Domain hierarchy contains a cycle at ${domain.id}`,
        );
      }
      visited.add(current.parentId);
      const parent = byId.get(current.parentId);
      if (!parent) break;
      current = parent;
    }
  }
}

export function loadRegulatoryDomainDataset(
  inputPath = DEFAULT_REGULATORY_DOMAINS_PATH,
): RegulatoryDomainDataset {
  const dataset = regulatoryDomainDatasetSchema.parse(
    JSON.parse(readFileSync(inputPath, "utf8")),
  );
  validateDomainHierarchy(dataset);
  return dataset;
}

export function loadAuthorityDataset(
  inputPath = DEFAULT_AUTHORITIES_PATH,
): AuthorityDataset {
  const dataset = authorityDatasetSchema.parse(
    JSON.parse(readFileSync(inputPath, "utf8")),
  );
  assertUnique(
    dataset.authorities.map((authority) => authority.id),
    "Authority",
  );
  const authorityIds = new Set(
    dataset.authorities.map((authority) => authority.id),
  );
  for (const relationship of dataset.relationships) {
    if (!authorityIds.has(relationship.targetAuthorityId)) {
      throw new Error(`Unknown Authority ${relationship.targetAuthorityId}`);
    }
  }
  return dataset;
}

export function loadLegalNatureDataset(
  inputPath = DEFAULT_LEGAL_NATURES_PATH,
): LegalNatureDataset {
  const dataset = legalNatureDatasetSchema.parse(
    JSON.parse(readFileSync(inputPath, "utf8")),
  );
  assertUnique(
    dataset.records.map((record) => record.documentId),
    "Legal nature Document",
  );
  return dataset;
}

export function buildRegulatoryContext(
  documents: DocumentView[],
  entities: LegalEntityRecord[],
  knownDocumentIds: Set<string> | null,
  domainDataset = loadRegulatoryDomainDataset(),
  authorityDataset = loadAuthorityDataset(),
  legalNatureDataset = loadLegalNatureDataset(),
): RegulatoryContextBuild {
  validateDomainHierarchy(domainDataset);
  const selectedDocumentIds = new Set(documents.map((document) => document.id));
  const entitiesById = new Map(entities.map((entity) => [entity.id, entity]));
  const domainIds = new Set(domainDataset.domains.map((domain) => domain.id));
  const assignments = domainDataset.assignments.flatMap((assignment) => {
    if (
      knownDocumentIds &&
      !knownDocumentIds.has(assignment.targetDocumentId)
    ) {
      throw new Error(
        `Domain assignment targets unknown Document ${assignment.targetDocumentId}`,
      );
    }
    if (!domainIds.has(assignment.domainId)) {
      throw new Error(
        `Domain assignment targets unknown Domain ${assignment.domainId}`,
      );
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
      !hasExpectedKind
    ) {
      throw new Error(
        `Domain assignment has invalid endpoint ${assignment.targetEntityId}`,
      );
    }
    return [
      {
        id: stableId("domain-assignment", [
          assignment.domainId,
          assignment.targetEntityId,
          assignment.role,
          assignment.assignmentVersion,
        ]),
        ...assignment,
        provenance: "EDITORIAL" as const,
        reviewStatus: "reviewed" as const,
      },
    ];
  });
  assertUnique(
    assignments.map((assignment) => assignment.id),
    "Domain assignment",
  );

  const authorityRelationships = authorityDataset.relationships.flatMap(
    (relationship) => {
      if (
        knownDocumentIds &&
        !knownDocumentIds.has(relationship.sourceDocumentId)
      ) {
        throw new Error(
          `Authority relationship targets unknown Document ${relationship.sourceDocumentId}`,
        );
      }
      if (!selectedDocumentIds.has(relationship.sourceDocumentId)) return [];
      return [
        {
          id: stableId("authority-relationship", [
            relationship.sourceDocumentId,
            relationship.relationType,
            relationship.targetAuthorityId,
            relationship.evidenceLocator,
          ]),
          ...relationship,
          builderMethod:
            REGULATORY_CONTEXT_BUILDER as typeof REGULATORY_CONTEXT_BUILDER,
          builderVersion:
            REGULATORY_CONTEXT_BUILDER_VERSION as typeof REGULATORY_CONTEXT_BUILDER_VERSION,
        },
      ];
    },
  );
  assertUnique(
    authorityRelationships.map((relationship) => relationship.id),
    "Authority relationship",
  );
  const selectedAuthorityIds = new Set(
    authorityRelationships.map(
      (relationship) => relationship.targetAuthorityId,
    ),
  );
  const legalNatures = legalNatureDataset.records.flatMap((record) => {
    if (knownDocumentIds && !knownDocumentIds.has(record.documentId)) {
      throw new Error(
        `Legal nature targets unknown Document ${record.documentId}`,
      );
    }
    if (!selectedDocumentIds.has(record.documentId)) return [];
    for (const evidence of [
      record.legalBasisEvidence,
      record.applicationEvidence,
    ]) {
      const entity = entitiesById.get(evidence.entityId);
      if (!entity || entity.documentId !== record.documentId) {
        throw new Error(
          `Legal nature has invalid evidence endpoint ${evidence.entityId}`,
        );
      }
      const document = documents.find(
        (candidate) => candidate.id === record.documentId,
      );
      const rootProvisionId = entity.rootProvisionId ?? entity.id;
      const provision = document?.provisions.find(
        (candidate) => candidate.id === rootProvisionId,
      );
      const text = provision
        ? findBlockText(provision.blocks, evidence.entityId)
        : null;
      if (!text?.includes(evidence.text)) {
        throw new Error(
          `Legal nature evidence text mismatch for ${evidence.entityId}`,
        );
      }
    }
    return [
      {
        documentId: record.documentId,
        instrumentType: record.instrumentType,
        complianceExpectation: record.complianceExpectation,
        currentStatus: record.currentStatus,
        underReview: record.underReview,
        applicationDate: record.applicationDate,
        statusCheckedAt: record.statusCheckedAt,
        legalBasisEvidenceText: record.legalBasisEvidence.text,
        legalBasisEvidenceEntityId: record.legalBasisEvidence.entityId,
        legalBasisSourceUrl: record.legalBasisEvidence.sourceUrl,
        applicationEvidenceText: record.applicationEvidence.text,
        applicationEvidenceEntityId: record.applicationEvidence.entityId,
        applicationSourceUrl: record.applicationEvidence.sourceUrl,
        statusSourceUrl: record.statusSourceUrl,
        provenance: "OFFICIAL_METADATA" as const,
        reviewStatus: record.reviewStatus,
        reviewedAt: record.reviewedAt,
      },
    ];
  });

  return {
    taxonomyId: domainDataset.taxonomy.id,
    taxonomyVersion: domainDataset.taxonomy.version,
    domains: domainDataset.domains.map((domain) => ({
      ...domain,
      taxonomyId: domainDataset.taxonomy.id,
      taxonomyVersion: domainDataset.taxonomy.version,
      provenance: domainDataset.taxonomy.provenance,
      reviewStatus: domainDataset.taxonomy.reviewStatus,
      reviewedAt: domainDataset.taxonomy.reviewedAt,
    })),
    assignments: assignments.sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    authorities: authorityDataset.authorities
      .filter((authority) => selectedAuthorityIds.has(authority.id))
      .sort((left, right) => left.id.localeCompare(right.id)),
    authorityRelationships: authorityRelationships.sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    legalNatures,
  };
}
