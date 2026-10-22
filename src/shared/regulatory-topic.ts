import { z } from "zod";
import { provisionRelationshipSchema } from "./legal";

export const regulatoryTopicSchema = z
  .object({
    id: z.string().startsWith("topic:"),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    label: z.string().min(1),
    description: z.string().min(1),
    taxonomyId: z.literal("taxonomy:regulatory-topic"),
    taxonomyVersion: z.string().min(1),
    provenance: z.literal("EDITORIAL"),
    reviewStatus: z.literal("reviewed"),
    reviewedAt: z.string().datetime(),
  })
  .strict();

export const topicAssignmentSchema = z
  .object({
    id: z.string().startsWith("topic-assignment:"),
    topicId: z.string().startsWith("topic:"),
    targetDocumentId: z.string().min(1),
    targetEntityId: z.string().min(1),
    targetKind: z.enum(["document", "provision"]),
    targetLabel: z.string().min(1),
    targetTitle: z.string().nullable(),
    targetPath: z.string().startsWith("/"),
    role: z.enum(["primary", "supporting"]),
    provenance: z.literal("EDITORIAL"),
    assignmentVersion: z.string().min(1),
    reviewStatus: z.literal("reviewed"),
    reviewedAt: z.string().datetime(),
    rationale: z.string().min(1),
    reviewNote: z.string().min(1),
    evidenceLocator: z.string().min(1),
  })
  .strict();

const topicDocumentSchema = z
  .object({
    id: z.string().min(1),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    shortName: z.string().min(1),
    officialTitle: z.string().min(1),
    jurisdiction: z.enum(["EU", "LU", "DE", "FR"]),
    documentType: z.enum([
      "regulation",
      "directive",
      "law",
      "circular",
      "guidance",
      "other",
    ]),
    regulatoryLevel: z.enum(["level-1", "level-2", "level-3"]),
    measureType: z.enum([
      "primary-act",
      "rts",
      "its",
      "guideline",
      "qa",
      "other",
    ]),
    defaultPath: z.string().startsWith("/"),
    assignments: z.array(topicAssignmentSchema).min(1),
  })
  .strict();

const runtimeIdentitySchema = z
  .object({
    buildId: z.string().min(1),
    profileId: z.string().min(1),
    profileVersion: z.string().min(1),
    profileDisplayName: z.string().min(1),
    profileHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict();

export const topicCatalogResponseSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    runtime: runtimeIdentitySchema,
    taxonomy: z
      .object({
        id: z.literal("taxonomy:regulatory-topic"),
        version: z.string().min(1),
        provenance: z.literal("EDITORIAL"),
        reviewStatus: z.literal("reviewed"),
        reviewedAt: z.string().datetime(),
      })
      .strict(),
    topics: z.array(
      regulatoryTopicSchema.extend({
        documentCount: z.number().int().positive(),
        provisionCount: z.number().int().nonnegative(),
        path: z.string().startsWith("/topics/"),
      }),
    ),
  })
  .strict();

export const regulatoryTopicResponseSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    runtime: runtimeIdentitySchema,
    topic: regulatoryTopicSchema,
    scope: z
      .object({
        classificationProvenance: z.literal("EDITORIAL"),
        applicabilityConclusion: z.literal(false),
      })
      .strict(),
    documents: z.array(topicDocumentSchema).min(2),
    relationships: z.array(provisionRelationshipSchema),
  })
  .strict();

export type RegulatoryTopic = z.infer<typeof regulatoryTopicSchema>;
export type TopicAssignment = z.infer<typeof topicAssignmentSchema>;
export type TopicCatalogResponse = z.infer<typeof topicCatalogResponseSchema>;
export type RegulatoryTopicResponse = z.infer<
  typeof regulatoryTopicResponseSchema
>;
