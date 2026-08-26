import { existsSync } from "node:fs";
import { resolve } from "node:path";
import express from "express";
import { CitationContextService } from "../agent/citation-context-service";
import { CitationRetrievalService } from "../agent/citation-retrieval-service";
import {
  toDocumentRelationshipGraph,
  toGlobalRelationshipGraph,
  toRelationshipGraph,
} from "../relationships/relationship-graph";
import { runtimeDatabasePath } from "../runtime/runtime-database-path";
import { SqliteRuntimeRepository } from "../runtime/sqlite-runtime-repository";
import { SearchService } from "../search/full-text-search";
import { createLawSearchRecords, searchLaws } from "../search/law-search";
import { level2MandateQueryResponseSchema } from "../shared/legal";

export const app = express();
const runtimePath = runtimeDatabasePath();
const runtimeRepository = new SqliteRuntimeRepository(runtimePath);
const documentViews = runtimeRepository.listDocumentViews();
const citationContextService = new CitationContextService(
  runtimeRepository,
  documentViews,
);
const lawSearchRecords = createLawSearchRecords(
  documentViews,
  runtimeRepository.listLawSearchSources(),
);
const searchService = new SearchService(runtimePath);
const citationRetrievalService = new CitationRetrievalService(
  searchService,
  citationContextService,
);

export function findDocument(documentId: string) {
  return runtimeRepository.findDocument(documentId);
}

export function findDocumentBySlug(slug: string) {
  return runtimeRepository.findDocumentBySlug(slug);
}

export function findDocumentVersionChain(documentId: string) {
  return runtimeRepository.findDocumentVersionChain(documentId);
}

export function findDocumentRegulatoryContext(
  documentId: string,
  provisionId?: string,
) {
  return runtimeRepository.findDocumentRegulatoryContext(
    documentId,
    provisionId,
  );
}

export function findCitationContext(entityId: string) {
  return citationContextService.findByEntityId(entityId);
}

export function findCitationRetrieval(
  query: string,
  options: { documentId?: string; limit?: number } = {},
) {
  return citationRetrievalService.search(query, options);
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

export function findLevel2Mandates(documentId: string, provisionId: string) {
  const relationships = findProvisionRelationships(documentId, provisionId);
  return relationships
    ? level2MandateQueryResponseSchema.parse({
        documentId,
        provisionId,
        buildId: relationships.buildId,
        relationships: relationships.mandates,
      })
    : null;
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

export function findDocumentRelationshipGraph(slug: string) {
  const document = findDocumentBySlug(slug);
  if (!document) return null;
  const relationships = runtimeRepository.findDocumentRelationships(
    document.id,
  );
  const lifecycleRelationships =
    runtimeRepository.findDocumentLifecycleRelationships(document.id);
  const caseLawRelationships =
    runtimeRepository.findDocumentCaseLawRelationships(document.id);
  return relationships
    ? toDocumentRelationshipGraph(
        document,
        documentViews,
        relationships,
        lifecycleRelationships,
        caseLawRelationships,
      )
    : null;
}

export function findGlobalRelationshipGraph() {
  return toGlobalRelationshipGraph(
    documentViews,
    runtimeRepository.listCrossDocumentRelationships(),
    runtimeRepository.listLifecycleRelationships(),
    runtimeRepository.listCaseLawRelationships(),
    runtimeRepository.buildId,
  );
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
      profileId: runtimeRepository.profileId,
      profileVersion: runtimeRepository.profileVersion,
      profileDisplayName: runtimeRepository.profileDisplayName,
      profileHash: runtimeRepository.profileHash,
      documents: searchService.documentCount,
      records: searchService.recordCount,
      definitions: searchService.definitionCount,
      relationships: runtimeRepository.relationshipCount,
      cellarRelationships: runtimeRepository.cellarRelationshipCount,
      lifecycleRelationships: runtimeRepository.lifecycleRelationshipCount,
      externalWorks: runtimeRepository.externalWorkCount,
      cases: runtimeRepository.caseCount,
      caseLawRelationships: runtimeRepository.caseLawRelationshipCount,
      relatedRecitals: runtimeRepository.relatedRecitalCount,
      versionNodes: runtimeRepository.versionNodeCount,
      versionEdges: runtimeRepository.versionEdgeCount,
      regulatoryDomains: runtimeRepository.domainCount,
      domainAssignments: runtimeRepository.domainAssignmentCount,
      authorities: runtimeRepository.authorityCount,
      authorityRelationships: runtimeRepository.authorityRelationshipCount,
      unresolvedReferences: runtimeRepository.unresolvedReferenceCount,
    },
  });
});

app.get("/api/documents", (_request, response) => {
  response.json({ documents: runtimeRepository.listDocumentSummaries() });
});

app.get("/api/internal/citation-context/:entityId", (request, response) => {
  const context = findCitationContext(request.params.entityId.slice(0, 300));
  if (!context) {
    response.status(404).json({ error: "Citation context entity not found" });
    return;
  }
  response.json(context);
});

app.get("/api/internal/citation-retrieval", (request, response) => {
  const query = typeof request.query.q === "string" ? request.query.q : "";
  const documentId =
    typeof request.query.documentId === "string"
      ? request.query.documentId.slice(0, 160)
      : undefined;
  const requestedLimit =
    typeof request.query.limit === "string"
      ? Number.parseInt(request.query.limit, 10)
      : undefined;
  response.json(
    findCitationRetrieval(query.slice(0, 200), {
      documentId,
      limit: Number.isFinite(requestedLimit) ? requestedLimit : undefined,
    }),
  );
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

app.get("/api/relationship-queries/level-2-mandates", (request, response) => {
  const documentId =
    typeof request.query.documentId === "string"
      ? request.query.documentId.slice(0, 160)
      : "";
  const provisionId =
    typeof request.query.provisionId === "string"
      ? request.query.provisionId.slice(0, 220)
      : "";
  const result = findLevel2Mandates(documentId, provisionId);
  if (!result) {
    response.status(404).json({ error: "Provision not found" });
    return;
  }
  response.json(result);
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

app.get("/api/relationship-graphs", (_request, response) => {
  response.json(findGlobalRelationshipGraph());
});

app.get("/api/document-relationship-graphs/:slug", (request, response) => {
  const graph = findDocumentRelationshipGraph(request.params.slug);
  if (!graph) {
    response
      .status(404)
      .json({ error: "Document relationship graph not found" });
    return;
  }
  response.json(graph);
});

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

app.get(
  "/api/documents/:documentId/regulatory-context",
  (request, response) => {
    const provisionId =
      typeof request.query.provisionId === "string"
        ? request.query.provisionId
        : undefined;
    const context = findDocumentRegulatoryContext(
      request.params.documentId,
      provisionId,
    );
    if (!context) {
      response.status(404).json({ error: "Regulatory context not found" });
      return;
    }
    response.json(context);
  },
);

app.get("/api/documents/:documentId", (request, response) => {
  const document = findDocument(request.params.documentId);

  if (!document) {
    response.status(404).json({ error: "Document not found" });
    return;
  }

  response.json(document);
});

const staticDirectory = resolve(process.cwd(), "dist");
if (existsSync(staticDirectory)) {
  app.use(express.static(staticDirectory, { index: false }));
  app.get("/{*splat}", (request, response, next) => {
    if (request.path.startsWith("/api/")) {
      next();
      return;
    }
    response.sendFile(resolve(staticDirectory, "index.html"));
  });
}
