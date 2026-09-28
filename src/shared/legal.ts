import { z } from "zod";
import { sourceLocatorSchema } from "./source-locator";
import { sourceStatusSchema } from "./source-status";

export const collectionIdSchema = z.enum([
  "articles",
  "recitals",
  "annexes",
  "provisions",
]);

export const breadcrumbSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  label: z.string().min(1),
  title: z.string().optional(),
});

export const bodyBlockSchema: z.ZodType<BodyBlock> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
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
    marker: z.string().optional(),
    text: z.string(),
    anchor: z.string().min(1),
    sourceLocator: sourceLocatorSchema,
    orderedContent: z.array(
      z.discriminatedUnion("type", [
        z.object({ type: z.literal("text"), text: z.string().min(1) }),
        z.object({ type: z.literal("child"), childId: z.string().min(1) }),
        z.object({
          type: z.literal("resource"),
          resource: z.object({
            id: z.string().min(1),
            kind: z.literal("formula"),
            mediaType: z.literal("image/png"),
            dataUrl: z.string().startsWith("data:image/png;base64,"),
            sourceFileName: z.string().min(1),
            sourceSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
            renditionSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
          }),
        }),
      ]),
    ),
    children: z.array(bodyBlockSchema),
  }),
);

export interface BodyBlock {
  id: string;
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
  anchor: string;
  sourceLocator: z.infer<typeof sourceLocatorSchema>;
  orderedContent: Array<
    | { type: "text"; text: string }
    | { type: "child"; childId: string }
    | {
        type: "resource";
        resource: {
          id: string;
          kind: "formula";
          mediaType: "image/png";
          dataUrl: string;
          sourceFileName: string;
          sourceSha256: string;
          renditionSha256: string;
        };
      }
  >;
  children: BodyBlock[];
}

export const provisionViewSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["article", "recital", "annex", "other"]),
  collectionId: collectionIdSchema,
  number: z.string().min(1),
  label: z.string().min(1),
  title: z.string().optional(),
  path: z.string().startsWith("/"),
  explorerAnchor: z.string().min(1),
  sourceLocator: sourceLocatorSchema,
  breadcrumbs: z.array(breadcrumbSchema),
  previousId: z.string().optional(),
  nextId: z.string().optional(),
  blocks: z.array(bodyBlockSchema),
});

export const tocNodeSchema: z.ZodType<TocNode> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    type: z.enum(["group", "provision"]),
    kind: z.string().min(1),
    label: z.string().min(1),
    title: z.string().optional(),
    range: z.string().optional(),
    provisionId: z.string().optional(),
    children: z.array(tocNodeSchema),
  }),
);

export interface TocNode {
  id: string;
  type: "group" | "provision";
  kind: string;
  label: string;
  title?: string;
  range?: string;
  provisionId?: string;
  children: TocNode[];
}

export const contentCollectionSchema = z.object({
  id: collectionIdSchema,
  label: z.string().min(1),
  count: z.number().int().nonnegative(),
  roots: z.array(tocNodeSchema),
});

export const documentViewSchema = z.object({
  id: z.string().min(1),
  jurisdiction: z.enum(["EU", "LU"]),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  celex: z.string().min(1).optional(),
  localId: z.string().min(1).optional(),
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
  sourceSnapshotId: z.string().min(1),
  asOf: z.string().date(),
  lastChecked: z.string().datetime(),
  sourceVersion: z.string().min(1),
  sourceStatus: sourceStatusSchema.optional(),
  buildId: z.string().min(1),
  provenance: z.enum(["official", "fixture"]),
  collections: z.array(contentCollectionSchema).min(1),
  provisions: z.array(provisionViewSchema),
});

export const documentSummarySchema = z.object({
  id: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  shortName: z.string().min(1),
  officialTitle: z.string().min(1),
  defaultPath: z.string().startsWith("/"),
  hasImplementationTimeline: z.boolean(),
  hasSupervisoryDecisions: z.boolean(),
  hasApplicabilityRules: z.boolean(),
  hasTopicAssignments: z.boolean(),
  provenance: z.enum(["official", "fixture"]),
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
});

export const documentCatalogSchema = z.object({
  documents: z.array(documentSummarySchema),
});

export const level2MeasureTypeSchema = z.enum([
  "rts",
  "its",
  "guideline",
  "qa",
  "other",
]);

export const level2MandateSchema = z.object({
  articleEntityId: z.string().min(1),
  documentId: z.string().min(1),
  documentShortName: z.string().min(1),
  label: z.string().min(1),
  title: z.string().nullable(),
  path: z.string().startsWith("/"),
});

export const level2MeasureSchema = z.object({
  id: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  shortName: z.string().min(1),
  officialTitle: z.string().min(1),
  celex: z.string().min(1),
  measureType: level2MeasureTypeSchema,
  publicationDate: z.string().date(),
  sourceUrl: z.string().url(),
  sourceStatus: sourceStatusSchema.optional(),
  explorerPath: z.string().startsWith("/"),
  readerPath: z.string().startsWith("/"),
  mandates: z.array(level2MandateSchema),
});

export const familyLevel2ResponseSchema = z.object({
  familyId: z.string().startsWith("family:"),
  familyShortName: z.string().min(1),
  counts: z.object({
    rts: z.number().int().nonnegative(),
    its: z.number().int().nonnegative(),
    guidelines: z.number().int().nonnegative(),
  }),
  measures: z.array(level2MeasureSchema),
});

export const lawSearchMatchReasonSchema = z.enum([
  "catalog",
  "exact-celex",
  "exact-local-id",
  "exact-alias",
  "typo-alias",
  "exact-citation",
  "exact-title",
  "title-prefix",
  "title-terms",
  "law-anchor",
]);

export const lawSearchTargetSchema = z.object({
  kind: z.enum(["article", "recital", "annex", "other"]),
  number: z.string().min(1),
  label: z.string().min(1),
  title: z.string().optional(),
  path: z.string().startsWith("/"),
});

export const lawSearchResultSchema = z.object({
  id: z.string().min(1),
  familyId: z.string().startsWith("family:"),
  regulatoryLevel: documentSummarySchema.shape.regulatoryLevel,
  measureType: documentSummarySchema.shape.measureType,
  slug: z.string().regex(/^[a-z0-9-]+$/),
  shortName: z.string().min(1),
  officialTitle: z.string().min(1),
  documentType: documentViewSchema.shape.documentType,
  publicationDate: z.string().date(),
  celex: z.string().min(1).optional(),
  localId: z.string().min(1).optional(),
  aliases: z.array(z.string().min(1)),
  readerPath: z.string().startsWith("/"),
  explorerPath: z.string().startsWith("/"),
  provenance: z.enum(["official", "fixture"]),
  matchReason: lawSearchMatchReasonSchema,
  score: z.number().nonnegative(),
  target: lawSearchTargetSchema.optional(),
});

export const lawSearchResponseSchema = z.object({
  query: z.string(),
  normalizedQuery: z.string(),
  bestMatch: lawSearchResultSchema.optional(),
  results: z.array(lawSearchResultSchema),
});

export const searchSnippetSegmentSchema = z.object({
  text: z.string(),
  highlighted: z.boolean(),
});

export const fullTextSearchResultSchema = z.object({
  id: z.string().min(1),
  documentId: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  shortName: z.string().min(1),
  celex: z.string().min(1).optional(),
  localId: z.string().min(1).optional(),
  provisionId: z.string().min(1),
  kind: z.enum(["article", "recital", "annex", "other"]),
  label: z.string().min(1),
  title: z.string().optional(),
  marker: z.string().optional(),
  path: z.string().startsWith("/"),
  snippet: z.array(searchSnippetSegmentSchema).min(1),
});

export const fullTextSearchResponseSchema = z.object({
  query: z.string(),
  normalizedQuery: z.string(),
  scopeDocumentId: z.string().optional(),
  indexBuildId: z.string().min(1),
  results: z.array(fullTextSearchResultSchema),
});

export const definitionSearchResultSchema = z.object({
  id: z.string().min(1),
  documentId: z.string().min(1),
  jurisdiction: z.enum(["EU", "LU"]),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  shortName: z.string().min(1),
  celex: z.string().min(1).optional(),
  localId: z.string().min(1).optional(),
  term: z.string().min(1),
  normalizedTerm: z.string().min(1),
  definitionText: z.string().min(1),
  definitionType: z.enum(["direct", "incorporated"]),
  sourceUrl: z.string().url(),
  provisionId: z.string().min(1),
  label: z.string().min(1),
  title: z.string().optional(),
  marker: z.string().optional(),
  path: z.string().startsWith("/"),
});

export const definitionSearchResponseSchema = z.object({
  query: z.string(),
  normalizedQuery: z.string(),
  indexBuildId: z.string().min(1),
  results: z.array(definitionSearchResultSchema),
});

export const documentDefinitionsResponseSchema = z.object({
  documentId: z.string().min(1),
  indexBuildId: z.string().min(1),
  definitions: z.array(definitionSearchResultSchema),
});

export const explorerNodeSchema: z.ZodType<ExplorerNode> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    type: z.enum(["group", "article", "provision"]),
    kind: z.string().min(1),
    label: z.string().min(1),
    title: z.string().optional(),
    range: z.string().optional(),
    anchor: z.string().min(1),
    readerPath: z.string().startsWith("/").optional(),
    children: z.array(explorerNodeSchema),
  }),
);

export interface ExplorerNode {
  id: string;
  type: "group" | "article" | "provision";
  kind: string;
  label: string;
  title?: string;
  range?: string;
  anchor: string;
  readerPath?: string;
  children: ExplorerNode[];
}

export const explorerDocumentSchema = z.object({
  id: z.string().min(1),
  jurisdiction: z.enum(["EU", "LU"]),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  celex: z.string().min(1).optional(),
  localId: z.string().min(1).optional(),
  shortName: z.string().min(1),
  officialTitle: z.string().min(1),
  documentType: documentViewSchema.shape.documentType,
  sourceUrl: z.string().url(),
  asOf: z.string().date(),
  lastChecked: z.string().datetime(),
  sourceStatus: sourceStatusSchema.optional(),
  buildId: z.string().min(1),
  articleCount: z.number().int().nonnegative(),
  recitalCount: z.number().int().nonnegative(),
  annexCount: z.number().int().nonnegative(),
  provisionCount: z.number().int().nonnegative(),
  roots: z.array(explorerNodeSchema),
});

export const relationshipProvenanceSchema = z.enum([
  "LEGAL_TEXT",
  "OFFICIAL_METADATA",
  "OFFICIAL_MAPPING",
  "CASE_TEXT",
  "EDITORIAL",
  "TFIDF",
]);

export const relationshipEndpointSchema = z.object({
  entityId: z.string().min(1),
  documentId: z.string().min(1),
  documentShortName: z.string().min(1),
  provisionId: z.string().min(1).optional(),
  kind: z.string().min(1),
  label: z.string().min(1),
  title: z.string().nullable(),
  path: z.string().startsWith("/"),
});

export const provisionRelationshipSchema = z.object({
  id: z.string().startsWith("relationship:"),
  relationType: z.enum([
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
  ]),
  provenance: relationshipProvenanceSchema,
  source: relationshipEndpointSchema,
  target: relationshipEndpointSchema,
  evidence: z.object({
    text: z.string().min(1),
    locator: z.string().min(1),
    sourceUrl: z.string().url(),
  }),
  builder: z.object({
    method: z.string().min(1),
    version: z.string().min(1),
  }),
  score: z.number().nonnegative().optional(),
  resolutionStatus: z.literal("resolved"),
});

export const provisionRelationshipsResponseSchema = z.object({
  documentId: z.string().min(1),
  provisionId: z.string().min(1),
  buildId: z.string().min(1),
  references: z.array(provisionRelationshipSchema),
  citedBy: z.array(provisionRelationshipSchema),
  mandates: z.array(provisionRelationshipSchema),
  adoptedUnder: z.array(provisionRelationshipSchema),
  supplements: z.array(provisionRelationshipSchema),
  implements: z.array(provisionRelationshipSchema),
  relatedDocuments: z.array(provisionRelationshipSchema),
  relatedRecitals: z.array(provisionRelationshipSchema),
});

// A narrow internal-query DTO. It intentionally exposes only reviewed
// Article -> Level 2 mandate edges; it is not a natural-language interface.
export const level2MandateQueryResponseSchema = z.object({
  documentId: z.string().min(1),
  provisionId: z.string().min(1),
  buildId: z.string().min(1),
  relationships: z.array(provisionRelationshipSchema),
});

export const documentRelationshipsResponseSchema = z.object({
  documentId: z.string().min(1),
  buildId: z.string().min(1),
  relationships: z.array(provisionRelationshipSchema),
});

export const relationshipPreviewSchema = z.object({
  entityId: z.string().min(1),
  documentId: z.string().min(1),
  documentShortName: z.string().min(1),
  label: z.string().min(1),
  title: z.string().nullable(),
  path: z.string().startsWith("/"),
  sourceUrl: z.string().url(),
  excerpt: z.string().min(1).optional(),
});

export type CollectionId = z.infer<typeof collectionIdSchema>;
export type ContentCollection = z.infer<typeof contentCollectionSchema>;
export type ProvisionView = z.infer<typeof provisionViewSchema>;
export type DocumentView = z.infer<typeof documentViewSchema>;
export type DocumentSummary = z.infer<typeof documentSummarySchema>;
export type Level2Measure = z.infer<typeof level2MeasureSchema>;
export type FamilyLevel2Response = z.infer<typeof familyLevel2ResponseSchema>;
export type ExplorerDocument = z.infer<typeof explorerDocumentSchema>;
export type LawSearchResult = z.infer<typeof lawSearchResultSchema>;
export type LawSearchResponse = z.infer<typeof lawSearchResponseSchema>;
export type SearchSnippetSegment = z.infer<typeof searchSnippetSegmentSchema>;
export type FullTextSearchResult = z.infer<typeof fullTextSearchResultSchema>;
export type FullTextSearchResponse = z.infer<
  typeof fullTextSearchResponseSchema
>;
export type DefinitionSearchResult = z.infer<
  typeof definitionSearchResultSchema
>;
export type DefinitionSearchResponse = z.infer<
  typeof definitionSearchResponseSchema
>;
export type DocumentDefinitionsResponse = z.infer<
  typeof documentDefinitionsResponseSchema
>;
export type RelationshipEndpoint = z.infer<typeof relationshipEndpointSchema>;
export type ProvisionRelationship = z.infer<typeof provisionRelationshipSchema>;
export type ProvisionRelationshipsResponse = z.infer<
  typeof provisionRelationshipsResponseSchema
>;
export type Level2MandateQueryResponse = z.infer<
  typeof level2MandateQueryResponseSchema
>;
export type DocumentRelationshipsResponse = z.infer<
  typeof documentRelationshipsResponseSchema
>;
export type RelationshipPreview = z.infer<typeof relationshipPreviewSchema>;
