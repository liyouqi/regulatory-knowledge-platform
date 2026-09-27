import { Minus, Plus, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { EarthNode } from "../../../contract/earth-contract";
import { type EarthDisplay, earthNodeDisplay } from "../../display-tags";
import type { EarthRenderModel } from "../../render-model";
import { type NebulaSnapshot, createNebulaScene } from "./nebula-scene";

export interface EarthNebulaRendererProps {
  model: EarthRenderModel;
  display?: EarthDisplay;
  selectedNodeId?: string;
  selectedEdgeId?: string;
  onSelectNode(id: string): void;
  onSelectEdge(id: string): void;
  onUnavailable(): void;
  branch?: { parent: EarthNode; children: EarthNode[] };
}

export function EarthNebulaRenderer(props: EarthNebulaRendererProps) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef(new Map<string, HTMLButtonElement>());
  const callbacks = useRef(props);
  callbacks.current = props;
  const actions = useRef<ReturnType<typeof createNebulaScene> | null>(null);
  const [hovered, setHovered] = useState("");
  const displayedNodes = useMemo(() => {
    const nodes = new Map(props.model.nodes.map((node) => [node.id, node]));
    if (props.branch)
      for (const source of [props.branch.parent, ...props.branch.children]) {
        if (!nodes.has(source.id))
          nodes.set(source.id, {
            id: source.id,
            label: source.label,
            subLabel: source.entityKind,
            membership: source.membership,
            source,
          });
      }
    return [...nodes.values()];
  }, [props.model, props.branch]);
  const snapshot = useRef<NebulaSnapshot>({
    ...props,
    nodes: displayedNodes,
    hoveredId: hovered,
  });
  snapshot.current = { ...props, nodes: displayedNodes, hoveredId: hovered };

  useEffect(() => {
    if (!host.current) return;
    try {
      const scene = createNebulaScene(host.current, {
        snapshot: () => snapshot.current,
        labels: () => labels.current,
        selectNode: (id) => callbacks.current.onSelectNode(id),
        selectEdge: (id) => callbacks.current.onSelectEdge(id),
        hover: setHovered,
        unavailable: () => callbacks.current.onUnavailable(),
      });
      actions.current = scene;
      return () => {
        scene.dispose();
        actions.current = null;
      };
    } catch {
      callbacks.current.onUnavailable();
    }
  }, []);
  useEffect(() => {
    actions.current?.updateGraph({
      model: props.model,
      branch: props.branch,
      nodes: displayedNodes,
    });
  }, [props.model, props.branch, displayedNodes]);
  useEffect(() => {
    actions.current?.highlight(
      props.selectedNodeId,
      props.selectedEdgeId,
      props.display,
    );
  }, [props.selectedNodeId, props.selectedEdgeId, props.display]);
  useEffect(() => {
    if (labels.current.has(hovered) || !hovered) actions.current?.invalidate();
  }, [hovered]);

  const hasAnchors = displayedNodes.some((node) => node.anchor);
  const visibleLabels = displayedNodes.filter(
    (node, index) =>
      node.source.entityKind === "institution" ||
      node.anchor ||
      node.detail ||
      (node.membership === "included" &&
        node.source.entityKind === "document" &&
        !hasAnchors &&
        index < 16) ||
      props.branch?.children
        .slice(0, 8)
        .some((child) => child.id === node.id) ||
      node.id === props.selectedNodeId ||
      node.id === hovered,
  );
  return (
    <>
      <div
        className="earth-nebula"
        ref={host}
        data-earth-hierarchy-count={props.branch?.children.length ?? 0}
      >
        <div className="earth-nebula-labels">
          {visibleLabels.map((node) => (
            <button
              aria-pressed={node.id === props.selectedNodeId}
              className={`earth-nebula-label ${node.membership}${node.source.entityKind !== "document" && node.membership === "included" ? " hierarchy" : ""}${node.source.entityKind === "institution" ? " institution" : ""}${props.display && !earthNodeDisplay(props.display, node.source).matched ? " filtered-out" : ""}`}
              data-earth-match={
                props.display
                  ? earthNodeDisplay(props.display, node.source).matched
                  : true
              }
              style={{
                color: props.display
                  ? earthNodeDisplay(props.display, node.source).matched
                    ? earthNodeDisplay(props.display, node.source).color
                    : "#73808c"
                  : undefined,
              }}
              key={node.id}
              title={node.source.title ?? node.label}
              onClick={() => props.onSelectNode(node.id)}
              ref={(element) => {
                if (element) labels.current.set(node.id, element);
                else labels.current.delete(node.id);
              }}
              type="button"
            >
              {node.source.entityKind === "institution"
                ? `✦ ${node.label}`
                : node.label}
            </button>
          ))}
        </div>
      </div>
      <div className="earth-camera-controls" aria-label="Nebula controls">
        <button
          aria-label="Zoom in"
          onClick={() => actions.current?.zoom(0.85)}
          type="button"
        >
          <Plus size={17} />
        </button>
        <button
          aria-label="Zoom out"
          onClick={() => actions.current?.zoom(1.18)}
          type="button"
        >
          <Minus size={17} />
        </button>
        <button
          aria-label="Reset universe view"
          onClick={() => actions.current?.reset()}
          type="button"
        >
          <RotateCcw size={16} />
        </button>
      </div>
    </>
  );
}
