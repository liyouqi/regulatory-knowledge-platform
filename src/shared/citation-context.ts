import { z } from "zod";
import { provisionRelationshipsResponseSchema } from "./legal";
import { documentRegulatoryContextSchema } from "./regulatory-context";
import { sourceLocatorSchema } from "./source-locator";
import { sourceStatusSchema } from "./source-status";

export const citationTextSegmentSchema = z
  .object({
    entityId: z.string().min(1),
    kind: z.enum([
      "paragraph",
      "subparagraph",
      "point",
      "subpoint",
      "recital",
      "annex",
      "annex-part",
      "other",
    ]),
    marker: z.string().min(1).optional(),
    text: z.string(),
    anchor: z.string().min(1),
    sourceLocator: sourceLocatorSchema,
  })
  .strict();

export const citationContextSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    runtime: z
      .object({
        buildId: z.string().min(1),
        profileId: z.string().min(1),
        profileVersion: z.string().min(1),
        profileHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      })
      .strict(),
    retrieval: z
      .object({
        method: z.literal("stable-entity-id"),
        version: z.literal("1.0.0"),
        requestedEntityId: z.string().min(1),
        resolvedEntityId: z.string().min(1),
        matchType: z.literal("exact"),
        rank: z.literal(1),
        score: z.literal(1),
        relationshipScope: z.literal("root-provision"),
      })
      .strict(),
    document: z
      .object({
        id: z.string().min(1),
        jurisdiction: z.enum(["EU", "LU"]),
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
        celex: z.string().min(1).optional(),
        localId: z.string().min(1).optional(),
        sourceUrl: z.string().url(),
        sourceSnapshotId: z.string().min(1),
        sourceVersion: z.string().min(1),
        asOf: z.string().date(),
        lastChecked: z.string().datetime(),
        canonicalBuildId: z.string().min(1),
        sourceStatus: sourceStatusSchema.optional(),
      })
      .strict(),
    target: z
      .object({
        entityId: z.string().min(1),
        rootProvisionId: z.string().min(1),
        kind: z.string().min(1),
        label: z.string().min(1),
        title: z.string().nullable(),
        path: z.string().startsWith("/"),
        sourceLocator: sourceLocatorSchema,
        provision: z
          .object({
            id: z.string().min(1),
            collectionId: z.enum([
              "articles",
              "recitals",
              "annexes",
              "provisions",
            ]),
            number: z.string().min(1),
            label: z.string().min(1),
            title: z.string().nullable(),
            path: z.string().startsWith("/"),
          })
          .strict(),
      })
      .strict(),
    textSegments: z.array(citationTextSegmentSchema).min(1),
    relationships: provisionRelationshipsResponseSchema,
    regulatoryContext: documentRegulatoryContextSchema,
  })
  .strict();

export type CitationContext = z.infer<typeof citationContextSchema>;
