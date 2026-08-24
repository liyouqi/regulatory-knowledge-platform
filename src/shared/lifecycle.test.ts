import { describe, expect, it } from "vitest";
import { lifecycleEndpointSchema } from "./lifecycle";
import { relationshipGraphNodeSchema } from "./relationship-graph";

const externalWork = {
  entityId: "eu:32024R2956R(01)",
  celex: "32024R2956R(01)",
  documentId: "eu:32024R2956R(01)",
  documentShortName: "CELEX 32024R2956R(01)",
  kind: "external-work",
  label: "Corrigendum 1",
  title: null,
  sourceUrl:
    "https://publications.europa.eu/resource/cellar/2dfa4c35-94f2-11f0-97c8-01aa75ed71a1",
  availability: "external",
} as const;

describe("external lifecycle Work contracts", () => {
  it("does not allow an external Work to claim a loaded Document path", () => {
    expect(lifecycleEndpointSchema.parse(externalWork)).toEqual(externalWork);
    expect(
      lifecycleEndpointSchema.safeParse({
        ...externalWork,
        path: "/read/not-loaded",
      }).success,
    ).toBe(false);
    expect(
      lifecycleEndpointSchema.safeParse({
        ...externalWork,
        availability: "loaded",
      }).success,
    ).toBe(false);
  });

  it("allows an external Work only as a metadata-only graph neighbor", () => {
    const graphNode = {
      ...externalWork,
      role: "neighbor",
    };
    const {
      celex: _celex,
      availability: _availability,
      ...expected
    } = graphNode;
    expect(relationshipGraphNodeSchema.parse(expected)).toEqual(expected);
    expect(
      relationshipGraphNodeSchema.safeParse({
        ...expected,
        role: "center",
      }).success,
    ).toBe(false);
    expect(
      relationshipGraphNodeSchema.safeParse({
        ...expected,
        path: "/read/not-loaded",
      }).success,
    ).toBe(false);
  });
});
