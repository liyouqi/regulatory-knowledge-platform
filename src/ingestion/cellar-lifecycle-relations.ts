import { z } from "zod";
import { normalizeCelex } from "../canonical/ids";
import {
  CELLAR_SPARQL_ENDPOINT,
  cellarCelexFromUri,
  officialCellarWorkUri,
} from "./cellar-relations";

export const CELLAR_LIFECYCLE_QUERY_VERSION = "1.0.0";

export const cellarLifecyclePredicateSchema = z.enum([
  "http://publications.europa.eu/ontology/cdm#resource_legal_amends_resource_legal",
  "http://publications.europa.eu/ontology/cdm#resource_legal_corrects_resource_legal",
]);

export type CellarLifecyclePredicate = z.infer<
  typeof cellarLifecyclePredicateSchema
>;

const celexSchema = z.string().transform(normalizeCelex);

export const cellarLifecycleRelationRecordSchema = z.object({
  sourceCelex: celexSchema,
  sourceWorkUri: z.string().url().transform(officialCellarWorkUri),
  predicate: cellarLifecyclePredicateSchema,
  targetCelex: celexSchema,
  targetWorkUri: z.string().url().transform(officialCellarWorkUri),
});

export type CellarLifecycleRelationRecord = z.infer<
  typeof cellarLifecycleRelationRecordSchema
>;

export const cellarLifecycleRelationDatasetSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  queryVersion: z.literal(CELLAR_LIFECYCLE_QUERY_VERSION),
  endpoint: z.literal(CELLAR_SPARQL_ENDPOINT),
  checkedAt: z.string().datetime(),
  seedCelexes: z.array(celexSchema).min(1),
  records: z.array(cellarLifecycleRelationRecordSchema),
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

function recordKey(record: CellarLifecycleRelationRecord): string {
  return [record.sourceCelex, record.predicate, record.targetCelex].join("|");
}

export function validateCellarLifecycleRelationRecords(
  records: CellarLifecycleRelationRecord[],
  seedCelexes?: string[],
): CellarLifecycleRelationRecord[] {
  const seeds = seedCelexes
    ? new Set(seedCelexes.map(normalizeCelex))
    : undefined;
  const unique = new Map<string, CellarLifecycleRelationRecord>();
  for (const record of records) {
    if (record.sourceCelex === record.targetCelex) {
      throw new Error(
        `CELLAR lifecycle self-relation is not reviewable: ${recordKey(record)}`,
      );
    }
    if (
      seeds &&
      !seeds.has(record.sourceCelex) &&
      !seeds.has(record.targetCelex)
    ) {
      throw new Error(
        `CELLAR lifecycle relation is outside the seed neighborhood: ${recordKey(record)}`,
      );
    }
    const key = recordKey(record);
    const existing = unique.get(key);
    if (existing && JSON.stringify(existing) !== JSON.stringify(record)) {
      throw new Error(`Conflicting CELLAR lifecycle relation: ${key}`);
    }
    unique.set(key, record);
  }
  return [...unique.values()].sort((left, right) =>
    recordKey(left).localeCompare(recordKey(right)),
  );
}

export function parseCellarLifecycleRelationResults(
  raw: unknown,
  seedCelexes?: string[],
): CellarLifecycleRelationRecord[] {
  const parsed = sparqlResponseSchema.parse(raw);
  return validateCellarLifecycleRelationRecords(
    parsed.results.bindings.map((binding) =>
      cellarLifecycleRelationRecordSchema.parse({
        sourceCelex: cellarCelexFromUri(binding.sourceCelexUri.value),
        sourceWorkUri: binding.source.value,
        predicate: binding.predicate.value,
        targetCelex: cellarCelexFromUri(binding.targetCelexUri.value),
        targetWorkUri: binding.target.value,
      }),
    ),
    seedCelexes,
  );
}

export function buildCellarLifecycleRelationsQuery(
  seedCelexValues: string[],
): string {
  const seedCelexes = [...new Set(seedCelexValues.map(normalizeCelex))].sort();
  if (seedCelexes.length === 0) {
    throw new Error("CELLAR lifecycle query requires at least one seed CELEX");
  }
  const seedIris = seedCelexes
    .map((celex) => `<http://publications.europa.eu/resource/celex/${celex}>`)
    .join(" ");
  const predicateIris = cellarLifecyclePredicateSchema.options
    .map((predicate) => `<${predicate}>`)
    .join(" ");
  return [
    "PREFIX owl: <http://www.w3.org/2002/07/owl#>",
    "SELECT DISTINCT ?source ?sourceCelexUri ?predicate ?target ?targetCelexUri",
    "WHERE {",
    `  VALUES ?seedCelexUri { ${seedIris} }`,
    `  VALUES ?predicate { ${predicateIris} }`,
    "  {",
    "    ?source owl:sameAs ?seedCelexUri .",
    "    ?source ?predicate ?target .",
    "  } UNION {",
    "    ?target owl:sameAs ?seedCelexUri .",
    "    ?source ?predicate ?target .",
    "  }",
    "  ?source owl:sameAs ?sourceCelexUri .",
    "  ?target owl:sameAs ?targetCelexUri .",
    '  FILTER(STRSTARTS(STR(?sourceCelexUri), "http://publications.europa.eu/resource/celex/"))',
    '  FILTER(STRSTARTS(STR(?targetCelexUri), "http://publications.europa.eu/resource/celex/"))',
    "  FILTER(?sourceCelexUri != ?targetCelexUri)",
    "}",
    "ORDER BY ?sourceCelexUri ?predicate ?targetCelexUri",
  ].join("\n");
}
