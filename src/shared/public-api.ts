import { z } from "zod";
import {
  type ContentLayout,
  type ContentRole,
  contentLayoutSchema,
  contentRoleSchema,
} from "./content-unit";
import {
  lawSearchMatchReasonSchema,
  scopedSourceNoteViewSchema,
} from "./legal";
import { sourceLocatorSchema } from "./source-locator";
import { sourceStatusSchema } from "./source-status";

export const PUBLIC_API_VERSION = "v1";
export const PUBLIC_API_CONTRACT_VERSION = "1.5.0";

export const publicJurisdictionSchema = z.enum(["EU", "LU", "DE", "FR"]);
export const publicDocumentTypeSchema = z.enum([
  "regulation",
  "directive",
  "law",
  "circular",
  "guidance",
  "other",
]);
export const publicRegulatoryLevelSchema = z.enum([
  "level-1",
  "level-2",
  "level-3",
]);
export const publicMeasureTypeSchema = z.enum([
  "primary-act",
  "rts",
  "its",
  "guideline",
  "qa",
  "other",
]);

export const publicLawResolveFiltersSchema = z
  .object({
    jurisdiction: publicJurisdictionSchema.optional(),
    documentType: publicDocumentTypeSchema.optional(),
    regulatoryLevel: publicRegulatoryLevelSchema.optional(),
    measureType: publicMeasureTypeSchema.optional(),
  })
  .strict();

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

const publicDocumentReferenceBaseSchema = z
  .object({
    id: z.string().min(1),
    jurisdiction: publicJurisdictionSchema,
    slug: z.string().regex(/^[a-z0-9-]+$/),
    shortName: z.string().min(1),
    officialTitle: z.string().min(1),
    documentType: publicDocumentTypeSchema,
    language: z.enum(["en", "de", "fr"]).optional(),
    celex: z.string().min(1).optional(),
    localId: z.string().min(1).optional(),
    sourceUrl: z.string().url(),
    sourceStatus: sourceStatusSchema.optional(),
    asOf: z.string().date(),
    publicationDate: z.string().date().nullable().optional(),
    publicationDateBasis: z
      .literal("aggregate-with-multiple-component-publications")
      .optional(),
    provenance: z.literal("official"),
  })
  .strict();

const frPublicationDate = (document: {
  jurisdiction: string;
  publicationDate?: string | null;
  publicationDateBasis?: string;
}) =>
  document.jurisdiction === "FR"
    ? document.publicationDate === null &&
      document.publicationDateBasis ===
        "aggregate-with-multiple-component-publications"
    : document.publicationDate !== null &&
      document.publicationDateBasis === undefined;
export const publicDocumentReferenceSchema =
  publicDocumentReferenceBaseSchema.refine(frPublicationDate, {
    message:
      "FR requires a null publication date and aggregate basis; other jurisdictions require a non-null date when present",
  });

const publicLawResultSchema = z
  .object({
    document: publicDocumentReferenceSchema,
    familyId: z.string().startsWith("family:"),
    regulatoryLevel: publicRegulatoryLevelSchema,
    measureType: publicMeasureTypeSchema,
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
              id: z.enum([
                "resolve-law",
                "law-structure",
                "get-provision",
                "get-relationships",
              ]),
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
        filters: publicLawResolveFiltersSchema,
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
        document: publicDocumentReferenceBaseSchema
          .extend({
            sourceSnapshotId: z.string().min(1),
            sourceVersion: z.string().min(1),
            lastChecked: z.string().datetime(),
            canonicalBuildId: z.string().min(1),
          })
          .refine(frPublicationDate, {
            message:
              "FR requires a null publication date and aggregate basis; other jurisdictions require a non-null date when present",
          }),
        scopedSourceNotes: z.array(scopedSourceNoteViewSchema).optional(),
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
  contentRole?: ContentRole;
  sourceNotes?: Array<{
    contentRole: "source-note";
    contentIndex: number;
    text: string;
    sourceLocator: z.infer<typeof sourceLocatorSchema>;
  }>;
  text: string;
  contentLayout?: ContentLayout[];
  orderedContent?: Array<{
    type: "text";
    text: string;
    contentRole?: ContentRole;
    sourceLocator?: z.infer<typeof sourceLocatorSchema>;
  }>;
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
      contentRole: contentRoleSchema.optional(),
      sourceNotes: z
        .array(
          z
            .object({
              contentRole: z.literal("source-note"),
              contentIndex: z.number().int().nonnegative(),
              text: z.string(),
              sourceLocator: sourceLocatorSchema,
            })
            .strict(),
        )
        .optional(),
      text: z.string(),
      contentLayout: z.array(contentLayoutSchema).optional(),
      orderedContent: z
        .array(
          z.object({
            type: z.literal("text"),
            text: z.string().min(1),
            contentRole: contentRoleSchema.optional(),
            sourceLocator: sourceLocatorSchema.optional(),
          }),
        )
        .optional(),
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
            contentRole: contentRoleSchema.optional(),
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
            officialSourceUrl: z.string().url().optional(),
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

const publicRelationshipEndpointSchema = z
  .object({
    entityId: z.string().min(1),
    documentId: z.string().min(1),
    documentShortName: z.string().min(1),
    provisionId: z.string().min(1).optional(),
    kind: z.string().min(1),
    label: z.string().min(1),
    title: z.string().nullable(),
    officialUrl: z.string().url(),
  })
  .strict();

export const publicRelationshipTypeSchema = z.enum([
  "REFERENCES",
  "CITED_BY",
  "MANDATES",
  "ADOPTED_UNDER",
  "AMENDS",
  "CORRECTS",
  "SUPPLEMENTS",
  "IMPLEMENTS",
  "RELATED_DOCUMENT",
  "RELATED_RECITAL",
]);

export const publicRelationshipProvenanceSchema = z.enum([
  "LEGAL_TEXT",
  "OFFICIAL_METADATA",
  "OFFICIAL_MAPPING",
  "CASE_TEXT",
  "EDITORIAL",
  "TFIDF",
]);

const publicProvisionRelationshipSchema = z
  .object({
    id: z.string().startsWith("relationship:"),
    relationType: publicRelationshipTypeSchema,
    provenance: publicRelationshipProvenanceSchema,
    source: publicRelationshipEndpointSchema,
    target: publicRelationshipEndpointSchema,
    evidence: z
      .object({
        text: z.string().min(1),
        locator: z.string().min(1),
        sourceUrl: z.string().url(),
      })
      .strict(),
    builder: z
      .object({
        method: z.string().min(1),
        version: z.string().min(1),
      })
      .strict(),
    score: z.number().nonnegative().optional(),
    resolutionStatus: z.literal("resolved"),
  })
  .strict();

const publicRelationshipGroupsSchema = z
  .object({
    references: z.array(publicProvisionRelationshipSchema),
    citedBy: z.array(publicProvisionRelationshipSchema),
    mandates: z.array(publicProvisionRelationshipSchema),
    adoptedUnder: z.array(publicProvisionRelationshipSchema),
    supplements: z.array(publicProvisionRelationshipSchema),
    implements: z.array(publicProvisionRelationshipSchema),
    relatedDocuments: z.array(publicProvisionRelationshipSchema),
    relatedRecitals: z.array(publicProvisionRelationshipSchema),
  })
  .strict();

export const publicProvisionRelationshipsResponseSchema = z
  .object({
    meta: publicApiMetaSchema,
    data: z
      .object({
        provision: z
          .object({
            entityId: z.string().min(1),
            documentId: z.string().min(1),
            documentShortName: z.string().min(1),
            kind: z.string().min(1),
            contentRole: contentRoleSchema.optional(),
            label: z.string().min(1),
            title: z.string().nullable(),
          })
          .strict(),
        relationshipCount: z.number().int().nonnegative(),
        groups: publicRelationshipGroupsSchema,
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
export type PublicLawResolveFilters = z.infer<
  typeof publicLawResolveFiltersSchema
>;
export type PublicLawStructureResponse = z.infer<
  typeof publicLawStructureResponseSchema
>;
export type PublicProvisionResponse = z.infer<
  typeof publicProvisionResponseSchema
>;
export type PublicProvisionRelationshipsResponse = z.infer<
  typeof publicProvisionRelationshipsResponseSchema
>;
