import express from "express";
import { toRelationshipGraph } from "../relationships/relationship-graph";
import { runtimeDatabasePath } from "../runtime/runtime-database-path";
import { SqliteRuntimeRepository } from "../runtime/sqlite-runtime-repository";
import { SearchService } from "../search/full-text-search";
import { createLawSearchRecords, searchLaws } from "../search/law-search";

export const app = express();
const runtimePath = runtimeDatabasePath();
const runtimeRepository = new SqliteRuntimeRepository(runtimePath);
const documentViews = runtimeRepository.listDocumentViews();
const lawSearchRecords = createLawSearchRecords(
  documentViews,
  runtimeRepository.listLawSearchSources(),
);
const searchService = new SearchService(runtimePath);

export function findDocument(documentId: string) {
  return runtimeRepository.findDocument(documentId);
}

export function findDocumentBySlug(slug: string) {
  return runtimeRepository.findDocumentBySlug(slug);
}

export function findDocumentVersionChain(documentId: string) {
  return runtimeRepository.findDocumentVersionChain(documentId);
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

export function listDocumentDefinitions(documentId: string) {
  return searchService.listDocumentDefinitions(documentId);
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

export function findRelationshipGraph(
  slug: string,
  collectionId: "articles" | "recitals" | "annexes" | "provisions",
  number: string,
) {
  const document = findDocumentBySlug(slug);
  const provision = document?.provisions.find(
    (candidate) =>
      candidate.collectionId === collectionId &&
      candidate.number.toLowerCase() === number.toLowerCase(),
  );
  if (!document || !provision) return null;
  const relationships = findProvisionRelationships(document.id, provision.id);
  return relationships
    ? toRelationshipGraph(document, provision, relationships)
    : null;
}

export function findFamilyLevel2(
  familySlug: string,
  measureType?: "rts" | "its",
) {
  return runtimeRepository.findFamilyLevel2(
    `family:${familySlug}`,
    measureType,
  );
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
      relatedRecitals: runtimeRepository.relatedRecitalCount,
      versionNodes: runtimeRepository.versionNodeCount,
      versionEdges: runtimeRepository.versionEdgeCount,
      unresolvedReferences: runtimeRepository.unresolvedReferenceCount,
    },
  });
});

app.get("/api/documents", (_request, response) => {
  response.json({ documents: runtimeRepository.listDocumentSummaries() });
});

function sendFamilyLevel2(
  familySlug: string,
  measureType: "rts" | "its" | undefined,
  response: express.Response,
) {
  const family = findFamilyLevel2(familySlug, measureType);
  if (!family) {
    response.status(404).json({ error: "Regulatory family not found" });
    return;
  }
  response.json(family);
}

app.get("/api/families/:familySlug/level-2", (request, response) => {
  sendFamilyLevel2(request.params.familySlug, undefined, response);
});

app.get(
  "/api/families/:familySlug/level-2/:measureType",
  (request, response) => {
    const measureType =
      request.params.measureType === "rts" ||
      request.params.measureType === "its"
        ? request.params.measureType
        : undefined;
    if (!measureType) {
      response.status(404).json({ error: "Level 2 measure type not found" });
      return;
    }
    sendFamilyLevel2(request.params.familySlug, measureType, response);
  },
);

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

app.get(
  "/api/relationship-graphs/:slug/:collectionId/:number",
  (request, response) => {
    const collectionId = request.params.collectionId;
    if (
      collectionId !== "articles" &&
      collectionId !== "recitals" &&
      collectionId !== "annexes" &&
      collectionId !== "provisions"
    ) {
      response.status(404).json({ error: "Provision collection not found" });
      return;
    }
    const graph = findRelationshipGraph(
      request.params.slug,
      collectionId,
      request.params.number,
    );
    if (!graph) {
      response.status(404).json({ error: "Relationship graph not found" });
      return;
    }
    response.json(graph);
  },
);

app.get("/api/documents/:documentId/version-chain", (request, response) => {
  const chain = findDocumentVersionChain(request.params.documentId);
  if (!chain) {
    response.status(404).json({ error: "Document version chain not found" });
    return;
  }
  response.json(chain);
});

app.get("/api/documents/:documentId/definitions", (request, response) => {
  const definitions = listDocumentDefinitions(request.params.documentId);
  if (!definitions) {
    response.status(404).json({ error: "Document not found" });
    return;
  }
  response.json(definitions);
});

app.get("/api/documents/:documentId", (request, response) => {
  const document = findDocument(request.params.documentId);

  if (!document) {
    response.status(404).json({ error: "Document not found" });
    return;
  }

  response.json(document);
});
