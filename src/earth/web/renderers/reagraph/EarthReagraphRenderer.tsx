import { GraphCanvas, type Theme, darkTheme } from "reagraph";
import type { EarthRenderModel } from "../../render-model";

export interface EarthReagraphRendererProps {
  model: EarthRenderModel;
  selectedNodeId?: string;
  onSelectNode(id: string): void;
  onSelectEdge(id: string): void;
}

const earthTheme: Theme = {
  ...darkTheme,
  canvas: { background: "#141813", fog: null },
  node: {
    ...darkTheme.node,
    fill: "#bfd778",
    activeFill: "#e7f5b7",
    opacity: 0.92,
    selectedOpacity: 1,
    inactiveOpacity: 0.24,
    label: {
      ...darkTheme.node.label,
      color: "#edf1e6",
      activeColor: "#ffffff",
    },
  },
  edge: {
    ...darkTheme.edge,
    fill: "#7896a0",
    activeFill: "#bfd778",
    opacity: 0.46,
    selectedOpacity: 0.9,
    inactiveOpacity: 0.12,
    label: {
      ...darkTheme.edge.label,
      color: "#b8c8cc",
      activeColor: "#edf1e6",
    },
  },
  arrow: { fill: "#7896a0", activeFill: "#bfd778" },
};

export function EarthReagraphRenderer({
  model,
  selectedNodeId,
  onSelectNode,
  onSelectEdge,
}: EarthReagraphRendererProps) {
  return (
    <GraphCanvas
      actives={selectedNodeId ? [selectedNodeId] : []}
      animated={!window.matchMedia("(prefers-reduced-motion: reduce)").matches}
      cameraMode="pan"
      draggable={false}
      edgeArrowPosition="end"
      edgeInterpolation="curved"
      edges={model.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        data: edge,
      }))}
      labelType="none"
      layoutType="concentric2d"
      nodes={model.nodes.map((node) => ({
        id: node.id,
        label: node.label,
        subLabel: node.subLabel,
        fill: node.membership === "boundary" ? "#8fb8c8" : "#bfd778",
        size: node.membership === "boundary" ? 7 : 13,
        data: node,
      }))}
      onEdgeClick={(edge) => onSelectEdge(edge.id)}
      onNodeClick={(node) => onSelectNode(node.id)}
      selections={selectedNodeId ? [selectedNodeId] : []}
      theme={earthTheme}
    />
  );
}
