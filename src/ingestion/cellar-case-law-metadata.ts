import { z } from "zod";
import type { CellarCaseLawRecord } from "./cellar-case-law";
import {
  CELLAR_SPARQL_ENDPOINT,
  cellarCelexFromUri,
  officialCellarWorkUri,
} from "./cellar-relations";

export const CELLAR_CASE_LAW_METADATA_QUERY_VERSION =
  "cellar-case-law-metadata@1.0.0";

export interface CaseLawMetadataProbeRecord {
  caseCelex: string;
  caseWorkUri: string;
  availability: "complete" | "unavailable";
  ecli?: string;
  decisionDate?: string;
  englishTitle?: string;
}

export const cellarCaseLawMetadataRecordSchema = z.object({
  caseCelex: z.string().regex(/^6\d{4}[A-Z]{2}\d{4}(?:_\d+)?$/u),
  caseWorkUri: z.string().url(),
  ecli: z.string().regex(/^ECLI:EU:[A-Z]+:\d{4}:\S+$/u),
  decisionDate: z.string().date(),
  englishTitle: z.string().min(1),
  predicate: z.literal(
    "http://publications.europa.eu/ontology/cdm#case-law_interpretes_resource_legal",
  ),
  targetCelex: z.string().min(1),
  targetWorkUri: z.string().url(),
});

export type CellarCaseLawMetadataRecord = z.infer<
  typeof cellarCaseLawMetadataRecordSchema
>;

export const cellarCaseLawMetadataDatasetSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  queryVersion: z.literal(CELLAR_CASE_LAW_METADATA_QUERY_VERSION),
  endpoint: z.literal(CELLAR_SPARQL_ENDPOINT),
  checkedAt: z.string().datetime(),
  sourceCandidateSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  records: z.array(cellarCaseLawMetadataRecordSchema),
  unavailableCaseCelexes: z.array(
    z.string().regex(/^6\d{4}[A-Z]{2}\d{4}(?:_\d+)?$/u),
  ),
});

export type CellarCaseLawMetadataDataset = z.infer<
  typeof cellarCaseLawMetadataDatasetSchema
>;

const sparqlUriSchema = z.object({
  type: z.literal("uri"),
  value: z.string().url(),
});

const sparqlLiteralSchema = z.object({
  type: z.literal("literal"),
  value: z.string().min(1),
});

const sparqlResponseSchema = z.object({
  results: z.object({
    bindings: z.array(
      z.object({
        caseCelexUri: sparqlUriSchema,
        case: sparqlUriSchema,
        ecli: sparqlLiteralSchema.optional(),
        date: sparqlLiteralSchema.optional(),
        title: sparqlLiteralSchema,
      }),
    ),
  }),
});

function uniqueCaseRecords(records: CellarCaseLawRecord[]) {
  const unique = new Map<string, CellarCaseLawRecord>();
  for (const record of records) {
    const existing = unique.get(record.caseCelex);
    if (existing && existing.caseWorkUri !== record.caseWorkUri) {
      throw new Error(`Conflicting CJEU case Work for ${record.caseCelex}`);
    }
    unique.set(record.caseCelex, record);
  }
  return [...unique.values()].sort((left, right) =>
    left.caseCelex.localeCompare(right.caseCelex),
  );
}

export function buildCellarCaseLawMetadataQuery(
  records: CellarCaseLawRecord[],
): string {
  const cases = uniqueCaseRecords(records);
  if (cases.length === 0) {
    throw new Error(
      "CELLAR case-law metadata query requires at least one case",
    );
  }
  const celexIris = cases
    .map(
      (record) =>
        `<http://publications.europa.eu/resource/celex/${record.caseCelex}>`,
    )
    .join(" ");
  return [
    "PREFIX owl: <http://www.w3.org/2002/07/owl#>",
    "PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>",
    "SELECT DISTINCT ?caseCelexUri ?case ?ecli ?date ?title",
    "WHERE {",
    `  VALUES ?caseCelexUri { ${celexIris} }`,
    "  ?case owl:sameAs ?caseCelexUri .",
    "  ?expression cdm:expression_belongs_to_work ?case .",
    "  ?expression cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/ENG> .",
    "  ?expression cdm:expression_title ?title .",
    "  OPTIONAL { ?case cdm:case-law_ecli ?ecli }",
    "  OPTIONAL { ?case cdm:work_date_document ?date }",
    "}",
    "ORDER BY ?caseCelexUri",
  ].join("\n");
}

export function probeCellarCaseLawMetadata(
  records: CellarCaseLawRecord[],
  raw: unknown,
): CaseLawMetadataProbeRecord[] {
  const cases = uniqueCaseRecords(records);
  const parsed = sparqlResponseSchema.parse(raw);
  const metadataByCase = new Map<
    string,
    {
      caseWorkUri: string;
      ecli?: string;
      decisionDate?: string;
      englishTitle: string;
    }
  >();
  for (const binding of parsed.results.bindings) {
    const caseCelex = cellarCelexFromUri(binding.caseCelexUri.value);
    const candidate = {
      caseWorkUri: officialCellarWorkUri(binding.case.value),
      ecli: binding.ecli?.value,
      decisionDate: binding.date?.value,
      englishTitle: binding.title.value,
    };
    const existing = metadataByCase.get(caseCelex);
    if (existing && JSON.stringify(existing) !== JSON.stringify(candidate)) {
      throw new Error(`Conflicting CJEU metadata for ${caseCelex}`);
    }
    metadataByCase.set(caseCelex, candidate);
  }

  return cases.map((record) => {
    const metadata = metadataByCase.get(record.caseCelex);
    if (!metadata) {
      return {
        caseCelex: record.caseCelex,
        caseWorkUri: record.caseWorkUri,
        availability: "unavailable",
      };
    }
    if (metadata.caseWorkUri !== record.caseWorkUri) {
      throw new Error(`CJEU metadata Work mismatch for ${record.caseCelex}`);
    }
    if (!metadata.ecli || !metadata.decisionDate) {
      return {
        caseCelex: record.caseCelex,
        caseWorkUri: record.caseWorkUri,
        availability: "unavailable",
      };
    }
    return {
      caseCelex: record.caseCelex,
      caseWorkUri: record.caseWorkUri,
      availability: "complete",
      ecli: metadata.ecli,
      decisionDate: metadata.decisionDate,
      englishTitle: metadata.englishTitle,
    };
  });
}

export function buildCellarCaseLawMetadataDataset(
  records: CellarCaseLawRecord[],
  raw: unknown,
  checkedAt: string,
  sourceCandidateSha256: string,
): CellarCaseLawMetadataDataset {
  const recordsByCase = new Map(
    uniqueCaseRecords(records).map((record) => [record.caseCelex, record]),
  );
  const probed = probeCellarCaseLawMetadata(records, raw);
  return cellarCaseLawMetadataDatasetSchema.parse({
    schemaVersion: "1.0.0",
    queryVersion: CELLAR_CASE_LAW_METADATA_QUERY_VERSION,
    endpoint: CELLAR_SPARQL_ENDPOINT,
    checkedAt,
    sourceCandidateSha256,
    records: probed.flatMap((metadata) => {
      if (metadata.availability !== "complete") return [];
      const relation = recordsByCase.get(metadata.caseCelex);
      if (!relation) {
        throw new Error(`Missing CJEU relation for ${metadata.caseCelex}`);
      }
      return [
        cellarCaseLawMetadataRecordSchema.parse({
          caseCelex: metadata.caseCelex,
          caseWorkUri: metadata.caseWorkUri,
          ecli: metadata.ecli,
          decisionDate: metadata.decisionDate,
          englishTitle: metadata.englishTitle,
          predicate: relation.predicate,
          targetCelex: relation.targetCelex,
          targetWorkUri: relation.targetWorkUri,
        }),
      ];
    }),
    unavailableCaseCelexes: probed
      .filter((metadata) => metadata.availability === "unavailable")
      .map((metadata) => metadata.caseCelex),
  });
}
