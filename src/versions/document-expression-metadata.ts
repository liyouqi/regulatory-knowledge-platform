import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

export const DEFAULT_DOCUMENT_EXPRESSION_METADATA_PATH = resolve(
  process.cwd(),
  "data/official-metadata/document-expressions.json",
);

export const documentExpressionMetadataRecordSchema = z.object({
  documentId: z.string().min(1),
  language: z.literal("en"),
  issuers: z.array(z.string().min(1)).min(1),
  textKind: z.enum(["original_oj", "consolidated", "original_publication"]),
  currencyStatus: z.enum(["current", "historical", "not_assessed"]),
  versionSelectionPolicy: z.literal(
    "prefer_reviewed_consolidated_else_reviewed_official_publication",
  ),
  fallbackReason: z
    .enum([
      "no_reviewed_consolidated_expression_loaded",
      "consolidation_not_applicable_to_source_type",
    ])
    .nullable(),
  reviewStatus: z.literal("reviewed"),
  reviewedAt: z.string().datetime(),
});

export const documentExpressionMetadataDatasetSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    version: z.string().min(1),
    records: z.array(documentExpressionMetadataRecordSchema),
  })
  .superRefine((dataset, context) => {
    const seen = new Set<string>();
    for (const [index, record] of dataset.records.entries()) {
      if (seen.has(record.documentId)) {
        context.addIssue({
          code: "custom",
          path: ["records", index, "documentId"],
          message: `Duplicate document expression metadata for ${record.documentId}`,
        });
      }
      seen.add(record.documentId);
      if (
        record.textKind === "consolidated" &&
        record.fallbackReason !== null
      ) {
        context.addIssue({
          code: "custom",
          path: ["records", index, "fallbackReason"],
          message:
            "A loaded consolidated expression must not have a fallback reason",
        });
      }
      if (
        record.textKind !== "consolidated" &&
        record.fallbackReason === null
      ) {
        context.addIssue({
          code: "custom",
          path: ["records", index, "fallbackReason"],
          message:
            "A non-consolidated expression must state its fallback reason",
        });
      }
    }
  });

export type DocumentExpressionMetadata = z.infer<
  typeof documentExpressionMetadataRecordSchema
>;

export type DocumentExpressionMetadataDataset = z.infer<
  typeof documentExpressionMetadataDatasetSchema
>;

export function loadDocumentExpressionMetadataDataset(
  path = DEFAULT_DOCUMENT_EXPRESSION_METADATA_PATH,
): DocumentExpressionMetadataDataset {
  return documentExpressionMetadataDatasetSchema.parse(
    JSON.parse(readFileSync(path, "utf8")),
  );
}

export function selectDocumentExpressionMetadata(
  documentIds: ReadonlySet<string>,
  dataset = loadDocumentExpressionMetadataDataset(),
): DocumentExpressionMetadata[] {
  const selected = dataset.records.filter((record) =>
    documentIds.has(record.documentId),
  );
  const selectedIds = new Set(selected.map((record) => record.documentId));
  const missing = [...documentIds].filter((id) => !selectedIds.has(id)).sort();
  if (missing.length > 0) {
    throw new Error(
      `Reviewed Expression metadata is missing for: ${missing.join(", ")}`,
    );
  }
  return selected.sort((left, right) =>
    left.documentId.localeCompare(right.documentId),
  );
}
