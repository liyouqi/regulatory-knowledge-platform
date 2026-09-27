import { mkdir, writeFile } from "node:fs/promises";
import tags from "../../../data/earth/display-tags.json";
import scope from "../../../data/earth/source-scope.json";

type Binding = Record<string, { value: string }>;
interface Candidate {
  workUri: string;
  celex: string;
  titles: string[];
  directories: string[];
  types: string[];
  authors: string[];
  dates: string[];
  inForce: string[];
}

/** Discovery only: retains official metadata without publishing new graph facts. */
async function main() {
  const retrievedAt = new Date().toISOString();
  const stamp = retrievedAt.replaceAll(/[:.]/g, "-");
  const rawDirectory = `data/raw/earth/census/${stamp}`;
  await mkdir(rawDirectory, { recursive: true });
  const candidates = new Map<string, Candidate>();
  const codes = Object.keys(scope.directories).join("|");
  const seeds = Object.keys(tags.works)
    .map((id) => `<http://publications.europa.eu/resource/celex/${id}>`)
    .join(" ");
  let offset = 0;
  for (;;) {
    const query = `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
PREFIX owl: <http://www.w3.org/2002/07/owl#>
SELECT DISTINCT ?work ?celex ?title ?directory ?type ?author ?date ?inForce WHERE {
  ?work cdm:resource_legal_id_celex ?celex .
  FILTER(STRSTARTS(STR(?celex), "3"))
  { ?work cdm:resource_legal_is_about_concept_directory-code ?scopeDirectory .
    FILTER(REGEX(REPLACE(STR(?scopeDirectory), "[^0-9]", ""), "(${codes})$"))
  } UNION { VALUES ?seedUri { ${seeds} } ?work owl:sameAs ?seedUri . }
  ?expression cdm:expression_belongs_to_work ?work ;
    cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/${scope.language}> .
  OPTIONAL { ?expression cdm:expression_title ?title }
  OPTIONAL { ?work cdm:resource_legal_is_about_concept_directory-code ?directory }
  OPTIONAL { ?work cdm:work_has_resource-type ?type }
  OPTIONAL { ?work cdm:work_created_by_agent ?author }
  OPTIONAL { ?work cdm:work_date_document ?date }
  OPTIONAL { ?work cdm:resource_legal_in-force ?inForce }
}
ORDER BY ?work ?celex ?title ?directory ?type ?author ?date ?inForce
LIMIT ${scope.pageSize} OFFSET ${offset}`;
    await writeFile(`${rawDirectory}/${offset}.rq`, query);
    const response = await fetch(scope.endpoint, {
      method: "POST",
      headers: {
        Accept: "application/sparql-results+json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ query }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok)
      throw new Error(
        `CELLAR census HTTP ${response.status}; previous pages remain in ${rawDirectory}`,
      );
    const raw = await response.text();
    await writeFile(`${rawDirectory}/${offset}.json`, raw);
    const result = JSON.parse(raw) as { results: { bindings: Binding[] } };
    const rows = result.results.bindings;
    for (const row of rows) {
      const workUri = row.work.value;
      const celex = row.celex.value;
      const key = `${workUri}|${celex}`;
      const item = candidates.get(key) ?? {
        workUri,
        celex,
        titles: [],
        directories: [],
        types: [],
        authors: [],
        dates: [],
        inForce: [],
      };
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
      candidates.set(key, item);
    }
    console.log(
      `Census: ${candidates.size} candidates, ${offset + rows.length} metadata rows`,
    );
    if (rows.length < scope.pageSize) break;
    offset += scope.pageSize;
  }
  if (!candidates.size)
    throw new Error(
      "CELLAR returned no candidates; no completed census was written.",
    );
  const works = [...candidates.values()].sort((a, b) =>
    a.celex.localeCompare(b.celex),
  );
  await mkdir("data/artifacts/earth", { recursive: true });
  const serialized = JSON.stringify(
    {
      status: "candidate-metadata-only",
      retrievedAt,
      rawDirectory,
      scope,
      workCount: new Set(works.map((work) => work.workUri)).size,
      celexCount: new Set(works.map((work) => work.celex)).size,
      works,
    },
    null,
    2,
  );
  await writeFile("data/artifacts/earth/census.json", serialized);
  await writeFile(
    "data/artifacts/earth/census.md",
    [
      "# Earth candidate metadata census",
      "",
      `Retrieved: ${retrievedAt}`,
      `Raw queries/results: ${rawDirectory}`,
      "",
      `- Distinct Works: ${new Set(works.map((work) => work.workUri)).size}`,
      `- Distinct CELEX identifiers: ${new Set(works.map((work) => work.celex)).size}`,
      `- Candidate JSON bytes: ${Buffer.byteLength(serialized)}`,
      `- Missing English titles: ${works.filter((work) => !work.titles.length).length}`,
      `- Unknown in-force status: ${works.filter((work) => !work.inForce.length).length}`,
      "",
      "Candidate metadata only; not installed coverage, full-text ingestion or a complete legal relationship graph.",
      "",
    ].join("\n"),
  );
  console.log(
    "Saved data/artifacts/earth/census.json; this does not replace the displayed Earth artifact.",
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
