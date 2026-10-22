import { z } from "zod";
import { bodyBlockSchema } from "../shared/legal";
import { sourceLocatorSchema } from "../shared/source-locator";

export const RAG_SNAPSHOT_SCHEMA_VERSION = "1.3.0" as const;
export const RAG_SNAPSHOT_GENERATOR_VERSION =
  "platform-rag-export@1.3.0" as const;
export const LEGACY_RAG_SNAPSHOT_SCHEMA_VERSION = "1.1.0" as const;
export const LEGACY_RAG_SNAPSHOT_GENERATOR_VERSION =
  "platform-rag-export@1.1.0" as const;

const languageSchema = z.enum(["en", "de"]);
const currentLanguageSchema = z.enum(["en", "de", "fr"]);
const nullableDateSchema = z.string().date().nullable();
const nullableUrlSchema = z.string().url().nullable();
const sourceStatusFields = {
  text_authority_status: z
    .literal("non-authoritative-consolidation")
    .optional(),
  text_as_of_basis: z.literal("last-amendment-act-date").optional(),
  authority_note: z.string().optional(),
  source_notes: z.array(z.string()).optional(),
};

const expressionFields = {
  expression_id: z.string().min(1),
  document_id: z.string().min(1),
  expression_date: z.string().date(),
  text_kind: z.enum(["original_oj", "consolidated", "original_publication"]),
  currency_status: z.enum(["current", "historical", "not_assessed"]),
  version_selection_policy: z.literal(
    "prefer_reviewed_consolidated_else_reviewed_official_publication",
  ),
  fallback_reason: z
    .enum([
      "no_reviewed_consolidated_expression_loaded",
      "consolidation_not_applicable_to_source_type",
    ])
    .nullable(),
  official_status: z.enum(["official", "fixture"]),
  official_source_url: z.string().url(),
  retrieved_at: z.string().datetime(),
  source_snapshot_id: z.string().min(1),
  source_version: z.string().min(1),
  review_status: z.enum(["validated", "fixture"]),
};

export const v12RagExpressionSchema = z.object({
  ...expressionFields,
  language: languageSchema,
  source_status: z.object(sourceStatusFields).strict().optional(),
});

const documentFields = {
  document_id: z.string().min(1),
  official_identifier: z.string().min(1),
  celex: z.string().min(1).nullable(),
  local_id: z.string().min(1).nullable(),
  family_ids: z.array(z.string().startsWith("family:")).min(1),
  aliases: z.array(z.string().min(1)),
  issuers: z.array(z.string().min(1)).min(1),
  short_title: z.string().min(1),
  title: z.string().min(1),
  jurisdiction: z.enum(["EU", "LU", "DE"]),
  jurisdictions: z.array(z.enum(["EU", "LU", "DE"])).length(1),
  document_type: z.enum([
    "regulation",
    "directive",
    "law",
    "circular",
    "guidance",
    "other",
  ]),
  regulatory_level: z.enum(["level_1", "level_2", "level_3"]),
  measure_type: z.enum([
    "primary_act",
    "rts",
    "its",
    "guideline",
    "qa",
    "other",
  ]),
  document_stage: z.literal("published"),
  lifecycle_status: z.enum(["future", "active", "repealed"]).nullable(),
  version_status: z.enum(["current", "historical", "superseded"]).nullable(),
  legal_effect: z.enum(["binding", "non_binding", "interpretive"]).nullable(),
  date_document: z.string().date(),
  date_entry_into_force: nullableDateSchema,
  date_application: nullableDateSchema,
  date_repeal: nullableDateSchema,
  official_page_url: z.string().url(),
  current_version_url: nullableUrlSchema,
  source_snapshot_id: z.string().min(1),
  source_version: z.string().min(1),
  text_as_of: z.string().date(),
  canonical_build_id: z.string().min(1),
  review_status: z.enum(["validated", "fixture"]),
};

export const v12RagDocumentSchema = z.object({
  ...documentFields,
  language: languageSchema,
  source_status: z.object(sourceStatusFields).strict().optional(),
  expressions: z.array(v12RagExpressionSchema).length(1),
});

const currentSourceStatusSchema = z
  .object({
    ...sourceStatusFields,
    checked_at: z.string().datetime().optional(),
    text_authority_status: z
      .enum(["non-authoritative-consolidation", "publisher-consolidation"])
      .optional(),
    text_as_of_basis: z
      .enum(["last-amendment-act-date", "publisher-version-date"])
      .optional(),
  })
  .strict();
export const ragExpressionSchema = z.object({
  ...expressionFields,
  language: currentLanguageSchema,
  retrieved_at: z.string().datetime().nullable(),
  imported_at: z.string().datetime().optional(),
  captured_on: z.literal("2026-10-20").optional(),
  capture_date_basis: z.literal("archived-probe-directory").optional(),
  retrieval_timestamp_basis: z.literal("date-only-official-probe").optional(),
  source_status: currentSourceStatusSchema.optional(),
});
export const ragDocumentSchema = z
  .object({
    ...documentFields,
    jurisdiction: z.enum(["EU", "LU", "DE", "FR"]),
    jurisdictions: z.array(z.enum(["EU", "LU", "DE", "FR"])).length(1),
    language: currentLanguageSchema,
    date_document: nullableDateSchema,
    publication_date_basis: z
      .literal("aggregate-with-multiple-component-publications")
      .optional(),
    source_status: currentSourceStatusSchema.optional(),
    structure_owner_ids: z.array(z.string().min(1)).optional(),
    scoped_source_notes: z
      .array(
        z
          .object({
            scope: z.enum(["document", "structure"]),
            owner_id: z.string().min(1),
            owner_source_url: z.string().url(),
            owner_label: z.string().min(1),
            position: z.number().int().nonnegative(),
            content_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
            block: bodyBlockSchema,
          })
          .strict(),
      )
      .optional(),
    expressions: z.array(ragExpressionSchema).length(1),
  })
  .superRefine((doc, ctx) => {
    const fr = doc.jurisdiction === "FR";
    const expression = doc.expressions[0];
    if (
      fr
        ? doc.document_id !== "fr:amf:rg" ||
          doc.jurisdictions[0] !== "FR" ||
          doc.language !== "fr" ||
          doc.date_document !== null ||
          doc.publication_date_basis !==
            "aggregate-with-multiple-component-publications" ||
          expression.retrieved_at !== null ||
          !expression.imported_at ||
          !expression.captured_on ||
          expression.capture_date_basis !== "archived-probe-directory" ||
          expression.retrieval_timestamp_basis !== "date-only-official-probe" ||
          doc.source_status?.text_authority_status !==
            "publisher-consolidation" ||
          doc.source_status?.text_as_of_basis !== "publisher-version-date" ||
          !doc.source_status?.checked_at ||
          expression.currency_status !== "not_assessed" ||
          doc.version_status !== null ||
          expression.expression_date !== doc.text_as_of ||
          expression.source_status?.checked_at !==
            doc.source_status?.checked_at ||
          !doc.scoped_source_notes ||
          !doc.structure_owner_ids ||
          expression.source_status?.text_authority_status !==
            "publisher-consolidation" ||
          expression.source_status?.text_as_of_basis !==
            "publisher-version-date" ||
          !expression.source_status?.checked_at
        : doc.jurisdictions[0] !== doc.jurisdiction ||
          doc.date_document === null ||
          expression.retrieved_at === null ||
          doc.publication_date_basis !== undefined ||
          doc.language === "fr" ||
          doc.scoped_source_notes !== undefined ||
          doc.structure_owner_ids !== undefined ||
          expression.imported_at !== undefined ||
          expression.captured_on !== undefined ||
          expression.capture_date_basis !== undefined ||
          expression.retrieval_timestamp_basis !== undefined ||
          doc.source_status?.text_authority_status ===
            "publisher-consolidation" ||
          doc.source_status?.text_as_of_basis === "publisher-version-date"
    )
      ctx.addIssue({
        code: "custom",
        message: "Invalid document publication or retrieval provenance",
      });
  });

const provisionContentBlockSchema = z.discriminatedUnion("type", [
  z.object({
    order: z.number().int().nonnegative(),
    type: z.literal("text"),
    text: z.string().min(1),
    content_role: z.enum(["operative-text", "source-note"]).optional(),
    source_locator: sourceLocatorSchema.optional(),
  }),
  z.object({
    order: z.number().int().nonnegative(),
    type: z.literal("child"),
    provision_id: z.string().min(1),
  }),
]);

const provisionFields = {
  provision_id: z.string().min(1),
  document_id: z.string().min(1),
  expression_id: z.string().min(1),
  parent_provision_id: z.string().min(1).nullable(),
  root_provision_id: z.string().min(1),
  unit_type: z.enum([
    "article",
    "paragraph",
    "subparagraph",
    "point",
    "subpoint",
    "recital",
    "annex",
    "annex_part",
    "other",
  ]),
  article_id: z.string().min(1).nullable(),
  paragraph_id: z.string().min(1).nullable(),
  point_id: z.string().min(1).nullable(),
  annex_id: z.string().min(1).nullable(),
  label: z.string().min(1),
  marker: z.string().min(1).nullable(),
  heading: z.string().min(1).nullable(),
  hierarchy_path: z.array(z.string().min(1)).min(1),
  source_locator: sourceLocatorSchema,
  source_locator_label: z.string().min(1),
  document_order: z.number().int().nonnegative(),
  ordered_content_blocks: z.array(provisionContentBlockSchema),
  direct_text: z.string(),
  text: z.string(),
  text_scope: z.enum(["direct", "subtree"]),
  official_source_url: z.string().url(),
  review_status: z.enum(["validated", "fixture"]),
};

export const v12RagProvisionSchema = z.object({
  ...provisionFields,
  language: languageSchema,
  content_role: z.enum(["operative-text", "source-note", "toc"]),
  source_notes: z.array(
    z
      .object({
        content_role: z.literal("source-note"),
        text: z.string().min(1),
        source_locator: sourceLocatorSchema,
        content_index: z.number().int().nonnegative(),
      })
      .strict(),
  ),
});

export const ragProvisionSchema = v12RagProvisionSchema.extend({
  language: currentLanguageSchema,
});

export const ragRelationshipEndpointSchema = z.object({
  entity_id: z.string().min(1),
  entity_type: z.enum([
    "document",
    "provision",
    "legal_work",
    "case",
    "decision",
    "authority",
  ]),
  document_id: z.string().min(1).nullable(),
  provision_id: z.string().min(1).nullable(),
  label: z.string().min(1),
  title: z.string().min(1).nullable(),
  official_source_url: nullableUrlSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const relationshipFields = {
  relationship_id: z.string().min(1),
  source_entity_id: z.string().min(1),
  source_document_id: z.string().min(1).nullable(),
  source_provision_id: z.string().min(1).nullable(),
  target_entity_id: z.string().min(1),
  target_document_id: z.string().min(1).nullable(),
  target_provision_id: z.string().min(1).nullable(),
  relationship_type: z.string().min(1),
  platform_relationship_type: z.string().min(1),
  direction: z.literal("source_to_target"),
  source: ragRelationshipEndpointSchema,
  target: ragRelationshipEndpointSchema,
  evidence_text: z.string().min(1),
  evidence_locator: z.string().min(1),
  evidence_source_url: z.string().url(),
  relationship_source: z.enum([
    "legal_text",
    "official_metadata",
    "official_mapping",
    "decision_text",
    "editorial",
    "algorithmic",
  ]),
  review_status: z.enum(["reviewed", "validated", "candidate"]),
  resolution_status: z.string().min(1),
  builder: z.object({ method: z.string().min(1), version: z.string().min(1) }),
  score: z.number().nonnegative().nullable(),
};

export const ragRelationshipSchema = z.object(relationshipFields);

const ragSnapshotFileSchema = z.object({
  records: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
});
const manifestFields = {
  snapshot_id: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/),
  created_at: z.string().datetime(),
  as_of_date: z.string().date(),
  profile_id: z.string().min(1),
  profile_version: z.string().min(1),
  profile_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  runtime_schema_version: z.string().min(1),
  runtime_build_id: z.string().min(1),
  document_count: z.number().int().nonnegative(),
  provision_count: z.number().int().nonnegative(),
  relationship_count: z.number().int().nonnegative(),
  review_status: z.literal("record_level"),
  corpus_selection_policy: z.object({
    selection_unit: z.literal("complete_legal_work"),
    relationship_boundary: z.literal("metadata_stub"),
    auto_include_relationship_targets: z.literal(false),
  }),
  files: z.object({
    "documents.jsonl": ragSnapshotFileSchema,
    "provisions.jsonl": ragSnapshotFileSchema,
    "relationships.jsonl": ragSnapshotFileSchema,
  }),
};

export const v12RagSnapshotManifestSchema = z.object({
  ...manifestFields,
  schema_version: z.literal("1.2.0"),
  languages: z.array(languageSchema).min(1),
  generator_version: z.literal("platform-rag-export@1.2.0"),
});

export const ragSnapshotManifestSchema = z.object({
  ...manifestFields,
  schema_version: z.literal(RAG_SNAPSHOT_SCHEMA_VERSION),
  languages: z.array(currentLanguageSchema).min(1),
  generator_version: z.literal(RAG_SNAPSHOT_GENERATOR_VERSION),
});

// Immutable 1.1 snapshots omit content roles and are English-only. Keep this
// branch for verifying already-published handoffs without relaxing 1.2 checks.
const legacyExpressionSchema = z
  .object({
    ...expressionFields,
    language: z.literal("en"),
  })
  .strict();
export const legacyRagDocumentSchema = z
  .object({
    ...documentFields,
    jurisdiction: z.enum(["EU", "LU"]),
    jurisdictions: z.array(z.enum(["EU", "LU"])).length(1),
    language: z.literal("en"),
    expressions: z.array(legacyExpressionSchema).length(1),
  })
  .strict();
const legacyProvisionContentBlockSchema = z.discriminatedUnion("type", [
  z
    .object({
      order: z.number().int().nonnegative(),
      type: z.literal("text"),
      text: z.string().min(1),
    })
    .strict(),
  z
    .object({
      order: z.number().int().nonnegative(),
      type: z.literal("child"),
      provision_id: z.string().min(1),
    })
    .strict(),
]);
export const legacyRagProvisionSchema = z
  .object({
    ...provisionFields,
    language: z.literal("en"),
    ordered_content_blocks: z.array(legacyProvisionContentBlockSchema),
  })
  .strict();
export const legacyRagSnapshotManifestSchema = z
  .object({
    ...manifestFields,
    schema_version: z.literal(LEGACY_RAG_SNAPSHOT_SCHEMA_VERSION),
    languages: z.array(z.literal("en")).length(1),
    generator_version: z.literal(LEGACY_RAG_SNAPSHOT_GENERATOR_VERSION),
  })
  .strict();

export type RagDocument = z.infer<typeof ragDocumentSchema>;
export type RagProvision = z.infer<typeof ragProvisionSchema>;
export type RagRelationship = z.infer<typeof ragRelationshipSchema>;
export type RagSnapshotManifest = z.infer<typeof ragSnapshotManifestSchema>;
export type VerifiedRagSnapshotManifest =
  | RagSnapshotManifest
  | z.infer<typeof legacyRagSnapshotManifestSchema>
  | z.infer<typeof v12RagSnapshotManifestSchema>;
export type RagRelationshipEndpoint = z.infer<
  typeof ragRelationshipEndpointSchema
>;
