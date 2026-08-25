import type {
  CaseLawEndpoint,
  CaseLawRelationship,
  DocumentCaseLawRelationshipsResponse,
} from "../shared/case-law";
import type {
  DocumentRelationshipsResponse,
  DocumentView,
  ProvisionRelationship,
  ProvisionRelationshipsResponse,
  ProvisionView,
  RelationshipEndpoint,
} from "../shared/legal";
import type {
  DocumentLifecycleRelationshipsResponse,
  LifecycleEndpoint,
  LifecycleRelationship,
} from "../shared/lifecycle";
import { explorerPath } from "../shared/reader-route";
import {
  type DocumentRelationshipGraphResponse,
  type GlobalRelationshipGraphResponse,
  type RelationshipGraphEdge,
  type RelationshipGraphNode,
  type RelationshipGraphResponse,
  documentRelationshipGraphResponseSchema,
  globalRelationshipGraphResponseSchema,
  relationshipGraphResponseSchema,
} from "../shared/relationship-graph";

type RelationshipGroup = {
  direction: "incoming" | "outgoing";
  relationships: ProvisionRelationship[];
};

type GraphRelationship = {
  id: string;
  relationType: RelationshipGraphEdge["relationType"];
  provenance: RelationshipGraphEdge["provenance"];
  evidence: { text: string; sourceUrl: string };
  score?: number;
};

function graphNodeId(endpoint: RelationshipEndpoint): string {
  return endpoint.provisionId ?? endpoint.entityId;
}

function neighborNode(endpoint: RelationshipEndpoint): RelationshipGraphNode {
  const id = graphNodeId(endpoint);
  return {
    ...endpoint,
    entityId: id,
    role: "neighbor",
  };
}

function centerNode(
  document: DocumentView,
  provision: ProvisionView,
): RelationshipGraphNode {
  return {
    entityId: provision.id,
    documentId: document.id,
    documentShortName: document.shortName,
    provisionId: provision.id,
    kind: provision.kind,
    label: provision.label,
    title: provision.title ?? null,
    path: provision.path,
    role: "center",
    explorerAnchor: provision.explorerAnchor,
  };
}

function documentNode(
  document: DocumentView,
  role: RelationshipGraphNode["role"],
): RelationshipGraphNode {
  return {
    entityId: document.id,
    documentId: document.id,
    documentShortName: document.shortName,
    kind: "document",
    label: document.shortName,
    title: document.officialTitle,
    path: explorerPath(document.slug),
    role,
  };
}

function edgeKey(
  source: string,
  target: string,
  relationship: GraphRelationship,
) {
  return [
    source,
    target,
    relationship.relationType,
    relationship.provenance,
  ].join("|");
}

function addEdge(
  edges: Map<string, RelationshipGraphEdge>,
  source: string,
  target: string,
  relationship: GraphRelationship,
) {
  const key = edgeKey(source, target, relationship);
  const existing = edges.get(key);
  const evidence = {
    text: relationship.evidence.text,
    sourceUrl: relationship.evidence.sourceUrl,
  };
  if (existing) {
    existing.relationshipIds.push(relationship.id);
    if (
      !existing.evidence.some(
        (item) =>
          item.text === evidence.text && item.sourceUrl === evidence.sourceUrl,
      )
    ) {
      existing.evidence.push(evidence);
    }
    if (
      relationship.score !== undefined &&
      (existing.score === undefined || relationship.score > existing.score)
    ) {
      existing.score = relationship.score;
    }
    return;
  }
  edges.set(key, {
    id: `graph-edge:${edges.size + 1}`,
    source,
    target,
    relationType: relationship.relationType,
    provenance: relationship.provenance,
    relationshipIds: [relationship.id],
    evidence: [evidence],
    score: relationship.score,
  });
}

export function toRelationshipGraph(
  document: DocumentView,
  provision: ProvisionView,
  response: ProvisionRelationshipsResponse,
): RelationshipGraphResponse {
  const center = centerNode(document, provision);
  const nodes = new Map<string, RelationshipGraphNode>([
    [center.entityId, center],
  ]);
  const edges = new Map<string, RelationshipGraphEdge>();
  const groups: RelationshipGroup[] = [
    { direction: "outgoing", relationships: response.references },
    { direction: "incoming", relationships: response.citedBy },
    { direction: "outgoing", relationships: response.mandates },
    { direction: "outgoing", relationships: response.adoptedUnder },
    { direction: "outgoing", relationships: response.supplements },
    { direction: "outgoing", relationships: response.relatedDocuments },
    { direction: "outgoing", relationships: response.relatedRecitals },
  ];

  for (const group of groups) {
    for (const relationship of group.relationships) {
      const relationshipSource = graphNodeId(relationship.source);
      const relationshipTarget = graphNodeId(relationship.target);
      const isCentered =
        group.direction === "incoming"
          ? relationshipTarget === center.entityId
          : relationshipSource === center.entityId;
      if (!isCentered) continue;
      const endpoint =
        group.direction === "incoming"
          ? relationship.source
          : relationship.target;
      const neighbor = neighborNode(endpoint);
      nodes.set(neighbor.entityId, neighbor);
      const source =
        group.direction === "incoming" ? neighbor.entityId : center.entityId;
      const target =
        group.direction === "incoming" ? center.entityId : neighbor.entityId;
      addEdge(edges, source, target, relationship);
    }
  }

  return relationshipGraphResponseSchema.parse({
    documentId: response.documentId,
    provisionId: response.provisionId,
    buildId: response.buildId,
    nodes: [...nodes.values()],
    edges: [...edges.values()],
  });
}

export function toDocumentRelationshipGraph(
  document: DocumentView,
  documents: DocumentView[],
  response: DocumentRelationshipsResponse,
  lifecycleResponse?: DocumentLifecycleRelationshipsResponse | null,
  caseLawResponse?: DocumentCaseLawRelationshipsResponse | null,
): DocumentRelationshipGraphResponse {
  const center = documentNode(document, "center");
  const documentsById = new Map(
    documents.map((candidate) => [candidate.id, candidate]),
  );
  const nodes = new Map<string, RelationshipGraphNode>([
    [center.entityId, center],
  ]);
  const edges = new Map<string, RelationshipGraphEdge>();

  for (const relationship of response.relationships) {
    const sourceDocument = documentsById.get(relationship.source.documentId);
    const targetDocument = documentsById.get(relationship.target.documentId);
    if (
      !sourceDocument ||
      !targetDocument ||
      sourceDocument.id === targetDocument.id ||
      (sourceDocument.id !== document.id && targetDocument.id !== document.id)
    ) {
      continue;
    }

    const source = documentNode(
      sourceDocument,
      sourceDocument.id === document.id ? "center" : "neighbor",
    );
    const target = documentNode(
      targetDocument,
      targetDocument.id === document.id ? "center" : "neighbor",
    );
    nodes.set(source.entityId, source);
    nodes.set(target.entityId, target);
    const projectedRelationship =
      relationship.relationType === "REFERENCES" &&
      targetDocument.id === document.id
        ? { ...relationship, relationType: "CITED_BY" as const }
        : relationship;
    addEdge(edges, source.entityId, target.entityId, projectedRelationship);
  }

  function lifecycleNode(endpoint: LifecycleEndpoint): RelationshipGraphNode {
    const loadedDocument = documentsById.get(endpoint.documentId);
    if (endpoint.kind === "document" && loadedDocument) {
      return documentNode(
        loadedDocument,
        loadedDocument.id === document.id ? "center" : "neighbor",
      );
    }
    return {
      entityId: endpoint.entityId,
      documentId: endpoint.documentId,
      documentShortName: endpoint.documentShortName,
      kind: "external-work",
      label: endpoint.label,
      title: null,
      sourceUrl: endpoint.sourceUrl,
      role: "neighbor",
    };
  }

  for (const relationship of lifecycleResponse?.relationships ?? []) {
    const source = lifecycleNode(relationship.source);
    const target = lifecycleNode(relationship.target);
    if (
      source.entityId !== center.entityId &&
      target.entityId !== center.entityId
    ) {
      continue;
    }
    nodes.set(source.entityId, source);
    nodes.set(target.entityId, target);
    addEdge(edges, source.entityId, target.entityId, relationship);
  }

  function caseNode(caseEntity: CaseLawEndpoint): RelationshipGraphNode {
    return {
      entityId: caseEntity.entityId,
      documentShortName: "CJEU",
      kind: "case",
      label: caseEntity.caseNumber,
      title: caseEntity.caseName,
      sourceUrl: caseEntity.sourceUrl,
      role: "neighbor",
      caseCelex: caseEntity.caseCelex,
      ecli: caseEntity.ecli,
      decisionType: caseEntity.decisionType,
      decisionDate: caseEntity.decisionDate,
      officialTitle: caseEntity.officialTitle,
    };
  }

  for (const relationship of caseLawResponse?.relationships ?? []) {
    if (relationship.target.documentId !== document.id) continue;
    const source = caseNode(relationship.source);
    nodes.set(source.entityId, source);
    addEdge(edges, source.entityId, center.entityId, relationship);
  }

  return documentRelationshipGraphResponseSchema.parse({
    documentId: response.documentId,
    buildId: response.buildId,
    nodes: [...nodes.values()],
    edges: [...edges.values()],
  });
}

export function toGlobalRelationshipGraph(
  documents: DocumentView[],
  relationships: ProvisionRelationship[],
  lifecycleRelationships: LifecycleRelationship[],
  caseLawRelationships: CaseLawRelationship[],
  buildId: string,
): GlobalRelationshipGraphResponse {
  const documentsById = new Map(
    documents.map((document) => [document.id, document]),
  );
  const nodes = new Map<string, RelationshipGraphNode>(
    documents.map((document) => [
      document.id,
      documentNode(document, "neighbor"),
    ]),
  );
  const edges = new Map<string, RelationshipGraphEdge>();

  for (const relationship of relationships) {
    const sourceDocument = documentsById.get(relationship.source.documentId);
    const targetDocument = documentsById.get(relationship.target.documentId);
    if (
      !sourceDocument ||
      !targetDocument ||
      sourceDocument.id === targetDocument.id
    ) {
      continue;
    }
    nodes.set(sourceDocument.id, documentNode(sourceDocument, "neighbor"));
    nodes.set(targetDocument.id, documentNode(targetDocument, "neighbor"));
    addEdge(edges, sourceDocument.id, targetDocument.id, relationship);
  }

  function lifecycleNode(endpoint: LifecycleEndpoint): RelationshipGraphNode {
    const document = documentsById.get(endpoint.documentId);
    if (endpoint.kind === "document" && document) {
      return documentNode(document, "neighbor");
    }
    return {
      entityId: endpoint.entityId,
      documentId: endpoint.documentId,
      documentShortName: endpoint.documentShortName,
      kind: "external-work",
      label: endpoint.label,
      title: null,
      sourceUrl: endpoint.sourceUrl,
      role: "neighbor",
    };
  }

  for (const relationship of lifecycleRelationships) {
    const source = lifecycleNode(relationship.source);
    const target = lifecycleNode(relationship.target);
    nodes.set(source.entityId, source);
    nodes.set(target.entityId, target);
    addEdge(edges, source.entityId, target.entityId, relationship);
  }

  function caseNode(caseEntity: CaseLawEndpoint): RelationshipGraphNode {
    return {
      entityId: caseEntity.entityId,
      documentShortName: "CJEU",
      kind: "case",
      label: caseEntity.caseNumber,
      title: caseEntity.caseName,
      sourceUrl: caseEntity.sourceUrl,
      role: "neighbor",
      caseCelex: caseEntity.caseCelex,
      ecli: caseEntity.ecli,
      decisionType: caseEntity.decisionType,
      decisionDate: caseEntity.decisionDate,
      officialTitle: caseEntity.officialTitle,
    };
  }

  for (const relationship of caseLawRelationships) {
    const target = documentsById.get(relationship.target.documentId);
    if (!target) continue;
    const source = caseNode(relationship.source);
    nodes.set(source.entityId, source);
    nodes.set(target.id, documentNode(target, "neighbor"));
    addEdge(edges, source.entityId, target.id, relationship);
  }

  return globalRelationshipGraphResponseSchema.parse({
    scope: "global",
    buildId,
    nodes: [...nodes.values()],
    edges: [...edges.values()],
  });
}
