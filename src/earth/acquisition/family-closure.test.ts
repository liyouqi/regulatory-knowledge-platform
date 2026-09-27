import { describe, expect, it } from "vitest";
import { CDM } from "../contract/metadata-graph";
import { familyMembership, workIdentities } from "./family-closure";

const basis = `${CDM}resource_legal_based_on_resource_legal`;
describe("Earth automatic editorial family closure", () => {
  it("traverses multiple waves and cycles, including a missing-English intermediary, without adding legal triples", () => {
    const seeds = new Map([["root", ["dora"]]]);
    const edges = [
      { source: "grandchild", target: "no-English-title", predicate: basis },
      { source: "no-English-title", target: "child", predicate: basis },
      { source: "child", target: "root", predicate: basis },
      { source: "child", target: "grandchild", predicate: basis },
      {
        source: "citation-only",
        target: "child",
        predicate: `${CDM}work_cites_work`,
      },
      {
        source: "amendment-only",
        target: "root",
        predicate: `${CDM}resource_legal_amends_resource_legal`,
      },
    ];
    const snapshot = JSON.stringify(edges);
    const members = familyMembership(edges, seeds);
    expect([...members.keys()].sort()).toEqual([
      "child",
      "grandchild",
      "no-English-title",
      "root",
    ]);
    expect(members.get("grandchild")).toEqual(["dora"]);
    expect(JSON.stringify(edges)).toBe(snapshot);
    expect(familyMembership(edges.slice(0, 2), seeds).has("grandchild")).toBe(
      false,
    );
  });

  it("preserves explicit overrides and sorted multiple inferred families independently of response order", () => {
    const seeds = new Map([
      ["a", ["dora"]],
      ["b", ["mica"]],
      ["explicit", ["emir"]],
    ]);
    const edges = [
      { source: "shared", target: "a", predicate: basis },
      { source: "shared", target: "b", predicate: basis },
      { source: "explicit", target: "shared", predicate: basis },
      { source: "child", target: "explicit", predicate: basis },
    ];
    const forward = familyMembership(edges, seeds);
    expect(forward.get("shared")).toEqual(["dora", "mica"]);
    expect(forward.get("explicit")).toEqual(["emir"]);
    expect(forward.get("child")).toEqual(["emir"]);
    const reverse = familyMembership([...edges].reverse(), seeds);
    for (const [id, families] of forward)
      expect(reverse.get(id)).toEqual(families);
  });

  it("inherits sectors through raw paths, not sibling family roots, while respecting explicit overrides", () => {
    const seeds = new Map([
      ["root-a", ["banking"]],
      ["root-b", ["crypto"]],
      ["directory-child", ["insurance"]],
    ]);
    const edges = [
      { source: "no-English-title", target: "root-a", predicate: basis },
      {
        source: "directory-child",
        target: "no-English-title",
        predicate: basis,
      },
      { source: "root-a", target: "root-b", predicate: basis },
    ];
    const sectors = familyMembership(
      edges,
      seeds,
      new Set(["root-a", "root-b"]),
    );
    expect(sectors.get("root-a")).toEqual(["banking"]);
    expect(sectors.get("directory-child")).toEqual(["banking", "insurance"]);
  });

  it("rejects conflicting Work URI and CELEX aliases instead of silently merging identities", () => {
    const identities = workIdentities();
    identities.add("32022R2554", "https://example.test/work/dora");
    identities.add("32022R2554", "https://example.test/work/dora");
    expect(() =>
      identities.add("32022R2554", "https://example.test/other-work"),
    ).toThrow("Conflicting");
    expect(() =>
      identities.add("32022L2556", "https://example.test/work/dora"),
    ).toThrow("Conflicting");
  });
});
