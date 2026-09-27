import type { EarthRenderModel } from "../../render-model";

export type NebulaPosition = [number, number, number];

function seed(id: string): number {
  let value = 2166136261;
  for (const character of id) {
    value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  }
  return (value >>> 0) / 4294967296;
}

/** Display coordinates only. Proximity never creates or classifies a relation. */
export function layoutNebula(
  model: EarthRenderModel,
): Map<string, NebulaPosition> {
  const positions = new Map<string, NebulaPosition>();
  const included = model.nodes
    .filter((node) => node.membership === "included")
    .sort((a, b) => a.id.localeCompare(b.id));
  const scale = Math.max(1, Math.sqrt(included.length / 10) * 0.55);
  if (included.some((node) => node.group)) {
    const groups = new Map<string, typeof included>();
    const institutions = included.filter(
      (node) => node.source.entityKind === "institution",
    );
    for (const node of included.filter(
      (node) => node.source.entityKind !== "institution",
    )) {
      const key = node.group ?? "other";
      const members = groups.get(key) ?? [];
      members.push(node);
      groups.set(key, members);
    }
    const ordered = [...groups].sort(([a], [b]) => a.localeCompare(b));
    ordered.forEach(([, members], groupIndex) => {
      const angle = groupIndex * 2.399963 + 0.6;
      const radius =
        (ordered.length === 1
          ? 0
          : 4 + Math.sqrt((groupIndex + 0.5) / ordered.length) * 3) * scale;
      const centre: NebulaPosition = [
        Math.cos(angle) * radius * 1.25,
        Math.sin(angle) * radius * 0.8,
        Math.sin(groupIndex * 1.7) * 1.3 * scale,
      ];
      members.sort(
        (a, b) =>
          Number(Boolean(b.anchor)) - Number(Boolean(a.anchor)) ||
          a.id.localeCompare(b.id),
      );
      members.forEach((node, index) => {
        const localAngle = index * 2.399963;
        const localRadius =
          index === 0 && node.anchor
            ? 0
            : (0.2 + Math.sqrt((index + 0.5) / members.length) * 2.3) * scale;
        positions.set(node.id, [
          centre[0] + Math.cos(localAngle) * localRadius,
          centre[1] + Math.sin(localAngle) * localRadius * 0.7,
          centre[2] + (seed(node.id) - 0.5) * 1.3 * scale,
        ]);
      });
    });
    institutions.forEach((node, index) => {
      const angle = (index / institutions.length) * Math.PI * 2;
      positions.set(node.id, [
        Math.cos(angle) * 10.5 * scale,
        Math.sin(angle) * 7.2 * scale,
        (seed(node.id) - 0.5) * 3 * scale,
      ]);
    });
  } else
    included.forEach((node, index) => {
      const angle = index * 2.399963 + 0.6;
      const radius =
        included.length === 1
          ? 0
          : 1 + Math.sqrt((index + 0.7) / included.length) * 4.1;
      positions.set(node.id, [
        Math.cos(angle) * radius * 1.45 * scale,
        Math.sin(angle) * radius * 0.85 * scale,
        Math.sin(index * 1.7) * 1.15 * scale,
      ]);
    });
  const includedIds = new Set(included.map((node) => node.id));
  const neighbours = new Map<string, Set<string>>();
  for (const edge of model.edges) {
    for (const [node, other] of [
      [edge.source, edge.target],
      [edge.target, edge.source],
    ]) {
      if (!includedIds.has(other)) continue;
      const anchors = neighbours.get(node) ?? new Set<string>();
      anchors.add(other);
      neighbours.set(node, anchors);
    }
  }
  for (const node of model.nodes.filter(
    (item) => item.membership === "boundary",
  )) {
    const anchors =
      node.satelliteOf && positions.has(node.satelliteOf)
        ? [node.satelliteOf]
        : [...(neighbours.get(node.id) ?? [])].sort();
    const centre: NebulaPosition = [0, 0, 0];
    for (const id of anchors) {
      const position = positions.get(id);
      if (position)
        for (let axis = 0; axis < 3; axis++)
          centre[axis] += position[axis] / anchors.length;
    }
    const siblings = node.satelliteOf
      ? model.nodes
          .filter((item) => item.satelliteOf === node.satelliteOf)
          .sort((a, b) => a.id.localeCompare(b.id))
      : [];
    const index = siblings.findIndex((item) => item.id === node.id);
    const angle = index >= 0 ? index * 2.399963 : seed(node.id) * Math.PI * 2;
    const radius =
      (index >= 0
        ? 0.85 + Math.sqrt((index + 0.5) / siblings.length) * 1.45
        : 0.5 + seed(`${node.id}:radius`) * 1.15) * scale;
    positions.set(node.id, [
      centre[0] + Math.cos(angle) * radius,
      centre[1] + Math.sin(angle) * radius * 0.7,
      centre[2] + (seed(`${node.id}:depth`) - 0.5) * 1.3 * scale,
    ]);
  }
  return positions;
}
