import { z } from "zod";
import { provisionRelationshipSchema } from "./legal";

export const applicabilityStatusSchema = z.literal(
  "listed-in-scope-subject-to-qualifications",
);

export const applicabilityEvidenceRoleSchema = z.enum([
  "scope-intro",
  "entity-listing",
  "qualification",
]);

const applicabilityProvisionSchema = z
  .object({
    entityId: z.string().min(1),
    label: z.string().min(1),
    title: z.string().nullable(),
    path: z.string().startsWith("/"),
  })
  .strict();

export const applicabilityEvidenceSchema = z
  .object({
    role: applicabilityEvidenceRoleSchema,
    sourceEntityId: z.string().min(1),
    sourceLabel: z.string().min(1),
    sourcePath: z.string().startsWith("/"),
    evidenceText: z.string().min(1),
    evidenceLocator: z.string().min(1),
    sourceUrl: z.string().url(),
    provenance: z.literal("LEGAL_TEXT"),
  })
  .strict();

export const applicabilityResponseSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    id: z.string().startsWith("applicability-rule:"),
    runtime: z
      .object({
        buildId: z.string().min(1),
        profileId: z.string().min(1),
        profileVersion: z.string().min(1),
        profileDisplayName: z.string().min(1),
        profileHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      })
      .strict(),
    document: z
      .object({
        id: z.string().min(1),
        slug: z.string().regex(/^[a-z0-9-]+$/),
        shortName: z.string().min(1),
        officialTitle: z.string().min(1),
        sourceUrl: z.string().url(),
      })
      .strict(),
    availableEntityTypes: z
      .array(
        z.object({ id: z.string().min(1), label: z.string().min(1) }).strict(),
      )
      .min(1),
    entityType: z
      .object({ id: z.string().min(1), label: z.string().min(1) })
      .strict(),
    result: z
      .object({
        status: applicabilityStatusSchema,
        scopeProvision: applicabilityProvisionSchema,
        evidence: z.array(applicabilityEvidenceSchema).min(3),
        navigation: z.array(
          z
            .object({
              provision: applicabilityProvisionSchema,
              relationships: z.array(provisionRelationshipSchema),
            })
            .strict(),
        ),
      })
      .strict(),
    review: z
      .object({
        reviewStatus: z.literal("reviewed"),
        reviewedAt: z.string().datetime(),
        builderMethod: z.literal("applicability-rule"),
        builderVersion: z.literal("1.0.0"),
      })
      .strict(),
    guardrails: z
      .object({
        finalLegalDetermination: z.literal(false),
        profileControlsVisibilityOnly: z.literal(true),
      })
      .strict(),
  })
  .strict();

export type ApplicabilityStatus = z.infer<typeof applicabilityStatusSchema>;
export type ApplicabilityEvidenceRole = z.infer<
  typeof applicabilityEvidenceRoleSchema
>;
export type ApplicabilityResponse = z.infer<typeof applicabilityResponseSchema>;
