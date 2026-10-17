import {
  type CitationRetrievalResponse,
  citationRetrievalResponseSchema,
} from "../shared/citation-retrieval";
import type { FullTextSearchResponse } from "../shared/legal";
import type { CitationContextService } from "./citation-context-service";

export const CITATION_RETRIEVAL_METHOD = "fts5-to-citation-context";
export const CITATION_RETRIEVAL_VERSION = "1.0.0";

export interface CitationSearchService {
  readonly buildId: string;
  readonly profileId: string;
  readonly profileHash: string;
  search(
    query: string,
    options?: { documentId?: string; limit?: number },
  ): FullTextSearchResponse;
}

export class CitationRetrievalService {
  constructor(
    private readonly searchService: CitationSearchService,
    private readonly contextService: CitationContextService,
  ) {
    const identity = contextService.runtimeIdentity;
    if (
      searchService.buildId !== identity.buildId ||
      searchService.profileId !== identity.profileId ||
      searchService.profileHash !== identity.profileHash
    ) {
      throw new Error(
        "Citation retrieval services have inconsistent identities",
      );
    }
  }

  search(
    rawQuery: string,
    options: { documentId?: string; limit?: number } = {},
  ): CitationRetrievalResponse {
    const rawLimit = options.limit ?? 5;
    const requestedLimit = Number.isFinite(rawLimit)
      ? Math.max(1, Math.min(Math.trunc(rawLimit), 10))
      : 5;
    const searchedRecordLimit = Math.min(requestedLimit * 3, 50);
    const searchResponse = this.searchService.search(rawQuery, {
      documentId: options.documentId,
      limit: searchedRecordLimit,
    });
    const results: CitationRetrievalResponse["results"] = [];
    const resolvedEntityIds = new Set<string>();

    for (const [index, searchResult] of searchResponse.results.entries()) {
      const exact = this.contextService.findByEntityId(searchResult.id);
      const context =
        exact ?? this.contextService.findByEntityId(searchResult.provisionId);
      if (!context) continue;
      if (resolvedEntityIds.has(context.target.entityId)) continue;
      resolvedEntityIds.add(context.target.entityId);
      results.push({
        rank: results.length + 1,
        searchRank: index + 1,
        searchRecordId: searchResult.id,
        resolvedEntityId: context.target.entityId,
        resolution: exact ? "exact-search-entity" : "root-provision-fallback",
        context,
      });
      if (results.length >= requestedLimit) break;
    }

    return citationRetrievalResponseSchema.parse({
      schemaVersion: "1.1.0",
      query: searchResponse.query,
      normalizedQuery: searchResponse.normalizedQuery,
      scopeDocumentId: searchResponse.scopeDocumentId,
      runtime: this.contextService.runtimeIdentity,
      retrieval: {
        method: CITATION_RETRIEVAL_METHOD,
        version: CITATION_RETRIEVAL_VERSION,
        requestedLimit,
        searchedRecordLimit,
        resultCount: results.length,
      },
      results,
    });
  }
}
