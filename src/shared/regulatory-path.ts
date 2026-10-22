import { z } from "zod";
import { provisionRelationshipSchema } from "./legal";
import {
  authorityRelationshipSchema,
  domainAssignmentSchema,
  legalNatureSchema,
  regulatoryDomainSchema,
} from "./regulatory-context";

export const regulatoryPathDocumentSchema = z
  .object({
    id: z.string().min(1),
    jurisdiction: z.enum(["EU", "LU", "DE", "FR"]),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    shortName: z.string().min(1),
    officialTitle: z.string().min(1),
    documentType: z.enum([
      "regulation",
      "directive",
      "law",
      "circular",
      "guidance",
      "other",
    ]),
    sourceUrl: z.string().url(),
    defaultPath: z.string().startsWith("/"),
    regulatoryLevel: z.enum(["level-1", "level-2", "level-3"]),
    measureType: z.enum([
      "primary-act",
      "rts",
      "its",
      "guideline",
      "qa",
      "other",
    ]),
    assignments: z.array(domainAssignmentSchema).min(1),
    authorityRelationships: z.array(authorityRelationshipSchema),
    legalNature: legalNatureSchema.nullable(),
  })
  .strict();

export const regulatoryPathResponseSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    id: z.string().startsWith("regulatory-path:"),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    domain: regulatoryDomainSchema,
    ancestors: z.array(regulatoryDomainSchema),
    runtime: z
      .object({
        buildId: z.string().min(1),
        profileId: z.string().min(1),
        profileVersion: z.string().min(1),
        profileDisplayName: z.string().min(1),
        profileHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      })
      .strict(),
    scope: z
      .object({
        classificationProvenance: z.literal("EDITORIAL"),
        relationshipProvenance: z.literal("OFFICIAL_MAPPING"),
        applicabilityConclusion: z.literal(false),
      })
      .strict(),
    documents: z.array(regulatoryPathDocumentSchema).min(1),
    relationships: z.array(provisionRelationshipSchema).min(1),
  })
  .strict();

export type RegulatoryPathResponse = z.infer<
  typeof regulatoryPathResponseSchema
>;
