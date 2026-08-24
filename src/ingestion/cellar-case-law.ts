import { z } from "zod";
import { normalizeCelex } from "../canonical/ids";
import {
  CELLAR_SPARQL_ENDPOINT,
  cellarCelexFromUri,
  officialCellarWorkUri,
} from "./cellar-relations";

export const CELLAR_CASE_LAW_QUERY_VERSION = "1.0.0";

export const cellarCaseLawPredicateSchema = z.literal(
  "http://publications.europa.eu/ontology/cdm#case-law_interpretes_resource_legal",
);

export type CellarCaseLawPredicate = z.infer<
  typeof cellarCaseLawPredicateSchema
>;

const celexSchema = z.string().transform(normalizeCelex);
const cjeuCelexSchema = celexSchema.refine(
  (value) => /^6\d{4}[A-Z]{2}\d{4}(?:_\d+)?$/u.test(value),
  "Expected a CJEU case-law CELEX identifier",
);

export const cellarCaseLawRecordSchema = z.object({
  caseCelex: cjeuCelexSchema,
  caseWorkUri: z.string().url().transform(officialCellarWorkUri),
  predicate: cellarCaseLawPredicateSchema,
  targetCelex: celexSchema,
  targetWorkUri: z.string().url().transform(officialCellarWorkUri),
});

export type CellarCaseLawRecord = z.infer<typeof cellarCaseLawRecordSchema>;

export const cellarCaseLawDatasetSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  queryVersion: z.literal(CELLAR_CASE_LAW_QUERY_VERSION),
  endpoint: z.literal(CELLAR_SPARQL_ENDPOINT),
  checkedAt: z.string().datetime(),
  seedCelexes: z.array(celexSchema).min(1),
  records: z.array(cellarCaseLawRecordSchema),
});

const sparqlUriSchema = z.object({
  type: z.literal("uri"),
  value: z.string().url(),
});

const sparqlResponseSchema = z.object({
  results: z.object({
    bindings: z.array(
      z.object({
        case: sparqlUriSchema,
        caseCelexUri: sparqlUriSchema,
        predicate: sparqlUriSchema,
        target: sparqlUriSchema,
        targetCelexUri: sparqlUriSchema,
      }),
    ),
  }),
});

function recordKey(record: CellarCaseLawRecord): string {
  return [record.caseCelex, record.predicate, record.targetCelex].join("|");
}

export function validateCellarCaseLawRecords(
  records: CellarCaseLawRecord[],
  seedCelexes?: string[],
): CellarCaseLawRecord[] {
  const seeds = seedCelexes
    ? new Set(seedCelexes.map(normalizeCelex))
    : undefined;
  const unique = new Map<string, CellarCaseLawRecord>();
  for (const record of records) {
    if (seeds && !seeds.has(record.targetCelex)) {
      throw new Error(
        `CELLAR case-law record is outside the seed neighborhood: ${recordKey(record)}`,
      );
    }
    const key = recordKey(record);
    const existing = unique.get(key);
    if (existing && JSON.stringify(existing) !== JSON.stringify(record)) {
      throw new Error(`Conflicting CELLAR case-law record: ${key}`);
    }
    unique.set(key, record);
  }
  return [...unique.values()].sort((left, right) =>
    recordKey(left).localeCompare(recordKey(right)),
  );
}

export function parseCellarCaseLawResults(
  raw: unknown,
  seedCelexes?: string[],
): CellarCaseLawRecord[] {
  const parsed = sparqlResponseSchema.parse(raw);
  return validateCellarCaseLawRecords(
    parsed.results.bindings.map((binding) =>
      cellarCaseLawRecordSchema.parse({
        caseCelex: cellarCelexFromUri(binding.caseCelexUri.value),
        caseWorkUri: binding.case.value,
        predicate: binding.predicate.value,
        targetCelex: cellarCelexFromUri(binding.targetCelexUri.value),
        targetWorkUri: binding.target.value,
      }),
    ),
    seedCelexes,
  );
}

export function buildCellarCaseLawQuery(seedCelexValues: string[]): string {
  const seedCelexes = [...new Set(seedCelexValues.map(normalizeCelex))].sort();
  if (seedCelexes.length === 0) {
    throw new Error("CELLAR case-law query requires at least one seed CELEX");
  }
  const seedIris = seedCelexes
    .map((celex) => `<http://publications.europa.eu/resource/celex/${celex}>`)
    .join(" ");
  const predicate = cellarCaseLawPredicateSchema.value;
  return [
    "PREFIX owl: <http://www.w3.org/2002/07/owl#>",
    "SELECT DISTINCT ?case ?caseCelexUri ?predicate ?target ?targetCelexUri",
    "WHERE {",
    `  VALUES ?targetCelexUri { ${seedIris} }`,
    `  VALUES ?predicate { <${predicate}> }`,
    "  ?target owl:sameAs ?targetCelexUri .",
    "  ?case ?predicate ?target .",
    "  ?case owl:sameAs ?caseCelexUri .",
    '  FILTER(STRSTARTS(STR(?targetCelexUri), "http://publications.europa.eu/resource/celex/"))',
    '  FILTER(STRSTARTS(STR(?caseCelexUri), "http://publications.europa.eu/resource/celex/6"))',
    "}",
    "ORDER BY ?targetCelexUri ?caseCelexUri",
  ].join("\n");
}
