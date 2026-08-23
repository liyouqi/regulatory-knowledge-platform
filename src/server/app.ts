import express from "express";
import { toExplorerView } from "../canonical/to-explorer-view";
import { loadDocumentViews } from "../data/document-repository";
import type { DocumentSummary } from "../shared/legal";

export const app = express();
const documentViews = loadDocumentViews();
const explorerViews = documentViews.map(toExplorerView);

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

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.get("/api/documents", (_request, response) => {
  response.json({ documents: documentViews.map(summary) });
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
