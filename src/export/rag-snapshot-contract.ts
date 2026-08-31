import { z } from "zod";
import { sourceLocatorSchema } from "../shared/source-locator";

export const RAG_SNAPSHOT_SCHEMA_VERSION = "1.1.0" as const;
export const RAG_SNAPSHOT_GENERATOR_VERSION =
  "platform-rag-export@1.1.0" as const;

const nullableDateSchema = z.string().date().nullable();
const nullableUrlSchema = z.string().url().nullable();

export const ragExpressionSchema = z.object({
  expression_id: z.string().min(1),
  document_id: z.string().min(1),
  language: z.literal("en"),
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
});

export const ragDocumentSchema = z.object({
  document_id: z.string().min(1),
  official_identifier: z.string().min(1),
  celex: z.string().min(1).nullable(),
  local_id: z.string().min(1).nullable(),
  family_ids: z.array(z.string().startsWith("family:")).min(1),
  aliases: z.array(z.string().min(1)),
  issuers: z.array(z.string().min(1)).min(1),
  short_title: z.string().min(1),
  title: z.string().min(1),
  jurisdiction: z.enum(["EU", "LU"]),
  jurisdictions: z.array(z.enum(["EU", "LU"])).length(1),
  language: z.literal("en"),
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
  expressions: z.array(ragExpressionSchema).length(1),
});

export const ragProvisionSchema = z.object({
  provision_id: z.string().min(1),
  document_id: z.string().min(1),
  expression_id: z.string().min(1),
  language: z.literal("en"),
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
  ordered_content_blocks: z.array(
    z.discriminatedUnion("type", [
      z.object({
        order: z.number().int().nonnegative(),
        type: z.literal("text"),
        text: z.string().min(1),
      }),
      z.object({
        order: z.number().int().nonnegative(),
        type: z.literal("child"),
        provision_id: z.string().min(1),
      }),
    ]),
  ),
  direct_text: z.string(),
  text: z.string(),
  text_scope: z.enum(["direct", "subtree"]),
  official_source_url: z.string().url(),
  review_status: z.enum(["validated", "fixture"]),
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

export const ragRelationshipSchema = z.object({
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
  builder: z.object({
    method: z.string().min(1),
    version: z.string().min(1),
  }),
  score: z.number().nonnegative().nullable(),
});

const ragSnapshotFileSchema = z.object({
  records: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
});

export const ragSnapshotManifestSchema = z.object({
  schema_version: z.literal(RAG_SNAPSHOT_SCHEMA_VERSION),
  snapshot_id: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/),
  created_at: z.string().datetime(),
  as_of_date: z.string().date(),
  languages: z.array(z.literal("en")).length(1),
  profile_id: z.string().min(1),
  profile_version: z.string().min(1),
  profile_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  runtime_schema_version: z.string().min(1),
  runtime_build_id: z.string().min(1),
  document_count: z.number().int().nonnegative(),
  provision_count: z.number().int().nonnegative(),
  relationship_count: z.number().int().nonnegative(),
  review_status: z.literal("record_level"),
  generator_version: z.literal(RAG_SNAPSHOT_GENERATOR_VERSION),
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
});

export type RagDocument = z.infer<typeof ragDocumentSchema>;
export type RagProvision = z.infer<typeof ragProvisionSchema>;
export type RagRelationship = z.infer<typeof ragRelationshipSchema>;
export type RagRelationshipEndpoint = z.infer<
  typeof ragRelationshipEndpointSchema
>;
export type RagSnapshotManifest = z.infer<typeof ragSnapshotManifestSchema>;
