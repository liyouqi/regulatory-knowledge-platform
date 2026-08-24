import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  type Edge as ReactFlowEdge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Network,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  type RelationshipPreview,
  relationshipPreviewSchema,
} from "../shared/legal";
import {
  type RelationshipGraphSelection,
  explorerPath,
  provisionPath,
} from "../shared/reader-route";
import type {
  RelationshipGraphEdge,
  RelationshipGraphNode,
  RelationshipGraphResponse,
} from "../shared/relationship-graph";
import { relationshipGraphResponseSchema } from "../shared/relationship-graph";
import { type ThemeMode, ThemeToggle } from "./ThemeToggle";

const relationDetails = {
  REFERENCES: { label: "References", color: "#5ed3c7" },
  CITED_BY: { label: "Cited by", color: "#70a7ff" },
  MANDATES: { label: "Mandates", color: "#f0b56d" },
  ADOPTED_UNDER: { label: "Adopted under", color: "#d897ff" },
  SUPPLEMENTS: { label: "Supplements", color: "#ff7f96" },
  RELATED_DOCUMENT: { label: "Related document", color: "#8f9bad" },
  RELATED_RECITAL: { label: "Related recital", color: "#9acf78" },
} as const;

type RelationType = keyof typeof relationDetails;

type GraphNodeData = {
  graphNode: RelationshipGraphNode;
  relationTypes: RelationType[];
};

type GraphFlowNode = Node<GraphNodeData, "relationship">;

function RelationshipNode({ data, selected }: NodeProps<GraphFlowNode>) {
  const node = data.graphNode;
  const primaryRelation = data.relationTypes[0];
  return (
    <div
      className={`relationship-graph-node ${node.role}${selected ? " selected" : ""}`}
      data-relation={primaryRelation?.toLowerCase()}
    >
      <Handle
        className="relationship-graph-handle"
        isConnectable={false}
        position={Position.Left}
        type="target"
      />
      <span className="relationship-node-law">{node.documentShortName}</span>
      <strong>{node.label}</strong>
      {node.title ? <p>{node.title}</p> : null}
      {node.role === "center" ? (
        <small>Current provision</small>
      ) : primaryRelation ? (
        <small>{relationDetails[primaryRelation].label}</small>
      ) : null}
      <Handle
        className="relationship-graph-handle"
        isConnectable={false}
        position={Position.Right}
        type="source"
      />
    </div>
  );
}

const nodeTypes = { relationship: RelationshipNode };

function relationTypesForNode(
  nodeId: string,
  edges: RelationshipGraphEdge[],
): RelationType[] {
  return [
    ...new Set(
      edges
        .filter((edge) => edge.source === nodeId || edge.target === nodeId)
        .map((edge) => edge.relationType as RelationType),
    ),
  ];
}

function layoutNodes(
  graph: RelationshipGraphResponse,
  visibleEdges: RelationshipGraphEdge[],
): GraphFlowNode[] {
  const visibleIds = new Set(
    visibleEdges.flatMap((edge) => [edge.source, edge.target]),
  );
  const center = graph.nodes.find((node) => node.role === "center");
  if (center) visibleIds.add(center.entityId);
  const neighbors = graph.nodes
    .filter((node) => node.role === "neighbor" && visibleIds.has(node.entityId))
    .sort((left, right) => {
      const leftType = relationTypesForNode(left.entityId, visibleEdges)[0];
      const rightType = relationTypesForNode(right.entityId, visibleEdges)[0];
      return (
        Object.keys(relationDetails).indexOf(leftType) -
          Object.keys(relationDetails).indexOf(rightType) ||
        left.documentShortName.localeCompare(right.documentShortName) ||
        left.label.localeCompare(right.label, undefined, { numeric: true })
      );
    });

  const neighborNodes = neighbors.map((node, index) => {
    const ring = Math.floor(index / 8);
    const ringStart = ring * 8;
    const ringCount = Math.min(8, neighbors.length - ringStart);
    const angle =
      -Math.PI / 2 + ((index - ringStart) * Math.PI * 2) / ringCount;
    return {
      id: node.entityId,
      type: "relationship" as const,
      position: {
        x: Math.cos(angle) * (480 + ring * 310),
        y: Math.sin(angle) * (315 + ring * 210),
      },
      data: {
        graphNode: node,
        relationTypes: relationTypesForNode(node.entityId, visibleEdges),
      },
      ariaLabel: `${node.documentShortName}, ${node.label}${node.title ? `, ${node.title}` : ""}`,
    };
  });

  return center
    ? [
        {
          id: center.entityId,
          type: "relationship",
          position: { x: 0, y: 0 },
          data: {
            graphNode: center,
            relationTypes: relationTypesForNode(center.entityId, visibleEdges),
          },
          ariaLabel: `Current provision, ${center.documentShortName}, ${center.label}`,
        },
        ...neighborNodes,
      ]
    : neighborNodes;
}

function flowEdges(edges: RelationshipGraphEdge[]): ReactFlowEdge[] {
  return edges.map((edge) => {
    const details = relationDetails[edge.relationType as RelationType];
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "default",
      animated: edge.provenance === "OFFICIAL_MAPPING",
      label: details.label,
      markerEnd: { type: MarkerType.ArrowClosed, color: details.color },
      style: { stroke: details.color, strokeWidth: 1.6 },
      labelStyle: { fill: details.color, fontSize: 10, fontWeight: 650 },
      labelBgStyle: { fill: "var(--graph-edge-label-bg)", fillOpacity: 0.92 },
      labelBgPadding: [6, 4],
      labelBgBorderRadius: 5,
    };
  });
}

function GraphPeek({
  node,
  onClose,
}: {
  node: RelationshipGraphNode;
  onClose: () => void;
}) {
  const [preview, setPreview] = useState<RelationshipPreview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setPreview(null);
    setError("");
    void fetch(
      `/api/relationship-previews/${encodeURIComponent(node.entityId)}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("Preview unavailable");
        return relationshipPreviewSchema.parse(await response.json());
      })
      .then(setPreview)
      .catch((reason: unknown) => {
        if ((reason as DOMException).name !== "AbortError") {
          setError(
            reason instanceof Error ? reason.message : "Preview unavailable",
          );
        }
      });
    return () => controller.abort();
  }, [node.entityId]);

  return (
    <aside aria-label="Relationship details" className="graph-peek">
      <header>
        <p>RELATIONSHIP DETAILS</p>
        <button
          aria-label="Close relationship details"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" size={16} />
        </button>
      </header>
      <span>{node.documentShortName}</span>
      <h2>{node.label}</h2>
      {node.title ? <h3>{node.title}</h3> : null}
      {preview?.excerpt ? <blockquote>{preview.excerpt}</blockquote> : null}
      {!preview && !error ? (
        <p className="graph-peek-status">Loading source text…</p>
      ) : null}
      {error ? <p className="graph-peek-status">{error}</p> : null}
      <div className="graph-peek-actions">
        <Link to={preview?.path ?? node.path}>
          Open in Reader <ArrowRight aria-hidden="true" size={15} />
        </Link>
        {preview ? (
          <a href={preview.sourceUrl} rel="noreferrer" target="_blank">
            Official source <ArrowUpRight aria-hidden="true" size={14} />
          </a>
        ) : null}
      </div>
    </aside>
  );
}

export function RelationshipGraphPage({
  selection,
  onOpenSearch,
  onToggleTheme,
  theme,
}: {
  selection: RelationshipGraphSelection;
  onOpenSearch: () => void;
  onToggleTheme: () => void;
  theme: ThemeMode;
}) {
  const [graph, setGraph] = useState<RelationshipGraphResponse | null>(null);
  const [loadError, setLoadError] = useState("");
  const [hiddenRelations, setHiddenRelations] = useState<Set<RelationType>>(
    new Set(),
  );
  const [selectedNode, setSelectedNode] =
    useState<RelationshipGraphNode | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setGraph(null);
    setLoadError("");
    setHiddenRelations(new Set());
    setSelectedNode(null);
    void fetch(
      `/api/relationship-graphs/${encodeURIComponent(selection.slug)}/${selection.collectionId}/${encodeURIComponent(selection.number)}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load relationship graph");
        return relationshipGraphResponseSchema.parse(await response.json());
      })
      .then(setGraph)
      .catch((reason: unknown) => {
        if ((reason as DOMException).name !== "AbortError") {
          setLoadError(
            reason instanceof Error
              ? reason.message
              : "Unable to load relationship graph",
          );
        }
      });
    return () => controller.abort();
  }, [selection.collectionId, selection.number, selection.slug]);

  const availableRelations = useMemo(
    () =>
      graph
        ? ([
            ...new Set(graph.edges.map((edge) => edge.relationType)),
          ] as RelationType[])
        : [],
    [graph],
  );
  const visibleGraphEdges = useMemo(
    () =>
      graph?.edges.filter(
        (edge) => !hiddenRelations.has(edge.relationType as RelationType),
      ) ?? [],
    [graph, hiddenRelations],
  );
  const nodes = useMemo(
    () => (graph ? layoutNodes(graph, visibleGraphEdges) : []),
    [graph, visibleGraphEdges],
  );
  const edges = useMemo(
    () => flowEdges(visibleGraphEdges),
    [visibleGraphEdges],
  );
  const center = graph?.nodes.find((node) => node.role === "center");
  const readerPath = provisionPath(
    selection.slug,
    selection.collectionId,
    selection.number,
  );

  function toggleRelation(relationType: RelationType) {
    setHiddenRelations((current) => {
      const next = new Set(current);
      if (next.has(relationType)) next.delete(relationType);
      else next.add(relationType);
      return next;
    });
  }

  if (loadError) {
    return (
      <main className="loading error-state" role="alert">
        {loadError}
      </main>
    );
  }
  if (!graph || !center) {
    return (
      <main aria-busy="true" aria-live="polite" className="loading">
        Loading relationship graph…
      </main>
    );
  }

  return (
    <main className="relationship-graph-shell">
      <a className="skip-link" href="#relationship-graph-canvas">
        Skip to relationship graph
      </a>
      <header className="topbar relationship-graph-topbar">
        <Link className="brand" to={readerPath}>
          <BookOpen aria-hidden="true" size={18} />
          Regulatory Knowledge
        </Link>
        <div className="topbar-actions">
          <ThemeToggle onToggle={onToggleTheme} theme={theme} />
          <Link className="view-switch" to={readerPath}>
            <ArrowLeft aria-hidden="true" size={15} />
            Reader
          </Link>
          <button
            className="search-button"
            onClick={onOpenSearch}
            type="button"
          >
            <Search aria-hidden="true" size={16} />
            Find laws
            <kbd>⌘ K</kbd>
          </button>
        </div>
      </header>

      <section className="relationship-graph-heading">
        <div>
          <p className="eyebrow">
            <Network aria-hidden="true" size={13} /> RELATIONSHIP GRAPH
          </p>
          <h1>{center.label} relationships</h1>
          {center.title ? <p>{center.title}</p> : null}
        </div>
        <nav aria-label="Relationship graph views">
          <Link
            to={`${explorerPath(selection.slug)}#${center.explorerAnchor ?? "document-outline"}`}
          >
            Act Explorer
          </Link>
          <span>{graph.nodes.length - 1} connected nodes</span>
        </nav>
      </section>

      <div
        className="relationship-filter-bar"
        aria-label="Filter relationships"
      >
        {availableRelations.map((relationType) => {
          const visible = !hiddenRelations.has(relationType);
          return (
            <button
              aria-pressed={visible}
              key={relationType}
              onClick={() => toggleRelation(relationType)}
              style={
                {
                  "--relation-color": relationDetails[relationType].color,
                } as React.CSSProperties
              }
              type="button"
            >
              <span />
              {relationDetails[relationType].label}
            </button>
          );
        })}
      </div>

      <section
        className="relationship-graph-canvas"
        id="relationship-graph-canvas"
      >
        <ReactFlow<GraphFlowNode>
          colorMode={theme}
          edges={edges}
          edgesReconnectable={false}
          elementsSelectable
          fitView
          fitViewOptions={{ padding: 0.26, maxZoom: 1.05 }}
          maxZoom={1.7}
          minZoom={0.2}
          nodes={nodes}
          nodesConnectable={false}
          nodesDraggable
          nodeTypes={nodeTypes}
          onNodeClick={(_event, node) => setSelectedNode(node.data.graphNode)}
          panOnScroll
          selectionOnDrag={false}
        >
          <Background
            color="var(--graph-grid)"
            gap={26}
            size={1.1}
            variant={BackgroundVariant.Dots}
          />
          <Controls position="bottom-left" showInteractive={false} />
        </ReactFlow>
        <p className="graph-canvas-hint">
          Drag to explore · scroll to zoom · select a node for source text
        </p>
        {selectedNode ? (
          <GraphPeek
            node={selectedNode}
            onClose={() => setSelectedNode(null)}
          />
        ) : null}
      </section>
    </main>
  );
}
