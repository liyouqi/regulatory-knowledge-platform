import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import tags from "../../../data/earth/display-tags.json";
import scope from "../../../data/earth/source-scope.json";
import universe from "../../../data/earth/universes/eu-banking-10.json";
import {
  CDM,
  type MetadataGraphNode,
  graphPredicateLabels,
  metadataGraphSchema,
} from "../contract/metadata-graph";
import { familyMembership, workIdentities } from "./family-closure";

type Binding = Record<string, { value: string }>;
interface Work {
  workUri: string;
  celex: string;
  titles: string[];
  directories: string[];
  types: string[];
  authors: string[];
  dates: string[];
  inForce: string[];
}
const prefix = `PREFIX cdm: <${CDM}>\nPREFIX owl: <http://www.w3.org/2002/07/owl#>\nPREFIX skos: <http://www.w3.org/2004/02/skos/core#>`;
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const workId = (celex: string) => `earth:work:${celex}`;
const iriList = (uris: string[]) => uris.map((uri) => `<${uri}>`).join(" ");
const chunks = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );

async function main() {
  const resume = process.argv.indexOf("--resume");
  const rawDirectory =
    resume >= 0
      ? process.argv[resume + 1]
      : `data/raw/earth/graph/${new Date().toISOString().replaceAll(/[:.]/g, "-")}`;
  const root = resolve("data/raw/earth/graph");
  if (!rawDirectory) throw new Error("Missing snapshot path.");
  const contained = (path: string) => {
    const part = relative(root, path);
    return part !== "" && !part.startsWith("..") && !isAbsolute(part);
  };
  if (!contained(resolve(rawDirectory)))
    throw new Error("Snapshot must be below the Earth graph raw root.");
  await mkdir(rawDirectory, { recursive: true });
  if (!contained(await realpath(rawDirectory)))
    throw new Error("Snapshot symlink escapes the Earth graph raw root.");
  const version = "earth-family-closure-1";
  const configurationHash = hash(
    JSON.stringify({ tags, scope, universe, version }),
  );
  const inputPath = `${rawDirectory}/inputs.json`;
  if (resume < 0) {
    const census = JSON.parse(
      await readFile("data/artifacts/earth/census.json", "utf8"),
    );
    await writeFile(
      inputPath,
      JSON.stringify(
        {
          version,
          configurationHash,
          configuration: { tags, scope, universe, version },
          censusHash: hash(JSON.stringify(census)),
          census,
        },
        null,
        2,
      ),
    );
    const graphPath = "data/artifacts/earth/graph.json";
    await writeFile(
      `${rawDirectory}/baseline.json`,
      existsSync(graphPath) ? await readFile(graphPath, "utf8") : "null",
    );
  }
  if (!existsSync(inputPath))
    throw new Error(
      "This old snapshot has no frozen inputs. Start one fresh earth:refresh run; new runs support --resume.",
    );
  const inputBytes = await readFile(inputPath, "utf8");
  const inputs = JSON.parse(inputBytes) as {
    version: string;
    configurationHash: string;
    configuration: unknown;
    censusHash: string;
    census: { retrievedAt: string; works: Work[] };
  };
  if (
    inputs.version !== version ||
    inputs.configurationHash !== configurationHash ||
    hash(JSON.stringify(inputs.configuration)) !== configurationHash ||
    hash(JSON.stringify(inputs.census)) !== inputs.censusHash
  )
    throw new Error(
      "Snapshot configuration changed. Start a new refresh instead of mixing resume inputs.",
    );
  const census = inputs.census;
  console.log(
    `Earth graph snapshot: ${rawDirectory}; resume with npm run earth:refresh -- --resume ${rawDirectory}`,
  );
  const queryHashes: string[] = [hash(inputBytes)];
  const queryRecords: Array<{
    queryHash: string;
    responseHash: string;
    retrievedAt: string;
  }> = [];
  async function query(name: string, sparql: string): Promise<Binding[]> {
    const digest = hash(sparql);
    queryHashes.push(digest);
    const base = `${rawDirectory}/${name}-${digest.slice(0, 12)}`;
    let raw: string;
    let record: {
      queryHash: string;
      responseHash: string;
      retrievedAt: string;
    };
    if (existsSync(`${base}.meta.json`)) {
      record = JSON.parse(await readFile(`${base}.meta.json`, "utf8"));
      raw = await readFile(`${base}.json`, "utf8");
      if (
        (await readFile(`${base}.rq`, "utf8")) !== sparql ||
        record.queryHash !== digest ||
        record.responseHash !== hash(raw)
      )
        throw new Error(`Cached query/response hash mismatch: ${base}`);
    } else {
      await writeFile(`${base}.rq`, sparql);
      const response = await fetch(scope.endpoint, {
        method: "POST",
        headers: {
          Accept: "application/sparql-results+json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ query: sparql }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok)
        throw new Error(
          `CELLAR HTTP ${response.status}; resume with --resume ${rawDirectory}`,
        );
      raw = await response.text();
      const parsed = JSON.parse(raw) as { results?: { bindings?: Binding[] } };
      if (!Array.isArray(parsed.results?.bindings))
        throw new Error("Unexpected CELLAR response.");
      await writeFile(`${base}.json`, raw);
      record = {
        queryHash: digest,
        responseHash: hash(raw),
        retrievedAt: new Date().toISOString(),
      };
      await writeFile(`${base}.meta.json.next`, JSON.stringify(record));
      await rename(`${base}.meta.json.next`, `${base}.meta.json`);
    }
    queryHashes.push(hash(raw));
    queryRecords.push(record);
    return (JSON.parse(raw) as { results: { bindings: Binding[] } }).results
      .bindings;
  }
  async function pages(name: string, sparql: string): Promise<Binding[]> {
    const result: Binding[] = [];
    for (let offset = 0; ; offset += 1000) {
      const rows = await query(
        `${name}-${offset}`,
        `${sparql}\nLIMIT 1000 OFFSET ${offset}`,
      );
      result.push(...rows);
      if (rows.length < 1000) return result;
    }
  }
  const identities = workIdentities();
  const works = new Map<string, Work>();
  for (const work of census.works) {
    identities.add(work.celex, work.workUri);
    works.set(work.celex, work);
  }
  function mergeMetadata(rows: Binding[], target: Map<string, Work>) {
    for (const row of rows) {
      const celex = row.celex.value;
      identities.add(celex, row.work.value);
      const item = target.get(celex) ?? {
        workUri: row.work.value,
        celex,
        titles: [],
        directories: [],
        types: [],
        authors: [],
        dates: [],
        inForce: [],
      };
      if (item.workUri !== row.work.value)
        throw new Error(
          `Work identity collision for ${celex}: ${item.workUri} / ${row.work.value}`,
        );
      for (const [field, variable] of [
        ["titles", "title"],
        ["directories", "directory"],
        ["types", "type"],
        ["authors", "author"],
        ["dates", "date"],
        ["inForce", "inForce"],
      ] as const) {
        const value = row[variable]?.value;
        if (value && !item[field].includes(value)) item[field].push(value);
      }
      target.set(celex, item);
    }
  }
  const metadataBody = `?expression cdm:expression_belongs_to_work ?work ; cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/ENG> .
OPTIONAL { ?expression cdm:expression_title ?title }
OPTIONAL { ?work cdm:resource_legal_is_about_concept_directory-code ?directory }
OPTIONAL { ?work cdm:work_has_resource-type ?type }
OPTIONAL { ?work cdm:work_created_by_agent ?author }
OPTIONAL { ?work cdm:work_date_document ?date }
OPTIONAL { ?work cdm:resource_legal_in-force ?inForce }`;
  const missingSeeds = Object.keys(tags.works).filter(
    (celex) => !works.has(celex),
  );
  if (missingSeeds.length) {
    const rows = await pages(
      "seeds",
      `${prefix}\nSELECT DISTINCT ?work ?celex ?title ?directory ?type ?author ?date ?inForce WHERE {
VALUES ?celexUri { ${iriList(missingSeeds.map((celex) => `http://publications.europa.eu/resource/celex/${celex}`))} }
?work owl:sameAs ?celexUri ; cdm:resource_legal_id_celex ?celex . OPTIONAL { ${metadataBody} }
} ORDER BY ?work ?celex ?title ?directory ?type ?author ?date ?inForce`,
    );
    mergeMetadata(rows, works);
  }
  if (Object.keys(tags.works).some((celex) => !works.has(celex)))
    throw new Error(
      "Some configured official seed identities could not be resolved.",
    );
  const scopeWorks = [...works.values()].sort((a, b) =>
    a.celex.localeCompare(b.celex),
  );
  const rawEdges = new Map<
    string,
    {
      source: string;
      target: string;
      predicate: string;
      sourceUri: string;
      targetUri: string;
    }
  >();
  async function acquireRelations(name: string, uris: string[]) {
    const rows = await pages(
      name,
      `${prefix}\nSELECT DISTINCT ?source ?sourceCelex ?predicate ?target ?targetCelex WHERE {
VALUES ?seed { ${iriList(uris)} }
{ ?seed ?predicate ?target . BIND(?seed AS ?source) } UNION { ?source ?predicate ?seed . BIND(?seed AS ?target) }
?source cdm:resource_legal_id_celex ?sourceCelex . ?target cdm:resource_legal_id_celex ?targetCelex .
FILTER(STRSTARTS(STR(?sourceCelex),"3") && STRSTARTS(STR(?targetCelex),"3"))
FILTER(STRSTARTS(STR(?predicate),"${CDM}"))
FILTER(?source != ?target)
} ORDER BY ?source ?sourceCelex ?predicate ?target ?targetCelex`,
    );
    for (const row of rows) {
      const edge = {
        source: row.sourceCelex.value,
        target: row.targetCelex.value,
        predicate: row.predicate.value,
        sourceUri: row.source.value,
        targetUri: row.target.value,
      };
      const key = [edge.sourceUri, edge.predicate, edge.targetUri].join("|");
      identities.add(edge.source, edge.sourceUri);
      identities.add(edge.target, edge.targetUri);
      const old = rawEdges.get(key);
      if (old && (old.source !== edge.source || old.target !== edge.target))
        throw new Error("Conflicting CELEX alias on a relation.");
      rawEdges.set(key, edge);
    }
  }
  const scanned = new Set<string>();
  const edgeBatches = chunks(scopeWorks, 80);
  for (let index = 0; index < edgeBatches.length; index++) {
    const uris = edgeBatches[index].map((work) => work.workUri);
    await acquireRelations(`edges-${index}`, uris);
    for (const uri of uris) scanned.add(uri);
    console.log(
      `Relations ${index + 1}/${edgeBatches.length}: ${rawEdges.size} distinct metadata triples`,
    );
  }
  const seeds = new Map(
    Object.entries(tags.works).map(([celex, value]) => [celex, [value.family]]),
  );
  let memberships = familyMembership(rawEdges.values(), seeds);
  const waves: Array<{
    wave: number;
    scannedWorks: number;
    newFamilyWorks: number;
  }> = [];
  for (let wave = 1; ; wave++) {
    const frontier = [...memberships.keys()]
      .map((celex) => identities.byCelex.get(celex))
      .filter(
        (uri): uri is string => Boolean(uri) && !scanned.has(uri as string),
      )
      .sort();
    if (!frontier.length) break;
    const count = memberships.size;
    const batches = chunks(frontier, 80);
    for (let index = 0; index < batches.length; index++) {
      await acquireRelations(`family-${wave}-${index}`, batches[index]);
      for (const uri of batches[index]) scanned.add(uri);
      console.log(
        `Family closure ${wave}, batch ${index + 1}/${batches.length}: ${scanned.size} scanned Works`,
      );
    }
    memberships = familyMembership(rawEdges.values(), seeds);
    waves.push({
      wave,
      scannedWorks: frontier.length,
      newFamilyWorks: memberships.size - count,
    });
  }
  await writeFile(
    `${rawDirectory}/relations.json`,
    JSON.stringify([...rawEdges.values()]),
  );
  const excludedPredicates: Record<string, number> = {};
  const supported = [...rawEdges.values()].filter((edge) => {
    if (graphPredicateLabels[edge.predicate]) return true;
    excludedPredicates[edge.predicate] =
      (excludedPredicates[edge.predicate] ?? 0) + 1;
    return false;
  });
  const boundaries = new Map<string, Work>();
  const outside = new Map<string, string>();
  for (const edge of supported)
    for (const [celex, uri] of [
      [edge.source, edge.sourceUri],
      [edge.target, edge.targetUri],
    ]) {
      const existing = works.get(celex);
      if (existing && existing.workUri !== uri)
        throw new Error(`Endpoint identity conflict: ${celex}`);
      const previous = outside.get(celex);
      if (previous && previous !== uri)
        throw new Error(`Boundary identity conflict: ${celex}`);
      if (!existing) outside.set(celex, uri);
    }
  const outsideBatches = chunks([...outside.values()].sort(), 80);
  for (let index = 0; index < outsideBatches.length; index++) {
    const rows = await pages(
      `boundary-${index}`,
      `${prefix}\nSELECT DISTINCT ?work ?celex ?title ?directory ?type ?author ?date ?inForce WHERE {
VALUES ?work { ${iriList(outsideBatches[index])} } ?work cdm:resource_legal_id_celex ?celex . ${metadataBody}
} ORDER BY ?work ?celex ?title ?directory ?type ?author ?date ?inForce`,
    );
    mergeMetadata(rows, boundaries);
    console.log(
      `Boundary metadata ${index + 1}/${outsideBatches.length}: ${boundaries.size} English Works`,
    );
  }
  const allWorks = [...scopeWorks, ...boundaries.values()];
  const nodeById = new Map<string, MetadataGraphNode>();
  const explicitTags: Record<
    string,
    { label?: string; family: string; sectors: string[] }
  > = tags.works;
  const labels = new Map(
    universe.members.map((member) => [member.celex, member.label]),
  );
  const sectorSeeds = new Map<string, string[]>();
  for (const work of allWorks) {
    const sectors = new Set(explicitTags[work.celex]?.sectors ?? []);
    for (const directory of work.directories) {
      const code = directory.split("/").at(-1)?.replaceAll(".", "");
      if (code === "06202020") sectors.add("banking");
      if (code === "06202010") sectors.add("insurance");
      if (code === "06202025") sectors.add("securities");
    }
    sectorSeeds.set(work.celex, [...sectors]);
  }
  const sectorMembership = familyMembership(
    rawEdges.values(),
    sectorSeeds,
    new Set(Object.keys(explicitTags)),
  );
  for (const work of allWorks) {
    if (!work.titles.length) continue;
    nodeById.set(workId(work.celex), {
      id: workId(work.celex),
      kind: "work",
      label:
        labels.get(work.celex) ?? explicitTags[work.celex]?.label ?? work.celex,
      title: [...work.titles].sort()[0],
      uri: work.workUri,
      celex: work.celex,
      included: works.has(work.celex),
      sectors: sectorMembership.get(work.celex) ?? [],
      families: memberships.get(work.celex) ?? [],
      types: work.types,
      inForce: work.inForce,
    });
  }
  const edges: Array<{
    id: string;
    source: string;
    target: string;
    predicate: string;
  }> = [];
  let missingEnglishBoundary = 0;
  for (const edge of supported) {
    const source = workId(edge.source);
    const target = workId(edge.target);
    if (!nodeById.has(source) || !nodeById.has(target)) {
      missingEnglishBoundary++;
      continue;
    }
    edges.push({
      id: `earth-metadata-edge:${hash([edge.sourceUri, edge.predicate, edge.targetUri].join("|"))}`,
      source,
      target,
      predicate: edge.predicate,
    });
  }
  const creatorWorks = allWorks.filter(
    (work) =>
      nodeById.has(workId(work.celex)) &&
      (works.has(work.celex) || memberships.has(work.celex)),
  );
  const agentUris = [
    ...new Set(creatorWorks.flatMap((work) => work.authors)),
  ].sort();
  const agentRows = await query(
    "institutions",
    `${prefix}\nSELECT DISTINCT ?agent ?label WHERE { VALUES ?agent { ${iriList(agentUris)} } ?agent skos:inScheme <http://publications.europa.eu/resource/authority/corporate-body> ; skos:prefLabel ?label . FILTER(LANG(?label)="en") } ORDER BY ?agent ?label`,
  );
  const institutions = new Map<string, string>();
  for (const row of agentRows) {
    const uri = row.agent.value;
    const id = `earth:institution:${hash(uri)}`;
    if (institutions.has(uri)) continue;
    institutions.set(uri, id);
    const code = uri.split("/").at(-1) ?? row.label.value;
    nodeById.set(id, {
      id,
      kind: "institution",
      label: code,
      title: row.label.value,
      uri,
      included: true,
      sectors: [],
      families: [],
      types: [],
      inForce: [],
    });
  }
  for (const work of creatorWorks)
    for (const uri of work.authors) {
      const target = institutions.get(uri);
      const source = workId(work.celex);
      if (!target || !nodeById.has(source)) continue;
      edges.push({
        id: `earth-metadata-edge:${hash([work.workUri, `${CDM}work_created_by_agent`, uri].join("|"))}`,
        source,
        target,
        predicate: `${CDM}work_created_by_agent`,
      });
      const institution = nodeById.get(target);
      const sourceNode = nodeById.get(source);
      if (institution && sourceNode)
        institution.sectors = [
          ...new Set([...institution.sectors, ...sourceNode.sectors]),
        ];
    }
  for (const institution of nodeById.values()) {
    if (institution.kind !== "institution") continue;
    institution.sectors = [
      ...new Set(
        edges
          .filter(
            (edge) =>
              edge.target === institution.id &&
              edge.predicate === `${CDM}work_created_by_agent`,
          )
          .flatMap((edge) => nodeById.get(edge.source)?.sectors ?? []),
      ),
    ].sort();
  }
  const nodes = [...nodeById.values()].sort((a, b) => a.id.localeCompare(b.id));
  const graph = metadataGraphSchema.parse({
    schemaVersion: "earth-metadata-graph-1",
    builtAt: new Date().toISOString(),
    source: {
      endpoint: scope.endpoint,
      rawDirectory,
      snapshotHash: hash(queryHashes.join("|")),
      censusRetrievedAt: census.retrievedAt,
      scopeDescription: `${scope.description} Related configured families expanded to raw official legal-basis/completion closure; not all European financial publications.`,
      language: "ENG",
    },
    nodes,
    edges: edges.sort((a, b) => a.id.localeCompare(b.id)),
    report: {
      scopeWorks: nodes.filter((node) => node.kind === "work" && node.included)
        .length,
      boundaryWorks: nodes.filter((node) => !node.included).length,
      institutions: institutions.size,
      rawRelations: rawEdges.size,
      excludedPredicates,
      missingEnglishBoundary,
    },
  });
  const completion = {
    status: "complete",
    definition:
      "Configured editorial roots under exact raw-direction legal-basis/completion links; not all financial law.",
    snapshotHash: graph.source.snapshotHash,
    inputHash: hash(inputBytes),
    configurationHash,
    retrievalFrom: [
      census.retrievedAt,
      ...queryRecords.map((record) => record.retrievedAt),
    ].sort()[0],
    retrievalTo: queryRecords
      .map((record) => record.retrievedAt)
      .sort()
      .at(-1),
    emptyFrontier: true,
    scannedWorks: scanned.size,
    familyWorks: memberships.size,
    unpublishedFamilyWorks: [...memberships.keys()].filter(
      (celex) => !nodeById.has(workId(celex)),
    ),
    unpublishedWorks: [...new Set([...works.keys(), ...outside.keys()])].filter(
      (celex) => !nodeById.has(workId(celex)),
    ),
    waves,
    queries: queryRecords,
  };
  await writeFile(
    `${rawDirectory}/completion.json.next`,
    JSON.stringify(completion, null, 2),
  );
  await rename(
    `${rawDirectory}/completion.json.next`,
    `${rawDirectory}/completion.json`,
  );
  await mkdir("data/artifacts/earth", { recursive: true });
  await writeFile(
    "data/artifacts/earth/graph.json.next",
    JSON.stringify(graph),
  );
  await rename(
    "data/artifacts/earth/graph.json.next",
    "data/artifacts/earth/graph.json",
  );
  console.log(
    JSON.stringify({
      nodes: nodes.length,
      edges: edges.length,
      ...graph.report,
      rawDirectory,
    }),
  );
}
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
