import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import {
  CELLAR_FOCUSED_QUERY_VERSION,
  CELLAR_SPARQL_ENDPOINT,
  buildCellarFocusedRelationsQuery,
  cellarFocusedRelationDatasetSchema,
  parseCellarFocusedRelationResults,
} from "./cellar-relations";
import { loadSourceRegistry } from "./source-registry";

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

const snapshotSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  queryVersion: z.literal(CELLAR_FOCUSED_QUERY_VERSION),
  endpoint: z.literal(CELLAR_SPARQL_ENDPOINT),
  retrievedAt: z.string().datetime(),
  celexes: z.array(z.string().min(1)).min(1),
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

async function fetchRelations(): Promise<void> {
  const sources = await loadSourceRegistry();
  const celexes = sources.map((source) => source.celex).sort();
  const query = buildCellarFocusedRelationsQuery(celexes);
  const url = new URL(CELLAR_SPARQL_ENDPOINT);
  url.searchParams.set("format", "application/sparql-results+json");
  url.searchParams.set("query", query);
  const response = await fetch(url, {
    headers: {
      Accept: "application/sparql-results+json, application/json",
      "User-Agent":
        "regulatory-knowledge-platform/0.1 (personal research project)",
    },
    signal: AbortSignal.timeout(60_000),
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
  const responseText = new TextDecoder().decode(responseBytes);
  const retrievedAt = new Date().toISOString();
  const records = parseCellarFocusedRelationResults(JSON.parse(responseText));
  const candidate = cellarFocusedRelationDatasetSchema.parse({
    schemaVersion: "1.0.0",
    queryVersion: CELLAR_FOCUSED_QUERY_VERSION,
    endpoint: CELLAR_SPARQL_ENDPOINT,
    checkedAt: retrievedAt,
    records,
  });
  const directoryName = `${retrievedAt.replaceAll(/[:.]/gu, "-")}-${sha256(responseBytes).slice(7, 19)}`;
  const outputDirectory = resolve(
    process.cwd(),
    "data/raw/cellar-relations",
    directoryName,
  );
  await mkdir(outputDirectory, { recursive: true });
  const snapshot = snapshotSchema.parse({
    schemaVersion: "1.0.0",
    queryVersion: CELLAR_FOCUSED_QUERY_VERSION,
    endpoint: CELLAR_SPARQL_ENDPOINT,
    retrievedAt,
    celexes,
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
  console.log(`Saved immutable CELLAR relation snapshot: ${outputDirectory}`);
  console.log(`Reviewed predicate rows: ${records.length}`);
  console.log(
    "Review normalized-candidate.json before updating data/official-metadata; fetch does not publish relationships.",
  );
}

async function verifyRelations(): Promise<void> {
  const providedPath = argument("--snapshot");
  if (!providedPath) {
    throw new Error(
      "Usage: npm run cellar:relations:verify -- --snapshot <snapshot-directory>",
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
  const candidate = cellarFocusedRelationDatasetSchema.parse(
    JSON.parse(
      await readFile(
        `${directory}/${snapshot.files.normalizedCandidate}`,
        "utf8",
      ),
    ),
  );
  const expectedQuery = `${buildCellarFocusedRelationsQuery(snapshot.celexes)}\n`;
  if (
    query !== expectedQuery ||
    sha256(query.trimEnd()) !== snapshot.querySha256
  ) {
    throw new Error(
      "CELLAR relation snapshot query does not match its manifest",
    );
  }
  if (sha256(responseBytes) !== snapshot.responseSha256) {
    throw new Error("CELLAR relation snapshot response hash mismatch");
  }
  const parsedRecords = parseCellarFocusedRelationResults(
    JSON.parse(responseBytes.toString("utf8")),
  );
  if (
    parsedRecords.length !== snapshot.recordCount ||
    JSON.stringify(parsedRecords) !== JSON.stringify(candidate.records)
  ) {
    throw new Error("CELLAR relation normalized candidate mismatch");
  }
  console.log(
    `Verified CELLAR relation snapshot: ${snapshot.recordCount} reviewed predicate rows`,
  );
}

const command = process.argv[2];

try {
  if (command === "fetch") await fetchRelations();
  else if (command === "verify") await verifyRelations();
  else throw new Error("Usage: CELLAR relation CLI <fetch|verify>");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
