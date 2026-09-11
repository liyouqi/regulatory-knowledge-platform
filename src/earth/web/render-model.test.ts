import { describe, expect, it } from "vitest";
import type { EarthNode } from "../contract/earth-contract";
import {
  projectEarthExactNeighbourhood,
  projectEarthOverview,
} from "./render-model";

const included: EarthNode = {
  id: "earth:work:32022R2554",
  membership: "included",
  entityKind: "document",
  workId: "earth:work:32022R2554",
  label: "DORA",
  measureType: "primary-act",
  officialIdentity: {
    celex: "32022R2554",
    workUri: "https://publications.europa.eu/resource/cellar/dora",
    expressionUri: "https://publications.europa.eu/resource/cellar/dora-eng",
  },
};

const boundary: EarthNode = {
  id: "earth:work:32022R2554R(01)",
  membership: "boundary",
  entityKind: "external-work",
  label: "CELEX 32022R2554R(01)",
  sourceUrl: "https://publications.europa.eu/resource/cellar/corrigendum",
  officialIdentity: {
    celex: "32022R2554R(01)",
    workUri: "https://publications.europa.eu/resource/cellar/corrigendum",
  },
};

describe("Earth renderer projection", () => {
  it("preserves official node, edge and exact-relationship identities", () => {
    const model = projectEarthOverview({
      works: [included],
      boundaryNodes: [boundary],
      aggregates: [
        {
          id: "earth-aggregate:corrigendum:dora",
          source: boundary.id,
          target: included.id,
          relationTypes: ["CORRECTS"],
          provenances: ["CELLAR_METADATA"],
          relationshipIds: ["relationship:official"],
          count: 1,
        },
      ],
    });
    expect(model.nodes.map(({ id }) => id)).toEqual([included.id, boundary.id]);
    expect(model.edges[0]).toMatchObject({
      source: boundary.id,
      target: included.id,
      label: "CORRECTS",
      relationshipIds: ["relationship:official"],
    });
  });

  it("fails closed for unknown endpoints and inconsistent aggregate counts", () => {
    expect(() =>
      projectEarthOverview({
        works: [included],
        boundaryNodes: [],
        aggregates: [
          {
            id: "earth-aggregate:invalid",
            source: included.id,
            target: "earth:work:unknown",
            relationTypes: ["AMENDS"],
            provenances: ["CELLAR_METADATA"],
            relationshipIds: ["relationship:official"],
            count: 1,
          },
        ],
      }),
    ).toThrow("unknown endpoint");
    expect(() =>
      projectEarthOverview({
        works: [included],
        boundaryNodes: [boundary],
        aggregates: [
          {
            id: "earth-aggregate:invalid-count",
            source: included.id,
            target: boundary.id,
            relationTypes: ["AMENDS"],
            provenances: ["CELLAR_METADATA"],
            relationshipIds: ["relationship:one"],
            count: 2,
          },
        ],
      }),
    ).toThrow("invalid fact count");
  });

  it("projects only exact evidence-bearing neighbourhood relationships", () => {
    const model = projectEarthExactNeighbourhood({
      nodes: [included, boundary],
      relationships: [
        {
          projection: "exact",
          id: "relationship:official",
          source: included.id,
          target: boundary.id,
          relationType: "AMENDS",
          provenance: "CELLAR_METADATA",
          evidence: {
            text: "http://publications.europa.eu/ontology/cdm#resource_legal_amends_resource_legal",
            locator: "test-only-locator",
            sourceUrl: included.officialIdentity.workUri,
          },
        },
      ],
    });
    expect(model.edges).toHaveLength(1);
    expect(model.edges[0]).toMatchObject({
      id: "relationship:official",
      relationshipIds: ["relationship:official"],
      count: 1,
    });
    expect(() =>
      projectEarthExactNeighbourhood({
        nodes: [included, boundary],
        relationships: [
          {
            projection: "aggregate",
            id: "earth-aggregate:invalid",
            source: included.id,
            target: boundary.id,
            relationTypes: ["AMENDS"],
            provenances: ["CELLAR_METADATA"],
            relationshipIds: ["relationship:official"],
            count: 1,
          },
        ],
      }),
    ).toThrow("received an aggregate edge");
  });
});
