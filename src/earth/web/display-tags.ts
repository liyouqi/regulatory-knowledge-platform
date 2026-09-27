import tags from "../../../data/earth/display-tags.json";
import type { EarthNode } from "../contract/earth-contract";
import type { EarthRenderModel, EarthVisualNode } from "./render-model";

interface WorkTags {
  family: string;
  sectors: string[];
  color?: string;
}

export const earthSectors = tags.sectors;
export const earthFamilies = tags.families;
export const earthWorkTags: Record<string, WorkTags> = tags.works;
const families: Record<string, { label: string; color: string }> =
  tags.families;

export interface EarthDisplay {
  filtered: boolean;
  nodes: Map<string, { color: string; matched: boolean }>;
}

/** Editorial display only: no node, official edge or layout is changed. */
export function createEarthDisplay(
  model: EarthRenderModel,
  works: EarthNode[],
  sector: string,
  family: string,
): EarthDisplay {
  const nodes: EarthDisplay["nodes"] = new Map();
  for (const node of [...works, ...model.nodes.map((item) => item.source)]) {
    if (!("officialIdentity" in node)) continue;
    const entry = earthWorkTags[node.officialIdentity.celex ?? ""];
    nodes.set(node.id, {
      color:
        entry?.color ??
        families[entry?.family ?? ""]?.color ??
        (node.membership === "included" ? "#ebc78c" : "#83afc8"),
      matched:
        (!sector || Boolean(entry?.sectors.includes(sector))) &&
        (!family || entry?.family === family),
    });
  }
  return { filtered: Boolean(sector || family), nodes };
}

export function earthNodeDisplay(display: EarthDisplay, node: EarthVisualNode) {
  return (
    display.nodes.get(node.id) ??
    (node.membership === "included"
      ? display.nodes.get(node.workId)
      : undefined) ?? {
      color: node.membership === "included" ? "#ebc78c" : "#83afc8",
      matched: !display.filtered,
    }
  );
}
