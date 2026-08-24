import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import {
  CELLAR_CASE_LAW_QUERY_VERSION,
  buildCellarCaseLawQuery,
  cellarCaseLawDatasetSchema,
  parseCellarCaseLawResults,
} from "./cellar-case-law";
import { CELLAR_SPARQL_ENDPOINT } from "./cellar-relations";
import { loadSourceRegistry } from "./source-registry";

const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

const snapshotSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  queryVersion: z.literal(CELLAR_CASE_LAW_QUERY_VERSION),
  endpoint: z.literal(CELLAR_SPARQL_ENDPOINT),
  retrievedAt: z.string().datetime(),
  seedCelexes: z.array(z.string().min(1)).min(1),
  querySha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  responseSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  recordCount: z.number().int().nonnegative(),
  files: z.object({
    query: z.literal("query.rq"),
    response: z.literal("response.json"),
    normalizedCandidate: z.literal("normalized-candidate.json"),
  }),
});

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sha256(value: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

async function officialSparqlResponse(query: string): Promise<Uint8Array> {
  const url = new URL(CELLAR_SPARQL_ENDPOINT);
  url.searchParams.set("format", "application/sparql-results+json");
  url.searchParams.set("query", query);
  const response = await fetch(url, {
    headers: {
      Accept: "application/sparql-results+json, application/json",
      "User-Agent":
        "regulatory-knowledge-platform/0.1 (personal research project)",
    },
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) {
    throw new Error(`CELLAR SPARQL returned HTTP ${response.status}`);
  }
  const mediaType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!mediaType.includes("json")) {
    throw new Error(
      `CELLAR SPARQL returned unexpected media type: ${mediaType || "missing"}`,
    );
  }
  const resolved = new URL(response.url);
  if (
    resolved.protocol !== "https:" ||
    resolved.hostname !== "publications.europa.eu"
  ) {
    throw new Error(
      `CELLAR SPARQL redirected outside official host: ${response.url}`,
    );
  }
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_RESPONSE_BYTES) {
    throw new Error(
      `CELLAR SPARQL response exceeds ${MAX_RESPONSE_BYTES} bytes`,
    );
  }
  const responseBytes = new Uint8Array(await response.arrayBuffer());
  if (responseBytes.byteLength > MAX_RESPONSE_BYTES) {
    throw new Error(
      `CELLAR SPARQL response exceeds ${MAX_RESPONSE_BYTES} bytes`,
    );
  }
  return responseBytes;
}

async function fetchCaseLaw(): Promise<void> {
  const sources = await loadSourceRegistry();
  const seedCelexes = sources.map((source) => source.celex).sort();
  const query = buildCellarCaseLawQuery(seedCelexes);
  const responseBytes = await officialSparqlResponse(query);
  const responseText = new TextDecoder().decode(responseBytes);
  const retrievedAt = new Date().toISOString();
  const records = parseCellarCaseLawResults(
    JSON.parse(responseText),
    seedCelexes,
  );
  const candidate = cellarCaseLawDatasetSchema.parse({
    schemaVersion: "1.0.0",
    queryVersion: CELLAR_CASE_LAW_QUERY_VERSION,
    endpoint: CELLAR_SPARQL_ENDPOINT,
    checkedAt: retrievedAt,
    seedCelexes,
    records,
  });
  const directoryName = `${retrievedAt.replaceAll(/[:.]/gu, "-")}-${sha256(responseBytes).slice(7, 19)}`;
  const outputDirectory = resolve(
    process.cwd(),
    "data/raw/cellar-case-law",
    directoryName,
  );
  await mkdir(outputDirectory, { recursive: true });
  const snapshot = snapshotSchema.parse({
    schemaVersion: "1.0.0",
    queryVersion: CELLAR_CASE_LAW_QUERY_VERSION,
    endpoint: CELLAR_SPARQL_ENDPOINT,
    retrievedAt,
    seedCelexes,
    querySha256: sha256(query),
    responseSha256: sha256(responseBytes),
    recordCount: records.length,
    files: {
      query: "query.rq",
      response: "response.json",
      normalizedCandidate: "normalized-candidate.json",
    },
  });
  const pendingSuffix = `.pending-${process.pid}`;
  const files = [
    ["query.rq", `${query}\n`],
    ["response.json", responseBytes],
    ["normalized-candidate.json", `${JSON.stringify(candidate, null, 2)}\n`],
    ["snapshot.json", `${JSON.stringify(snapshot, null, 2)}\n`],
  ] as const;
  await Promise.all(
    files.map(([name, content]) =>
      writeFile(`${outputDirectory}/${name}${pendingSuffix}`, content),
    ),
  );
  await Promise.all(
    files.map(([name]) =>
      rename(
        `${outputDirectory}/${name}${pendingSuffix}`,
        `${outputDirectory}/${name}`,
      ),
    ),
  );
  console.log(`Saved immutable CELLAR case-law snapshot: ${outputDirectory}`);
  console.log(`CJEU interpretation candidates: ${records.length}`);
  console.log(
    "Review normalized-candidate.json before fetching judgment text or publishing case-law relationships.",
  );
}

async function verifyCaseLaw(): Promise<void> {
  const providedPath = argument("--snapshot");
  if (!providedPath) {
    throw new Error(
      "Usage: npm run cellar:case-law:verify -- --snapshot <snapshot-directory>",
    );
  }
  const directory = resolve(providedPath);
  const snapshot = snapshotSchema.parse(
    JSON.parse(await readFile(`${directory}/snapshot.json`, "utf8")),
  );
  const query = await readFile(`${directory}/${snapshot.files.query}`, "utf8");
  const responseBytes = await readFile(
    `${directory}/${snapshot.files.response}`,
  );
  const candidate = cellarCaseLawDatasetSchema.parse(
    JSON.parse(
      await readFile(
        `${directory}/${snapshot.files.normalizedCandidate}`,
        "utf8",
      ),
    ),
  );
  const expectedQuery = `${buildCellarCaseLawQuery(snapshot.seedCelexes)}\n`;
  if (
    query !== expectedQuery ||
    sha256(query.trimEnd()) !== snapshot.querySha256
  ) {
    throw new Error("CELLAR case-law query does not match its manifest");
  }
  if (sha256(responseBytes) !== snapshot.responseSha256) {
    throw new Error("CELLAR case-law response hash mismatch");
  }
  const parsedRecords = parseCellarCaseLawResults(
    JSON.parse(responseBytes.toString("utf8")),
    snapshot.seedCelexes,
  );
  if (
    JSON.stringify(candidate.seedCelexes) !==
      JSON.stringify(snapshot.seedCelexes) ||
    parsedRecords.length !== snapshot.recordCount ||
    JSON.stringify(parsedRecords) !== JSON.stringify(candidate.records)
  ) {
    throw new Error("CELLAR case-law normalized candidate mismatch");
  }
  console.log(
    `Verified CELLAR case-law snapshot: ${snapshot.recordCount} CJEU interpretation candidates`,
  );
}

const command = process.argv[2];

try {
  if (command === "fetch") await fetchCaseLaw();
  else if (command === "verify") await verifyCaseLaw();
  else throw new Error("Usage: CELLAR case-law CLI <fetch|verify>");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
