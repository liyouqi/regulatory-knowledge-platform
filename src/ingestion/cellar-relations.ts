import { z } from "zod";
import { normalizeCelex } from "../canonical/ids";
import { officialCellarHttpsUrl } from "./cellar";

export const CELLAR_SPARQL_ENDPOINT =
  "https://publications.europa.eu/webapi/rdf/sparql";
export const CELLAR_FOCUSED_QUERY_VERSION = "1.0.0";

export const cellarFocusedPredicateSchema = z.enum([
  "http://publications.europa.eu/ontology/cdm#resource_legal_based_on_resource_legal",
  "http://publications.europa.eu/ontology/cdm#resource_legal_completes_resource_legal",
]);

export type CellarFocusedPredicate = z.infer<
  typeof cellarFocusedPredicateSchema
>;

export const CELLAR_FOCUSED_PREDICATES: Record<
  CellarFocusedPredicate,
  { label: string; relationType: "ADOPTED_UNDER" | "SUPPLEMENTS" }
> = {
  "http://publications.europa.eu/ontology/cdm#resource_legal_based_on_resource_legal":
    {
      label: "Legal resource is based on legal resource",
      relationType: "ADOPTED_UNDER",
    },
  "http://publications.europa.eu/ontology/cdm#resource_legal_completes_resource_legal":
    {
      label: "Legal resource completes legal resource",
      relationType: "SUPPLEMENTS",
    },
};

const celexSchema = z.string().transform(normalizeCelex);

function officialWorkUri(value: string): string {
  const normalized = officialCellarHttpsUrl(value);
  const url = new URL(normalized);
  if (!url.pathname.startsWith("/resource/cellar/")) {
    throw new Error(`Unexpected CELLAR Work URI: ${value}`);
  }
  return normalized;
}

export const cellarFocusedRelationRecordSchema = z.object({
  sourceCelex: celexSchema,
  sourceWorkUri: z.string().url().transform(officialWorkUri),
  predicate: cellarFocusedPredicateSchema,
  targetCelex: celexSchema,
  targetWorkUri: z.string().url().transform(officialWorkUri),
});

export type CellarFocusedRelationRecord = z.infer<
  typeof cellarFocusedRelationRecordSchema
>;

export const cellarFocusedRelationDatasetSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  queryVersion: z.literal(CELLAR_FOCUSED_QUERY_VERSION),
  endpoint: z.literal(CELLAR_SPARQL_ENDPOINT),
  checkedAt: z.string().datetime(),
  records: z.array(cellarFocusedRelationRecordSchema),
});

const sparqlUriSchema = z.object({
  type: z.literal("uri"),
  value: z.string().url(),
});

const sparqlResponseSchema = z.object({
  results: z.object({
    bindings: z.array(
      z.object({
        source: sparqlUriSchema,
        sourceCelexUri: sparqlUriSchema,
        predicate: sparqlUriSchema,
        target: sparqlUriSchema,
        targetCelexUri: sparqlUriSchema,
      }),
    ),
  }),
});

function celexFromUri(value: string): string {
  const url = new URL(value);
  if (url.hostname !== "publications.europa.eu") {
    throw new Error(`Unexpected CELLAR CELEX host: ${url.hostname}`);
  }
  const match = /^\/resource\/celex\/([^/]+)$/u.exec(url.pathname);
  if (!match) throw new Error(`Unexpected CELLAR CELEX URI: ${value}`);
  return normalizeCelex(match[1]);
}

function recordKey(record: CellarFocusedRelationRecord): string {
  return [record.sourceCelex, record.predicate, record.targetCelex].join("|");
}

export function validateCellarFocusedRelationRecords(
  records: CellarFocusedRelationRecord[],
): CellarFocusedRelationRecord[] {
  const unique = new Map<string, CellarFocusedRelationRecord>();
  for (const record of records) {
    if (record.sourceCelex === record.targetCelex) {
      throw new Error(
        `CELLAR self-relation is not publishable: ${recordKey(record)}`,
      );
    }
    const key = recordKey(record);
    const existing = unique.get(key);
    if (existing && JSON.stringify(existing) !== JSON.stringify(record)) {
      throw new Error(`Conflicting CELLAR relation: ${key}`);
    }
    unique.set(key, record);
  }
  return [...unique.values()].sort((left, right) =>
    recordKey(left).localeCompare(recordKey(right)),
  );
}

export function parseCellarFocusedRelationResults(
  raw: unknown,
): CellarFocusedRelationRecord[] {
  const parsed = sparqlResponseSchema.parse(raw);
  return validateCellarFocusedRelationRecords(
    parsed.results.bindings.map((binding) =>
      cellarFocusedRelationRecordSchema.parse({
        sourceCelex: celexFromUri(binding.sourceCelexUri.value),
        sourceWorkUri: binding.source.value,
        predicate: binding.predicate.value,
        targetCelex: celexFromUri(binding.targetCelexUri.value),
        targetWorkUri: binding.target.value,
      }),
    ),
  );
}

export function buildCellarFocusedRelationsQuery(
  celexValues: string[],
): string {
  const celexes = [...new Set(celexValues.map(normalizeCelex))].sort();
  if (celexes.length === 0) {
    throw new Error(
      "CELLAR focused relation query requires at least one CELEX",
    );
  }
  const celexIris = celexes
    .map((celex) => `<http://publications.europa.eu/resource/celex/${celex}>`)
    .join(" ");
  const predicateIris = cellarFocusedPredicateSchema.options
    .map((predicate) => `<${predicate}>`)
    .join(" ");
  return [
    "PREFIX owl: <http://www.w3.org/2002/07/owl#>",
    "SELECT DISTINCT ?source ?sourceCelexUri ?predicate ?target ?targetCelexUri",
    "WHERE {",
    `  VALUES ?sourceCelexUri { ${celexIris} }`,
    `  VALUES ?targetCelexUri { ${celexIris} }`,
    `  VALUES ?predicate { ${predicateIris} }`,
    "  FILTER(?sourceCelexUri != ?targetCelexUri)",
    "  ?source owl:sameAs ?sourceCelexUri .",
    "  ?target owl:sameAs ?targetCelexUri .",
    "  ?source ?predicate ?target .",
    "}",
    "ORDER BY ?sourceCelexUri ?predicate ?targetCelexUri",
  ].join("\n");
}
