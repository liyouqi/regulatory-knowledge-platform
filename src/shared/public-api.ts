import { z } from "zod";
import { lawSearchMatchReasonSchema } from "./legal";
import { sourceLocatorSchema } from "./source-locator";

export const PUBLIC_API_VERSION = "v1";
export const PUBLIC_API_CONTRACT_VERSION = "1.1.0";

const publicRuntimeIdentitySchema = z
  .object({
    buildId: z.string().min(1),
    profileId: z.string().min(1),
    profileVersion: z.string().min(1),
    profileDisplayName: z.string().min(1),
    profileHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict();

export const publicApiMetaSchema = z
  .object({
    apiVersion: z.literal(PUBLIC_API_VERSION),
    contractVersion: z.literal(PUBLIC_API_CONTRACT_VERSION),
    profilePolicy: z.literal("deployment-fixed"),
    runtime: publicRuntimeIdentitySchema,
  })
  .strict();

export const publicApiErrorCodeSchema = z.enum([
  "SERVICE_NOT_CONFIGURED",
  "AUTHENTICATION_REQUIRED",
  "RATE_LIMIT_EXCEEDED",
  "INVALID_REQUEST",
  "PROFILE_NOT_AVAILABLE",
  "LAW_NOT_FOUND",
  "PROVISION_NOT_FOUND",
  "INTERNAL_ERROR",
]);

export const publicApiErrorResponseSchema = z
  .object({
    meta: publicApiMetaSchema,
    error: z
      .object({
        code: publicApiErrorCodeSchema,
        message: z.string().min(1),
        parameter: z.string().min(1).optional(),
      })
      .strict(),
  })
  .strict();

const publicDocumentReferenceSchema = z
  .object({
    id: z.string().min(1),
    jurisdiction: z.enum(["EU", "LU"]),
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
    celex: z.string().min(1).optional(),
    localId: z.string().min(1).optional(),
    sourceUrl: z.string().url(),
    asOf: z.string().date(),
    provenance: z.literal("official"),
  })
  .strict();

const publicLawResultSchema = z
  .object({
    document: publicDocumentReferenceSchema,
    familyId: z.string().startsWith("family:"),
    regulatoryLevel: z.enum(["level-1", "level-2", "level-3"]),
    measureType: z.enum([
      "primary-act",
      "rts",
      "its",
      "guideline",
      "qa",
      "other",
    ]),
    aliases: z.array(z.string().min(1)),
    match: z
      .object({
        reason: lawSearchMatchReasonSchema,
        score: z.number().nonnegative(),
      })
      .strict(),
    target: z
      .object({
        entityId: z.string().min(1),
        kind: z.enum(["article", "recital", "annex", "other"]),
        number: z.string().min(1),
        label: z.string().min(1),
        title: z.string().nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict();

export const publicApiDiscoveryResponseSchema = z
  .object({
    meta: publicApiMetaSchema,
    data: z
      .object({
        name: z.literal("Regulatory Knowledge Platform Public API"),
        status: z.literal("active"),
        capabilities: z.array(
          z
            .object({
              id: z.enum(["resolve-law", "law-structure", "get-provision"]),
              method: z.literal("GET"),
              pathTemplate: z.string().startsWith("/api/v1/"),
            })
            .strict(),
        ),
      })
      .strict(),
  })
  .strict();

export const publicLawResolveResponseSchema = z
  .object({
    meta: publicApiMetaSchema,
    data: z
      .object({
        query: z.string().min(1),
        normalizedQuery: z.string().min(1),
        resultCount: z.number().int().nonnegative(),
        bestMatch: publicLawResultSchema.nullable(),
        results: z.array(publicLawResultSchema).max(10),
      })
      .strict(),
  })
  .strict();

export interface PublicStructureNode {
  id: string;
  kind: string;
  label: string;
  title?: string;
  range?: string;
  provisionId?: string;
  children: PublicStructureNode[];
}

const publicStructureNodeSchema: z.ZodType<PublicStructureNode> = z.lazy(() =>
  z
    .object({
      id: z.string().min(1),
      kind: z.string().min(1),
      label: z.string().min(1),
      title: z.string().min(1).optional(),
      range: z.string().min(1).optional(),
      provisionId: z.string().min(1).optional(),
      children: z.array(publicStructureNodeSchema),
    })
    .strict(),
);

export const publicLawStructureResponseSchema = z
  .object({
    meta: publicApiMetaSchema,
    data: z
      .object({
        document: publicDocumentReferenceSchema.extend({
          sourceSnapshotId: z.string().min(1),
          sourceVersion: z.string().min(1),
          lastChecked: z.string().datetime(),
          canonicalBuildId: z.string().min(1),
        }),
        collections: z.array(
          z
            .object({
              id: z.enum(["articles", "recitals", "annexes", "provisions"]),
              label: z.string().min(1),
              count: z.number().int().nonnegative(),
              roots: z.array(publicStructureNodeSchema),
            })
            .strict(),
        ),
      })
      .strict(),
  })
  .strict();

export interface PublicTextBlock {
  entityId: string;
  kind:
    | "paragraph"
    | "subparagraph"
    | "point"
    | "subpoint"
    | "recital"
    | "annex"
    | "annex-part"
    | "other";
  marker?: string;
  text: string;
  sourceLocator: z.infer<typeof sourceLocatorSchema>;
  children: PublicTextBlock[];
}

const publicTextBlockSchema: z.ZodType<PublicTextBlock> = z.lazy(() =>
  z
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
      sourceLocator: sourceLocatorSchema,
      children: z.array(publicTextBlockSchema),
    })
    .strict(),
);

export const publicProvisionResponseSchema = z
  .object({
    meta: publicApiMetaSchema,
    data: z
      .object({
        document: publicDocumentReferenceSchema,
        provision: z
          .object({
            entityId: z.string().min(1),
            kind: z.enum(["article", "recital", "annex", "other"]),
            collectionId: z.enum([
              "articles",
              "recitals",
              "annexes",
              "provisions",
            ]),
            number: z.string().min(1),
            label: z.string().min(1),
            title: z.string().nullable(),
            breadcrumbs: z.array(
              z
                .object({
                  id: z.string().min(1),
                  kind: z.string().min(1),
                  label: z.string().min(1),
                  title: z.string().min(1).optional(),
                })
                .strict(),
            ),
            previousEntityId: z.string().min(1).nullable(),
            nextEntityId: z.string().min(1).nullable(),
            sourceLocator: sourceLocatorSchema,
            blocks: z.array(publicTextBlockSchema),
          })
          .strict(),
        source: z
          .object({
            officialUrl: z.string().url(),
            sourceSnapshotId: z.string().min(1),
            sourceVersion: z.string().min(1),
            asOf: z.string().date(),
            lastChecked: z.string().datetime(),
            canonicalBuildId: z.string().min(1),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

export type PublicApiErrorResponse = z.infer<
  typeof publicApiErrorResponseSchema
>;
export type PublicApiDiscoveryResponse = z.infer<
  typeof publicApiDiscoveryResponseSchema
>;
export type PublicLawResolveResponse = z.infer<
  typeof publicLawResolveResponseSchema
>;
export type PublicLawStructureResponse = z.infer<
  typeof publicLawStructureResponseSchema
>;
export type PublicProvisionResponse = z.infer<
  typeof publicProvisionResponseSchema
>;
