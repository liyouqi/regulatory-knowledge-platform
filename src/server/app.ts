import express from "express";
import { toExplorerView } from "../canonical/to-explorer-view";
import { loadDocumentViews } from "../data/document-repository";
import { loadSourceRegistrySync } from "../ingestion/source-registry";
import { FullTextSearchService } from "../search/full-text-search";
import { createLawSearchRecords, searchLaws } from "../search/law-search";
import type { DocumentSummary } from "../shared/legal";

export const app = express();
const documentViews = loadDocumentViews();
const explorerViews = documentViews.map(toExplorerView);
const lawSearchRecords = createLawSearchRecords(
  documentViews,
  loadSourceRegistrySync(),
);
let fullTextSearchService: FullTextSearchService | null = null;
try {
  fullTextSearchService = new FullTextSearchService();
} catch {
  fullTextSearchService = null;
}

function summary(document: (typeof documentViews)[number]): DocumentSummary {
  return {
    id: document.id,
    slug: document.slug,
    shortName: document.shortName,
    officialTitle: document.officialTitle,
    defaultPath: document.provisions[0]?.path ?? `/read/${document.slug}`,
    provenance: document.provenance,
  };
}

export function findDocument(documentId: string) {
  return documentViews.find((document) => document.id === documentId) ?? null;
}

export function findDocumentBySlug(slug: string) {
  return documentViews.find((document) => document.slug === slug) ?? null;
}

export function findExplorerBySlug(slug: string) {
  return explorerViews.find((document) => document.slug === slug) ?? null;
}

export function findLaws(query: string) {
  return searchLaws(lawSearchRecords, query);
}

export function searchFullText(
  query: string,
  options: { documentId?: string; limit?: number } = {},
) {
  return fullTextSearchService?.search(query, options) ?? null;
}

app.get("/api/health", (_request, response) => {
  response.json({
    status: "ok",
    searchIndex: fullTextSearchService
      ? { available: true, buildId: fullTextSearchService.buildId }
      : { available: false },
  });
});

app.get("/api/documents", (_request, response) => {
  response.json({ documents: documentViews.map(summary) });
});

app.get("/api/search/laws", (request, response) => {
  const query = typeof request.query.q === "string" ? request.query.q : "";
  response.json(findLaws(query.slice(0, 200)));
});

app.get("/api/search/full-text", (request, response) => {
  const query = typeof request.query.q === "string" ? request.query.q : "";
  const documentId =
    typeof request.query.documentId === "string"
      ? request.query.documentId.slice(0, 160)
      : undefined;
  const requestedLimit =
    typeof request.query.limit === "string"
      ? Number.parseInt(request.query.limit, 10)
      : undefined;
  const result = searchFullText(query.slice(0, 200), {
    documentId,
    limit: Number.isFinite(requestedLimit) ? requestedLimit : undefined,
  });
  if (!result) {
    response.status(503).json({
      error: "Full-text search index unavailable; run npm run search:build",
    });
    return;
  }
  response.json(result);
});

app.get("/api/documents/by-slug/:slug", (request, response) => {
  const document = findDocumentBySlug(request.params.slug);

  if (!document) {
    response.status(404).json({ error: "Document not found" });
    return;
  }

  response.json(document);
});

app.get("/api/explorer/:slug", (request, response) => {
  const document = findExplorerBySlug(request.params.slug);

  if (!document) {
    response.status(404).json({ error: "Document explorer not found" });
    return;
  }

  response.json(document);
});

app.get("/api/documents/:documentId", (request, response) => {
  const document = findDocument(request.params.documentId);

  if (!document) {
    response.status(404).json({ error: "Document not found" });
    return;
  }

  response.json(document);
});
