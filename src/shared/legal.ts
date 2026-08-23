import { z } from "zod";

export const collectionIdSchema = z.enum(["articles", "recitals", "annexes"]);

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
  children: BodyBlock[];
}

export const provisionViewSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["article", "recital", "annex"]),
  collectionId: collectionIdSchema,
  number: z.string().min(1),
  label: z.string().min(1),
  title: z.string().optional(),
  path: z.string().startsWith("/"),
  explorerAnchor: z.string().min(1),
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
  slug: z.string().regex(/^[a-z0-9-]+$/),
  celex: z.string().min(1),
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
  asOf: z.string().date(),
  lastChecked: z.string().datetime(),
  sourceVersion: z.string().min(1),
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
  provenance: z.enum(["official", "fixture"]),
});

export const documentCatalogSchema = z.object({
  documents: z.array(documentSummarySchema),
});

export const lawSearchMatchReasonSchema = z.enum([
  "catalog",
  "exact-celex",
  "exact-alias",
  "exact-citation",
  "exact-title",
  "title-prefix",
  "title-terms",
]);

export const lawSearchTargetSchema = z.object({
  kind: z.enum(["article", "recital", "annex"]),
  number: z.string().min(1),
  label: z.string().min(1),
  title: z.string().optional(),
  path: z.string().startsWith("/"),
});

export const lawSearchResultSchema = z.object({
  id: z.string().min(1),
  familyId: z.string().startsWith("family:"),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  shortName: z.string().min(1),
  officialTitle: z.string().min(1),
  documentType: documentViewSchema.shape.documentType,
  publicationDate: z.string().date(),
  celex: z.string().min(1),
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
  celex: z.string().min(1),
  provisionId: z.string().min(1),
  kind: z.enum(["article", "recital", "annex"]),
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

export const explorerNodeSchema: z.ZodType<ExplorerNode> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    type: z.enum(["group", "article"]),
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
  type: "group" | "article";
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
  slug: z.string().regex(/^[a-z0-9-]+$/),
  celex: z.string().min(1),
  shortName: z.string().min(1),
  officialTitle: z.string().min(1),
  documentType: documentViewSchema.shape.documentType,
  sourceUrl: z.string().url(),
  asOf: z.string().date(),
  lastChecked: z.string().datetime(),
  buildId: z.string().min(1),
  articleCount: z.number().int().nonnegative(),
  recitalCount: z.number().int().nonnegative(),
  annexCount: z.number().int().nonnegative(),
  roots: z.array(explorerNodeSchema),
});

export type CollectionId = z.infer<typeof collectionIdSchema>;
export type ContentCollection = z.infer<typeof contentCollectionSchema>;
export type ProvisionView = z.infer<typeof provisionViewSchema>;
export type DocumentView = z.infer<typeof documentViewSchema>;
export type DocumentSummary = z.infer<typeof documentSummarySchema>;
export type ExplorerDocument = z.infer<typeof explorerDocumentSchema>;
export type LawSearchResult = z.infer<typeof lawSearchResultSchema>;
export type LawSearchResponse = z.infer<typeof lawSearchResponseSchema>;
export type SearchSnippetSegment = z.infer<typeof searchSnippetSegmentSchema>;
export type FullTextSearchResult = z.infer<typeof fullTextSearchResultSchema>;
export type FullTextSearchResponse = z.infer<
  typeof fullTextSearchResponseSchema
>;
