import { describe, expect, it } from "vitest";
import type { EarthNode } from "../../../contract/earth-contract";
import type { EarthRenderModel } from "../../render-model";
import { projectEarthOverview } from "../../render-model";
import { layoutNebula } from "./nebula-layout";

function model(): EarthRenderModel {
  const works: EarthNode[] = ["32022R2554", "32016R0679"].map((celex) => ({
    id: `earth:work:${celex}`,
    workId: `earth:work:${celex}`,
    membership: "included",
    entityKind: "document",
    label: celex,
    measureType: "primary-act",
    officialIdentity: { celex, workUri: `https://example.test/${celex}` },
  }));
  const boundary: EarthNode = {
    id: "earth:work:boundary",
    membership: "boundary",
    entityKind: "external-work",
    label: "Boundary",
    officialIdentity: { workUri: "https://example.test/boundary" },
    sourceUrl: "https://example.test/boundary",
  };
  return projectEarthOverview({
    works,
    boundaryNodes: [boundary],
    aggregates: [
      {
        id: "earth-aggregate:test",
        source: works[0].id,
        target: boundary.id,
        relationTypes: ["AMENDS"],
        provenances: ["CELLAR_METADATA"],
        relationshipIds: ["relationship:test"],
        count: 1,
      },
    ],
  });
}

describe("Nebula presentation layout", () => {
  it("keeps the same coordinates across response ordering and adds no graph facts", () => {
    const original = model();
    const snapshot = JSON.stringify(original);
    const reversed = {
      nodes: [...original.nodes].reverse(),
      edges: [...original.edges].reverse(),
    };
    const positions = layoutNebula(original);
    expect(positions).toEqual(layoutNebula(reversed));
    expect([...positions.keys()].sort()).toEqual(
      original.nodes.map(({ id }) => id).sort(),
    );
    expect(JSON.stringify(original)).toBe(snapshot);
    for (const position of positions.values())
      expect(position.every(Number.isFinite)).toBe(true);
  });

  it("keeps an existing boundary star stable when another boundary page item is added", () => {
    const original = model();
    const extra = { ...original.nodes[2], id: "earth:work:another-boundary" };
    const positions = layoutNebula(original);
    const expanded = layoutNebula({
      ...original,
      nodes: [...original.nodes, extra],
    });
    for (const [id, position] of positions)
      expect(expanded.get(id)).toEqual(position);
    expect(layoutNebula({ nodes: [], edges: [] }).size).toBe(0);
  });

  it("keeps a family satellite beside its explicit display parent when unrelated connections change", () => {
    const original = model();
    original.nodes[2].satelliteOf = original.nodes[0].id;
    const positions = layoutNebula(original);
    const expanded = {
      ...original,
      edges: [
        ...original.edges,
        {
          ...original.edges[0],
          id: "another-connection",
          source: original.nodes[1].id,
        },
      ],
    };
    expect(layoutNebula(expanded).get(original.nodes[2].id)).toEqual(
      positions.get(original.nodes[2].id),
    );
    expect(
      layoutNebula({
        nodes: [...original.nodes].reverse(),
        edges: [...original.edges].reverse(),
      }),
    ).toEqual(positions);
  });
});
