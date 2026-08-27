import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import {
  type ApplicabilityEvidenceRole,
  type ApplicabilityStatus,
  applicabilityEvidenceRoleSchema,
  applicabilityStatusSchema,
} from "../shared/applicability";
import type { BodyBlock, DocumentView, ProvisionView } from "../shared/legal";

export const APPLICABILITY_RULE_BUILDER = "applicability-rule";
export const APPLICABILITY_RULE_BUILDER_VERSION = "1.0.0";
export const DEFAULT_APPLICABILITY_RULES_PATH = resolve(
  process.cwd(),
  "data/official-mappings/applicability.json",
);

const evidenceInputSchema = z
  .object({
    role: applicabilityEvidenceRoleSchema,
    sourceEntityId: z.string().min(1),
    evidenceText: z.string().min(1),
  })
  .strict();

const applicabilityRuleInputSchema = z
  .object({
    id: z.string().startsWith("applicability-rule:"),
    documentId: z.string().min(1),
    entityType: z
      .object({ id: z.string().min(1), label: z.string().min(1) })
      .strict(),
    status: applicabilityStatusSchema,
    scopeProvisionId: z.string().min(1),
    evidence: z.array(evidenceInputSchema).min(3),
    navigationProvisionIds: z.array(z.string().min(1)),
    sourceUrl: z.string().url(),
    provenance: z.literal("LEGAL_TEXT"),
    reviewStatus: z.literal("reviewed"),
  })
  .strict();

export const applicabilityRuleDatasetSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    id: z.literal("applicability-rules"),
    version: z.string().min(1),
    reviewedAt: z.string().datetime(),
    rules: z.array(applicabilityRuleInputSchema),
  })
  .strict();

export type ApplicabilityRuleDataset = z.infer<
  typeof applicabilityRuleDatasetSchema
>;

export interface ApplicabilityRuleRecord {
  id: string;
  datasetVersion: string;
  documentId: string;
  entityTypeId: string;
  entityTypeLabel: string;
  status: ApplicabilityStatus;
  scopeProvisionId: string;
  sourceUrl: string;
  provenance: "LEGAL_TEXT";
  reviewStatus: "reviewed";
  reviewedAt: string;
  builderMethod: typeof APPLICABILITY_RULE_BUILDER;
  builderVersion: typeof APPLICABILITY_RULE_BUILDER_VERSION;
}

export interface ApplicabilityEvidenceRecord {
  ruleId: string;
  displayOrder: number;
  role: ApplicabilityEvidenceRole;
  sourceEntityId: string;
  sourceLabel: string;
  sourcePath: string;
  evidenceText: string;
  evidenceLocator: string;
  sourceUrl: string;
  provenance: "LEGAL_TEXT";
}

export interface ApplicabilityNavigationRecord {
  ruleId: string;
  provisionId: string;
  displayOrder: number;
}

export interface ApplicabilityRuleBuild {
  rules: ApplicabilityRuleRecord[];
  evidence: ApplicabilityEvidenceRecord[];
  navigation: ApplicabilityNavigationRecord[];
}

type ResolvedLegalText = {
  documentId: string;
  rootProvisionId: string;
  kind: string;
  label: string;
  title: string | null;
  path: string;
  text: string | null;
  evidenceLocator: string;
  descendantIds: string[];
};

function blockIds(blocks: BodyBlock[]): string[] {
  return blocks.flatMap((block) => [block.id, ...blockIds(block.children)]);
}

function locator(entityId: string, value?: { kind: string; value: string }) {
  return value ? `${value.kind}:${value.value}` : entityId;
}

function resolveBlock(
  documentId: string,
  provision: ProvisionView,
  blocks: BodyBlock[],
  entityId: string,
): ResolvedLegalText | null {
  for (const block of blocks) {
    if (block.id === entityId) {
      return {
        documentId,
        rootProvisionId: provision.id,
        kind: block.kind,
        label: [provision.label, block.marker].filter(Boolean).join(" · "),
        title: provision.title ?? null,
        path: `${provision.path}#${block.anchor}`,
        text: block.text,
        evidenceLocator: locator(block.id, block.sourceLocator),
        descendantIds: blockIds(block.children),
      };
    }
    const nested = resolveBlock(
      documentId,
      provision,
      block.children,
      entityId,
    );
    if (nested) return nested;
  }
  return null;
}

function resolveEntity(
  document: DocumentView,
  entityId: string,
): ResolvedLegalText | null {
  for (const provision of document.provisions) {
    if (provision.id === entityId) {
      return {
        documentId: document.id,
        rootProvisionId: provision.id,
        kind: provision.kind,
        label: provision.label,
        title: provision.title ?? null,
        path: provision.path,
        text: null,
        evidenceLocator: locator(provision.id, provision.sourceLocator),
        descendantIds: blockIds(provision.blocks),
      };
    }
    const block = resolveBlock(
      document.id,
      provision,
      provision.blocks,
      entityId,
    );
    if (block) return block;
  }
  return null;
}

function assertUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} values must be unique`);
  }
}

export function loadApplicabilityRuleDataset(
  path = DEFAULT_APPLICABILITY_RULES_PATH,
): ApplicabilityRuleDataset {
  return applicabilityRuleDatasetSchema.parse(
    JSON.parse(readFileSync(path, "utf8")),
  );
}

export function buildApplicabilityRules(
  documents: DocumentView[],
  dataset = loadApplicabilityRuleDataset(),
  knownDocumentIds: Set<string> | null = null,
): ApplicabilityRuleBuild {
  const documentsById = new Map(
    documents.map((document) => [document.id, document]),
  );
  assertUnique(
    dataset.rules.map((rule) => rule.id),
    "Applicability rule ID",
  );
  assertUnique(
    dataset.rules.map((rule) => `${rule.documentId}:${rule.entityType.id}`),
    "Applicability rule document/entity type",
  );

  const build: ApplicabilityRuleBuild = {
    rules: [],
    evidence: [],
    navigation: [],
  };
  for (const rule of dataset.rules) {
    if (knownDocumentIds && !knownDocumentIds.has(rule.documentId)) {
      throw new Error(
        `Applicability rule targets unknown Document ${rule.documentId}`,
      );
    }
    const document = documentsById.get(rule.documentId);
    if (!document) continue;
    if (rule.sourceUrl !== document.sourceUrl) {
      throw new Error(`Applicability source URL drift for ${rule.id}`);
    }
    const scope = resolveEntity(document, rule.scopeProvisionId);
    if (
      !scope ||
      scope.documentId !== document.id ||
      scope.rootProvisionId !== rule.scopeProvisionId ||
      scope.kind !== "article" ||
      scope.text !== null
    ) {
      throw new Error(
        `Invalid applicability scope provision ${rule.scopeProvisionId}`,
      );
    }
    const roles = rule.evidence.map((item) => item.role);
    if (
      roles.filter((role) => role === "scope-intro").length !== 1 ||
      roles.filter((role) => role === "entity-listing").length !== 1 ||
      !roles.includes("qualification")
    ) {
      throw new Error(`Incomplete applicability evidence roles for ${rule.id}`);
    }
    assertUnique(
      rule.evidence.map((item) => `${item.role}:${item.sourceEntityId}`),
      `Applicability evidence ${rule.id}`,
    );
    const qualificationIds = new Set(
      rule.evidence
        .filter((item) => item.role === "qualification")
        .map((item) => item.sourceEntityId),
    );
    rule.evidence.forEach((item, displayOrder) => {
      const source = resolveEntity(document, item.sourceEntityId);
      if (
        !source ||
        source.rootProvisionId !== rule.scopeProvisionId ||
        source.text !== item.evidenceText
      ) {
        throw new Error(
          `Applicability legal-text evidence drift for ${item.sourceEntityId}`,
        );
      }
      if (
        item.role === "qualification" &&
        source.descendantIds.some((id) => !qualificationIds.has(id))
      ) {
        throw new Error(
          `Incomplete applicability qualification subtree ${item.sourceEntityId}`,
        );
      }
      build.evidence.push({
        ruleId: rule.id,
        displayOrder,
        role: item.role,
        sourceEntityId: item.sourceEntityId,
        sourceLabel: source.label,
        sourcePath: source.path,
        evidenceText: item.evidenceText,
        evidenceLocator: source.evidenceLocator,
        sourceUrl: rule.sourceUrl,
        provenance: rule.provenance,
      });
    });
    assertUnique(
      rule.navigationProvisionIds,
      `Applicability navigation ${rule.id}`,
    );
    rule.navigationProvisionIds.forEach((provisionId, displayOrder) => {
      const provision = resolveEntity(document, provisionId);
      if (
        !provision ||
        provision.kind !== "article" ||
        provision.rootProvisionId !== provisionId ||
        provision.text !== null
      ) {
        throw new Error(
          `Invalid applicability navigation provision ${provisionId}`,
        );
      }
      build.navigation.push({ ruleId: rule.id, provisionId, displayOrder });
    });
    build.rules.push({
      id: rule.id,
      datasetVersion: dataset.version,
      documentId: rule.documentId,
      entityTypeId: rule.entityType.id,
      entityTypeLabel: rule.entityType.label,
      status: rule.status,
      scopeProvisionId: rule.scopeProvisionId,
      sourceUrl: rule.sourceUrl,
      provenance: rule.provenance,
      reviewStatus: rule.reviewStatus,
      reviewedAt: dataset.reviewedAt,
      builderMethod: APPLICABILITY_RULE_BUILDER,
      builderVersion: APPLICABILITY_RULE_BUILDER_VERSION,
    });
  }
  return build;
}
