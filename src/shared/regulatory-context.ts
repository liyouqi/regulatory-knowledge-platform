import { z } from "zod";

export const regulatoryDomainSchema = z
  .object({
    id: z.string().startsWith("domain:"),
    parentId: z.string().startsWith("domain:").nullable(),
    label: z.string().min(1),
    description: z.string().min(1),
    taxonomyId: z.string().startsWith("taxonomy:"),
    taxonomyVersion: z.string().min(1),
    provenance: z.literal("EDITORIAL"),
    reviewStatus: z.literal("reviewed"),
    reviewedAt: z.string().datetime(),
  })
  .strict();

export const domainAssignmentSchema = z
  .object({
    id: z.string().startsWith("domain-assignment:"),
    domain: regulatoryDomainSchema,
    targetDocumentId: z.string().min(1),
    targetEntityId: z.string().min(1),
    targetKind: z.enum(["document", "provision"]),
    targetLabel: z.string().min(1),
    targetPath: z.string().startsWith("/"),
    role: z.enum(["contains", "primary"]),
    provenance: z.literal("EDITORIAL"),
    assignmentVersion: z.string().min(1),
    reviewStatus: z.literal("reviewed"),
    reviewedAt: z.string().datetime(),
    rationale: z.string().min(1),
    reviewNote: z.string().min(1),
    evidenceLocator: z.string().min(1),
  })
  .strict();

export const authoritySchema = z
  .object({
    id: z.string().startsWith("authority:"),
    officialName: z.string().min(1),
    acronym: z.string().min(1).nullable(),
    authorityType: z.enum(["legislative-institution", "supervisory-authority"]),
    jurisdiction: z.string().min(1),
    sourceUrl: z.string().url(),
    checkedAt: z.string().datetime(),
  })
  .strict();

export const authorityRelationshipSchema = z
  .object({
    id: z.string().startsWith("authority-relationship:"),
    sourceDocumentId: z.string().min(1),
    relationType: z.literal("ISSUED_BY"),
    target: authoritySchema,
    provenance: z.literal("OFFICIAL_METADATA"),
    evidenceText: z.string().min(1),
    evidenceLocator: z.string().min(1),
    sourceRef: z.string().url(),
    builder: z
      .object({ method: z.string().min(1), version: z.string().min(1) })
      .strict(),
    reviewStatus: z.literal("reviewed"),
    reviewedAt: z.string().datetime(),
  })
  .strict();

export const legalNatureSchema = z
  .object({
    documentId: z.string().min(1),
    instrumentType: z.literal("guideline"),
    complianceExpectation: z.literal("make-every-effort-to-comply"),
    currentStatus: z.literal("in-force"),
    underReview: z.boolean(),
    applicationDate: z.string().date(),
    statusCheckedAt: z.string().datetime(),
    legalBasisEvidenceText: z.string().min(1),
    legalBasisEvidenceEntityId: z.string().min(1),
    legalBasisSourceUrl: z.string().url(),
    applicationEvidenceText: z.string().min(1),
    applicationEvidenceEntityId: z.string().min(1),
    applicationSourceUrl: z.string().url(),
    statusSourceUrl: z.string().url(),
    provenance: z.literal("OFFICIAL_METADATA"),
    reviewStatus: z.literal("reviewed"),
    reviewedAt: z.string().datetime(),
  })
  .strict();

export const documentRegulatoryContextSchema = z
  .object({
    documentId: z.string().min(1),
    provisionId: z.string().min(1).optional(),
    buildId: z.string().min(1),
    profileId: z.string().min(1),
    taxonomyId: z.string().startsWith("taxonomy:"),
    taxonomyVersion: z.string().min(1),
    domainAssignments: z.array(domainAssignmentSchema),
    authorityRelationships: z.array(authorityRelationshipSchema),
    legalNature: legalNatureSchema.nullable(),
  })
  .strict();

export type RegulatoryDomain = z.infer<typeof regulatoryDomainSchema>;
export type DomainAssignment = z.infer<typeof domainAssignmentSchema>;
export type Authority = z.infer<typeof authoritySchema>;
export type AuthorityRelationship = z.infer<typeof authorityRelationshipSchema>;
export type LegalNature = z.infer<typeof legalNatureSchema>;
export type DocumentRegulatoryContext = z.infer<
  typeof documentRegulatoryContextSchema
>;
