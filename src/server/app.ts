import express from "express";
import { SqliteRuntimeRepository } from "../runtime/sqlite-runtime-repository";
import { SearchService } from "../search/full-text-search";
import { createLawSearchRecords, searchLaws } from "../search/law-search";

export const app = express();
const runtimeRepository = new SqliteRuntimeRepository();
const documentViews = runtimeRepository.listDocumentViews();
const lawSearchRecords = createLawSearchRecords(
  documentViews,
  runtimeRepository.listLawSearchSources(),
);
const searchService = new SearchService();

export function findDocument(documentId: string) {
  return runtimeRepository.findDocument(documentId);
}

export function findDocumentBySlug(slug: string) {
  return runtimeRepository.findDocumentBySlug(slug);
}

export function findExplorerBySlug(slug: string) {
  return runtimeRepository.findExplorerBySlug(slug);
}

export function findLaws(query: string) {
  return searchLaws(lawSearchRecords, query);
}

export function searchFullText(
  query: string,
  options: { documentId?: string; limit?: number } = {},
) {
  return searchService.search(query, options);
}

export function searchDefinitions(query: string, limit?: number) {
  return searchService.searchDefinitions(query, limit);
}

export function findProvisionRelationships(
  documentId: string,
  provisionId: string,
) {
  return runtimeRepository.findProvisionRelationships(documentId, provisionId);
}

export function findRelationshipPreview(entityId: string) {
  return runtimeRepository.findRelationshipPreview(entityId);
}

app.get("/api/health", (_request, response) => {
  response.json({
    status: "ok",
    runtimeDatabase: {
      available: true,
      buildId: runtimeRepository.buildId,
      documents: searchService.documentCount,
      records: searchService.recordCount,
      definitions: searchService.definitionCount,
      relationships: runtimeRepository.relationshipCount,
      unresolvedReferences: runtimeRepository.unresolvedReferenceCount,
    },
  });
});

app.get("/api/documents", (_request, response) => {
  response.json({ documents: runtimeRepository.listDocumentSummaries() });
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
  response.json(result);
});

app.get("/api/search/definitions", (request, response) => {
  const query = typeof request.query.q === "string" ? request.query.q : "";
  const requestedLimit =
    typeof request.query.limit === "string"
      ? Number.parseInt(request.query.limit, 10)
      : undefined;
  const result = searchDefinitions(
    query.slice(0, 120),
    Number.isFinite(requestedLimit) ? requestedLimit : undefined,
  );
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

app.get("/api/relationships/:documentId/:provisionId", (request, response) => {
  const relationships = findProvisionRelationships(
    request.params.documentId,
    request.params.provisionId,
  );
  if (!relationships) {
    response.status(404).json({ error: "Provision not found" });
    return;
  }
  response.json(relationships);
});

app.get("/api/relationship-previews/:entityId", (request, response) => {
  const preview = findRelationshipPreview(request.params.entityId);
  if (!preview) {
    response.status(404).json({ error: "Relationship target not found" });
    return;
  }
  response.json(preview);
});

app.get("/api/documents/:documentId", (request, response) => {
  const document = findDocument(request.params.documentId);

  if (!document) {
    response.status(404).json({ error: "Document not found" });
    return;
  }

  response.json(document);
});
