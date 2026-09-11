import type { EarthEdge, EarthNode } from "../contract/earth-contract";

export interface EarthOverviewAggregate {
  id: string;
  source: string;
  target: string;
  relationTypes: string[];
  provenances: string[];
  relationshipIds: string[];
  count: number;
}

export interface EarthRenderNode {
  id: string;
  label: string;
  subLabel: string;
  membership: EarthNode["membership"];
  source: EarthNode;
}

export interface EarthRenderEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  relationshipIds: string[];
  count: number;
  sourceProjection: EarthOverviewAggregate | EarthEdge;
}

export interface EarthRenderModel {
  nodes: EarthRenderNode[];
  edges: EarthRenderEdge[];
}

/** Pure renderer projection. It carries IDs through unchanged and adds no facts. */
export function projectEarthOverview(input: {
  works: EarthNode[];
  boundaryNodes: EarthNode[];
  aggregates: EarthOverviewAggregate[];
}): EarthRenderModel {
  const sourceNodes = [...input.works, ...input.boundaryNodes];
  const ids = new Set<string>();
  const nodes = sourceNodes.map((node) => {
    if (ids.has(node.id)) {
      throw new Error(`Duplicate Earth render node ID: ${node.id}`);
    }
    ids.add(node.id);
    return {
      id: node.id,
      label: node.label,
      subLabel:
        node.membership === "boundary" ? "Official boundary" : "Included Work",
      membership: node.membership,
      source: node,
    };
  });
  const edgeIds = new Set<string>();
  const edges = input.aggregates.map((edge) => {
    if (edgeIds.has(edge.id)) {
      throw new Error(`Duplicate Earth render edge ID: ${edge.id}`);
    }
    edgeIds.add(edge.id);
    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      throw new Error(`Earth render edge ${edge.id} has an unknown endpoint`);
    }
    if (edge.count !== edge.relationshipIds.length) {
      throw new Error(`Earth render edge ${edge.id} has an invalid fact count`);
    }
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.relationTypes.join(" · "),
      relationshipIds: [...edge.relationshipIds],
      count: edge.count,
      sourceProjection: edge,
    };
  });
  return { nodes, edges };
}

/** Exact projection for an explicitly requested, server-bounded neighbourhood. */
export function projectEarthExactNeighbourhood(input: {
  nodes: EarthNode[];
  relationships: EarthEdge[];
}): EarthRenderModel {
  const ids = new Set<string>();
  const nodes = input.nodes.map((node) => {
    if (ids.has(node.id)) {
      throw new Error(`Duplicate exact Earth node ID: ${node.id}`);
    }
    ids.add(node.id);
    return {
      id: node.id,
      label: node.label,
      subLabel:
        node.membership === "boundary" ? "Official boundary" : "Included node",
      membership: node.membership,
      source: node,
    };
  });
  const edgeIds = new Set<string>();
  const edges = input.relationships.map((relationship) => {
    if (relationship.projection !== "exact") {
      throw new Error("Exact Earth projection received an aggregate edge");
    }
    if (edgeIds.has(relationship.id)) {
      throw new Error(`Duplicate exact Earth edge ID: ${relationship.id}`);
    }
    edgeIds.add(relationship.id);
    if (!ids.has(relationship.source) || !ids.has(relationship.target)) {
      throw new Error(
        `Exact Earth edge ${relationship.id} has an unknown endpoint`,
      );
    }
    return {
      id: relationship.id,
      source: relationship.source,
      target: relationship.target,
      label: relationship.relationType,
      relationshipIds: [relationship.id],
      count: 1,
      sourceProjection: relationship,
    };
  });
  return { nodes, edges };
}
