import { CDM } from "../contract/metadata-graph";

export const familyPredicates = new Set([
  `${CDM}resource_legal_based_on_resource_legal`,
  `${CDM}resource_legal_completes_resource_legal`,
]);

/** Editorial reachability only. Returns tags, never new legal relationship triples. */
export function familyMembership(
  edges: Iterable<{ source: string; target: string; predicate: string }>,
  seeds: ReadonlyMap<string, string[]>,
  overrides: ReadonlySet<string> = new Set(seeds.keys()),
) {
  const members = new Map(
    [...seeds].map(([id, families]) => [id, [...families]]),
  );
  const links = [...edges].filter((edge) =>
    familyPredicates.has(edge.predicate),
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of links) {
      if (overrides.has(edge.source)) continue;
      const parent = members.get(edge.target);
      if (!parent?.length) continue;
      const child = members.get(edge.source) ?? [];
      for (const family of parent)
        if (!child.includes(family)) {
          child.push(family);
          changed = true;
        }
      members.set(edge.source, child);
    }
  }
  for (const families of members.values()) families.sort();
  return members;
}

export function workIdentities() {
  const byCelex = new Map<string, string>();
  const byUri = new Map<string, string>();
  return {
    byCelex,
    add(celex: string, uri: string) {
      if (
        (byCelex.has(celex) && byCelex.get(celex) !== uri) ||
        (byUri.has(uri) && byUri.get(uri) !== celex)
      )
        throw new Error(
          `Conflicting official Work / CELEX identity: ${celex} / ${uri}`,
        );
      byCelex.set(celex, uri);
      byUri.set(uri, celex);
    },
  };
}
