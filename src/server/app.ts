import { existsSync } from "node:fs";
import { resolve } from "node:path";
import express from "express";
import { CitationContextService } from "../agent/citation-context-service";
import { CitationRetrievalService } from "../agent/citation-retrieval-service";
import { loadContactMailConfig } from "../contact/contact-config";
import { createContactRouter } from "../contact/contact-router";
import { ContactService } from "../contact/contact-service";
import { createCopilotRouter } from "../copilot/api/copilot-router";
import { CopilotContextResolver } from "../copilot/context/copilot-context-resolver";
import { ConfiguredPrivateAiProvider } from "../copilot/providers/configured-private-ai-provider";
import { loadPrivateAiConfig } from "../copilot/providers/private-ai-config";
import { CopilotService } from "../copilot/service/copilot-service";
import { CountryService } from "../countries/country-service";
import { RegulatoryDossierService } from "../dossiers/regulatory-dossier-service";
import { createEarthFeatureRouter } from "../earth/api/earth-feature-router";
import { createMetadataGraphRouter } from "../earth/api/metadata-graph-router";
import { DEFAULT_EARTH_ARTIFACT_PATH } from "../earth/runtime/earth-repository";
import { MonitorAiService } from "../monitor/monitor-ai";
import { createMonitorRouter } from "../monitor/monitor-router";
import { RegulatoryPathService } from "../paths/regulatory-path-service";
import {
  PublicApiAccessController,
  loadPublicApiAccessConfig,
} from "../public-api/public-api-access-control";
import { createPublicApiDocumentationRouter } from "../public-api/public-api-documentation-router";
import { createPublicApiRouter } from "../public-api/public-api-router";
import { PublicApiService } from "../public-api/public-api-service";
import { EbaQaService } from "../qa/eba-qa-service";
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
import { createTelemetryRouter } from "../telemetry/telemetry-router";
import { RegulatoryTopicService } from "../topics/regulatory-topic-service";

export const app = express();
app.disable("x-powered-by");
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
const countryService = new CountryService(runtimeRepository);
const regulatoryPathService = new RegulatoryPathService(runtimeRepository);
const regulatoryTopicService = new RegulatoryTopicService(runtimeRepository);
const ebaQaService = new EbaQaService(runtimeRepository);
const regulatoryDossierService = new RegulatoryDossierService(
  runtimeRepository,
);
const publicApiService = new PublicApiService(
  runtimeRepository,
  lawSearchRecords,
  citationContextService,
);
const publicApiAccessController = new PublicApiAccessController(
  loadPublicApiAccessConfig(),
);
const privateAiConfig = loadPrivateAiConfig();
const copilotService = privateAiConfig.available
  ? new CopilotService(
      new CopilotContextResolver(runtimeRepository),
      new ConfiguredPrivateAiProvider(privateAiConfig.config),
    )
  : null;
const monitorAiService = privateAiConfig.available
  ? new MonitorAiService(privateAiConfig.config)
  : null;
const contactConfig = loadContactMailConfig();
const contactService = contactConfig.available
  ? new ContactService(contactConfig.config)
  : null;

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

export function findImplementationTimeline(slug: string) {
  return runtimeRepository.findImplementationTimelineBySlug(slug);
}

export function findDocumentSupervisoryDecisions(
  slug: string,
  provisionId?: string,
) {
  const document = findDocumentBySlug(slug);
  return document
    ? runtimeRepository.findDocumentSupervisoryDecisions(
        document.id,
        provisionId,
      )
    : null;
}

export function findRegulatoryPath(domainSlug: string) {
  return regulatoryPathService.findByDomainSlug(domainSlug);
}

export function findApplicability(slug: string, entityTypeId?: string) {
  return runtimeRepository.findApplicabilityBySlug(slug, entityTypeId);
}

export function listCountries() {
  return countryService.list();
}

export function findCountry(code: string) {
  return countryService.find(code);
}

export function listRegulatoryTopics() {
  return regulatoryTopicService.list();
}

export function findRegulatoryTopic(slug: string) {
  return regulatoryTopicService.findBySlug(slug);
}

export function listEbaQa(options: {
  page?: number;
  pageSize?: number;
  legalAct?: string;
  topic?: string;
}) {
  return ebaQaService.list(options);
}

export function findEbaQa(publicId: string) {
  return ebaQaService.find(publicId);
}

export function listRegulatoryDossiers() {
  return regulatoryDossierService.list();
}

export function findRegulatoryDossier(slug: string) {
  return regulatoryDossierService.find(slug);
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
      expressionMetadata: runtimeRepository.expressionMetadataCount,
      regulatoryDomains: runtimeRepository.domainCount,
      domainAssignments: runtimeRepository.domainAssignmentCount,
      authorities: runtimeRepository.authorityCount,
      authorityRelationships: runtimeRepository.authorityRelationshipCount,
      timelineEvents: runtimeRepository.timelineEventCount,
      supervisoryDecisions: runtimeRepository.supervisoryDecisionCount,
      supervisoryDecisionFindings:
        runtimeRepository.supervisoryDecisionFindingCount,
      applicabilityRules: runtimeRepository.applicabilityRuleCount,
      applicabilityEvidence: runtimeRepository.applicabilityEvidenceCount,
      regulatoryTopics: runtimeRepository.topicCount,
      topicAssignments: runtimeRepository.topicAssignmentCount,
      ebaQaRecords: runtimeRepository.ebaQaCount,
      ebaQaDetails: runtimeRepository.ebaQaDetailCount,
      ebaQaReferences: runtimeRepository.ebaQaReferenceCount,
      dossiers: runtimeRepository.dossierCount,
      dossierSections: runtimeRepository.dossierSectionCount,
      dossierSources: runtimeRepository.dossierSourceCount,
      unresolvedReferences: runtimeRepository.unresolvedReferenceCount,
    },
    publicApi: publicApiAccessController.snapshot(),
  });
});

app.use("/api/copilot", createCopilotRouter({ service: copilotService }));
app.use("/api/monitor", createMonitorRouter({ aiService: monitorAiService }));
app.use("/api/contact", createContactRouter({ service: contactService }));
app.use("/api/telemetry", createTelemetryRouter());

const earthArtifactPath =
  process.env.EARTH_ARTIFACT_PATH ?? DEFAULT_EARTH_ARTIFACT_PATH;
app.use("/api/earth", createMetadataGraphRouter());
app.use("/api/earth", createEarthFeatureRouter(earthArtifactPath));

app.use("/api", createPublicApiDocumentationRouter(runtimeRepository.buildId));

app.use(
  "/api/v1",
  createPublicApiRouter(publicApiService, publicApiAccessController),
);

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

app.get("/api/timelines/:slug", (request, response) => {
  const timeline = findImplementationTimeline(
    request.params.slug.slice(0, 100),
  );
  if (!timeline) {
    response.status(404).json({ error: "Implementation timeline not found" });
    return;
  }
  response.json(timeline);
});

app.get("/api/supervisory-decisions/:slug", (request, response) => {
  const provisionId =
    typeof request.query.provisionId === "string"
      ? request.query.provisionId.slice(0, 200)
      : undefined;
  const decisions = findDocumentSupervisoryDecisions(
    request.params.slug.slice(0, 100),
    provisionId,
  );
  if (!decisions) {
    response.status(404).json({ error: "Supervisory decisions not found" });
    return;
  }
  response.json(decisions);
});

app.get("/api/regulatory-paths/:domainSlug", (request, response) => {
  const path = findRegulatoryPath(request.params.domainSlug.slice(0, 120));
  if (!path) {
    response.status(404).json({ error: "Regulatory path not found" });
    return;
  }
  response.json(path);
});

app.get("/api/applicability/:slug", (request, response) => {
  const entityTypeId =
    typeof request.query.entityType === "string"
      ? request.query.entityType.slice(0, 100)
      : undefined;
  const result = findApplicability(
    request.params.slug.slice(0, 100),
    entityTypeId,
  );
  if (!result) {
    response.status(404).json({ error: "Applicability rule not found" });
    return;
  }
  response.json(result);
});

app.get("/api/countries", (_request, response) => {
  response.json(listCountries());
});

app.get("/api/countries/:code", (request, response) => {
  const country = findCountry(request.params.code);
  if (!country) {
    response.status(404).json({ error: "Country not found" });
    return;
  }
  response.json(country);
});

app.get("/api/topics", (_request, response) => {
  response.json(listRegulatoryTopics());
});

app.get("/api/topics/:slug", (request, response) => {
  const topic = findRegulatoryTopic(request.params.slug.slice(0, 120));
  if (!topic) {
    response.status(404).json({ error: "Regulatory Topic not found" });
    return;
  }
  response.json(topic);
});

app.get("/api/qa", (request, response) => {
  const integerQuery = (name: string) => {
    const value = request.query[name];
    return typeof value === "string" ? Number.parseInt(value, 10) : undefined;
  };
  const stringQuery = (name: string) => {
    const value = request.query[name];
    return typeof value === "string" && value.trim()
      ? value.trim().slice(0, 300)
      : undefined;
  };
  response.json(
    listEbaQa({
      page: integerQuery("page"),
      pageSize: integerQuery("pageSize"),
      legalAct: stringQuery("legalAct"),
      topic: stringQuery("topic"),
    }),
  );
});

app.get("/api/qa/:publicId", (request, response) => {
  const publicId = request.params.publicId.slice(0, 40);
  if (!/^\d{4}_\d+$/u.test(publicId)) {
    response.status(404).json({ error: "EBA Q&A not found" });
    return;
  }
  const result = findEbaQa(publicId);
  if (!result) {
    response.status(404).json({ error: "EBA Q&A detail not found" });
    return;
  }
  response.json(result);
});

app.get("/api/dossiers", (_request, response) => {
  response.json(listRegulatoryDossiers());
});

app.get("/api/dossiers/:slug", (request, response) => {
  const slug = request.params.slug.slice(0, 120);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)) {
    response.status(404).json({ error: "Regulatory Dossier not found" });
    return;
  }
  const result = findRegulatoryDossier(slug);
  if (!result) {
    response.status(404).json({ error: "Regulatory Dossier not found" });
    return;
  }
  response.json(result);
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
