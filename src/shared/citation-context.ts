import { z } from "zod";
import { contentRoleSchema } from "./content-unit";
import { provisionRelationshipsResponseSchema } from "./legal";
import { documentRegulatoryContextSchema } from "./regulatory-context";
import { sourceLocatorSchema } from "./source-locator";
import { sourceStatusSchema } from "./source-status";

export const citationTextSegmentSchema = z
  .object({
    entityId: z.string().min(1),
    // Original BodyBlock.orderedContent index, scoped to this source/runtime;
    // the pair (entityId, contentIndex) is a run locator, not a new stable ID.
    contentIndex: z.number().int().nonnegative(),
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
    contentRole: contentRoleSchema.optional(),
    marker: z.string().min(1).optional(),
    text: z.string(),
    anchor: z.string().min(1),
    sourceLocator: sourceLocatorSchema,
  })
  .strict();

export const citationContextSchema = z
  .object({
    schemaVersion: z.literal("1.1.0"),
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
        version: z.literal("1.1.0"),
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
        jurisdiction: z.enum(["EU", "LU", "DE", "FR"]),
        language: z.enum(["en", "de", "fr"]).optional(),
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
        contentRole: contentRoleSchema.optional(),
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
    textSegments: z.array(citationTextSegmentSchema),
    textProjection: z
      .object({
        scope: z.literal("text-only"),
        order: z.literal("reader-ordered-content"),
        markerInsertion: z.literal("none"),
        omittedResourceCount: z.number().int().nonnegative(),
      })
      .strict(),
    relationships: provisionRelationshipsResponseSchema,
    regulatoryContext: documentRegulatoryContextSchema,
  })
  .strict();

export type CitationContext = z.infer<typeof citationContextSchema>;
export type CitationTextSegment = z.infer<typeof citationTextSegmentSchema>;
