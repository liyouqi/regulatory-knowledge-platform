import type {
  DocumentView,
  ProvisionRelationship,
  ProvisionRelationshipsResponse,
  ProvisionView,
  RelationshipEndpoint,
} from "../shared/legal";
import {
  type RelationshipGraphEdge,
  type RelationshipGraphNode,
  type RelationshipGraphResponse,
  relationshipGraphResponseSchema,
} from "../shared/relationship-graph";

type RelationshipGroup = {
  direction: "incoming" | "outgoing";
  relationships: ProvisionRelationship[];
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

function edgeKey(
  source: string,
  target: string,
  relationship: ProvisionRelationship,
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
  relationship: ProvisionRelationship,
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
