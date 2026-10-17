import { z } from "zod";
import { citationContextSchema } from "./citation-context";

export const citationRetrievalResultSchema = z
  .object({
    rank: z.number().int().positive(),
    searchRank: z.number().int().positive(),
    searchRecordId: z.string().min(1),
    resolvedEntityId: z.string().min(1),
    resolution: z.enum(["exact-search-entity", "root-provision-fallback"]),
    context: citationContextSchema,
  })
  .strict();

export const citationRetrievalResponseSchema = z
  .object({
    schemaVersion: z.literal("1.1.0"),
    query: z.string(),
    normalizedQuery: z.string(),
    scopeDocumentId: z.string().min(1).optional(),
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
        method: z.literal("fts5-to-citation-context"),
        version: z.literal("1.0.0"),
        requestedLimit: z.number().int().min(1).max(10),
        searchedRecordLimit: z.number().int().min(1).max(50),
        resultCount: z.number().int().nonnegative(),
      })
      .strict(),
    results: z.array(citationRetrievalResultSchema).max(10),
  })
  .strict();

export type CitationRetrievalResponse = z.infer<
  typeof citationRetrievalResponseSchema
>;
