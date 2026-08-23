import express from "express";
import { toExplorerView } from "../canonical/to-explorer-view";
import { loadDocumentViews } from "../data/document-repository";
import { loadSourceRegistrySync } from "../ingestion/source-registry";
import { createLawSearchRecords, searchLaws } from "../search/law-search";
import type { DocumentSummary } from "../shared/legal";

export const app = express();
const documentViews = loadDocumentViews();
const explorerViews = documentViews.map(toExplorerView);
const lawSearchRecords = createLawSearchRecords(
  documentViews,
  loadSourceRegistrySync(),
);

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

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.get("/api/documents", (_request, response) => {
  response.json({ documents: documentViews.map(summary) });
});

app.get("/api/search/laws", (request, response) => {
  const query = typeof request.query.q === "string" ? request.query.q : "";
  response.json(findLaws(query.slice(0, 200)));
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
