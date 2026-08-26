import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { decisionLogicalId } from "../canonical/ids";
import { relationshipId } from "../relationships/contract";
import type { LegalEntityRecord } from "../relationships/explicit-reference";
import type { DocumentView } from "../shared/legal";
import type { Authority } from "../shared/regulatory-context";
import { supervisoryDecisionTypeSchema } from "../shared/supervisory-decision";

export const SUPERVISORY_DECISION_BUILDER = "supervisory-decision";
export const SUPERVISORY_DECISION_BUILDER_VERSION = "1.0.0";
export const DEFAULT_SUPERVISORY_DECISIONS_PATH = resolve(
  process.cwd(),
  "data/official-metadata/supervisory-decisions.json",
);

const sourceDocumentSchema = z
  .object({
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    byteCount: z.number().int().positive(),
    pageCount: z.number().int().positive(),
  })
  .strict();

const evidenceSchema = z
  .object({ text: z.string().min(1), locator: z.string().min(1) })
  .strict();

const decisionInputSchema = z
  .object({
    id: z.string().startsWith("decision:"),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    authorityId: z.string().startsWith("authority:"),
    jurisdiction: z.string().length(2),
    decisionNumber: z.string().min(1),
    decisionDate: z.string().date(),
    decisionType: supervisoryDecisionTypeSchema,
    officialTitle: z.string().min(1),
    subject: z.string().min(1),
    respondentLabel: z.string().min(1).nullable(),
    targetDocumentId: z.string().min(1),
    sourcePageUrl: z.string().url(),
    sourceDocumentUrl: z.string().url(),
    sourceDocument: sourceDocumentSchema,
    outcome: z
      .object({
        kind: supervisoryDecisionTypeSchema,
        amountMinor: z.number().int().nonnegative().nullable(),
        currency: z.string().length(3).nullable(),
        evidenceText: z.string().min(1),
        evidenceLocator: z.string().min(1),
      })
      .strict(),
    findings: z
      .array(
        z
          .object({
            targetEntityId: z.string().min(1),
            targetReference: z.string().min(1),
            evidenceCitation: z.string().min(1),
          })
          .strict(),
      )
      .min(1),
    findingEvidence: evidenceSchema,
    provenance: z.literal("OFFICIAL_METADATA"),
    reviewStatus: z.literal("reviewed"),
  })
  .strict();

export const supervisoryDecisionDatasetSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    id: z.literal("supervisory-decisions"),
    version: z.string().min(1),
    reviewedAt: z.string().datetime(),
    decisions: z.array(decisionInputSchema),
  })
  .strict();

export type SupervisoryDecisionDataset = z.infer<
  typeof supervisoryDecisionDatasetSchema
>;

export interface SupervisoryDecisionRecord {
  id: string;
  slug: string;
  authorityId: string;
  jurisdiction: string;
  decisionNumber: string;
  decisionDate: string;
  decisionType: z.infer<typeof supervisoryDecisionTypeSchema>;
  officialTitle: string;
  subject: string;
  respondentLabel: string | null;
  targetDocumentId: string;
  sourcePageUrl: string;
  sourceDocumentUrl: string;
  sourceDocumentSha256: string;
  sourceDocumentByteCount: number;
  sourceDocumentPageCount: number;
  outcomeKind: z.infer<typeof supervisoryDecisionTypeSchema>;
  fineAmountMinor: number | null;
  fineCurrency: string | null;
  outcomeEvidenceText: string;
  outcomeEvidenceLocator: string;
  provenance: "OFFICIAL_METADATA";
  reviewStatus: "reviewed";
  reviewedAt: string;
  builderMethod: typeof SUPERVISORY_DECISION_BUILDER;
  builderVersion: typeof SUPERVISORY_DECISION_BUILDER_VERSION;
}

export interface SupervisoryDecisionFindingRecord {
  id: string;
  decisionId: string;
  relationType: "FINDS_VIOLATION_OF";
  targetDocumentId: string;
  targetEntityId: string;
  targetReference: string;
  provenance: "DECISION_TEXT";
  evidenceText: string;
  evidenceLocator: string;
  sourceRef: string;
  reviewStatus: "reviewed";
  reviewedAt: string;
  builderMethod: typeof SUPERVISORY_DECISION_BUILDER;
  builderVersion: typeof SUPERVISORY_DECISION_BUILDER_VERSION;
  resolutionStatus: "resolved";
}

export interface SupervisoryDecisionBuild {
  decisions: SupervisoryDecisionRecord[];
  findings: SupervisoryDecisionFindingRecord[];
  authorityIds: Set<string>;
}

export function loadSupervisoryDecisionDataset(
  path = DEFAULT_SUPERVISORY_DECISIONS_PATH,
): SupervisoryDecisionDataset {
  return supervisoryDecisionDatasetSchema.parse(
    JSON.parse(readFileSync(path, "utf8")),
  );
}

function assertUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} IDs must be unique`);
  }
}

export function buildSupervisoryDecisions(
  documents: DocumentView[],
  entities: LegalEntityRecord[],
  authorities: Authority[],
  dataset = loadSupervisoryDecisionDataset(),
  knownDocumentIds: Set<string> | null = null,
): SupervisoryDecisionBuild {
  const documentsById = new Map(
    documents.map((document) => [document.id, document]),
  );
  const entitiesById = new Map(entities.map((entity) => [entity.id, entity]));
  const authoritiesById = new Map(
    authorities.map((authority) => [authority.id, authority]),
  );
  assertUnique(
    dataset.decisions.map((decision) => decision.id),
    "Supervisory decision",
  );
  assertUnique(
    dataset.decisions.map((decision) => decision.slug),
    "Supervisory decision slug",
  );

  const decisions: SupervisoryDecisionRecord[] = [];
  const findings: SupervisoryDecisionFindingRecord[] = [];
  const authorityIds = new Set<string>();
  for (const decision of dataset.decisions) {
    if (knownDocumentIds && !knownDocumentIds.has(decision.targetDocumentId)) {
      throw new Error(
        `Supervisory decision targets unknown Document ${decision.targetDocumentId}`,
      );
    }
    const document = documentsById.get(decision.targetDocumentId);
    if (!document) continue;
    const authority = authoritiesById.get(decision.authorityId);
    if (
      !authority ||
      authority.authorityType !== "supervisory-authority" ||
      authority.jurisdiction !== decision.jurisdiction ||
      decision.id !==
        decisionLogicalId(decision.authorityId, decision.decisionNumber) ||
      decision.outcome.kind !== decision.decisionType
    ) {
      throw new Error(
        `Invalid supervisory decision metadata for ${decision.id}`,
      );
    }
    const hasAmount = decision.outcome.amountMinor !== null;
    if (hasAmount !== (decision.outcome.currency !== null)) {
      throw new Error(`Incomplete supervisory decision outcome ${decision.id}`);
    }
    const targetIds = decision.findings.map(
      (finding) => finding.targetEntityId,
    );
    assertUnique(targetIds, `Supervisory decision ${decision.id} finding`);
    for (const finding of decision.findings) {
      const target = entitiesById.get(finding.targetEntityId);
      if (
        !target ||
        target.documentId !== document.id ||
        target.kind !== "article" ||
        target.rootProvisionId !== null ||
        !decision.findingEvidence.text.includes(finding.evidenceCitation)
      ) {
        throw new Error(
          `Invalid supervisory decision finding ${decision.id} → ${finding.targetEntityId}`,
        );
      }
      findings.push({
        id: relationshipId(
          decision.id,
          "FINDS_VIOLATION_OF",
          target.id,
          "DECISION_TEXT",
          decision.findingEvidence.locator,
        ),
        decisionId: decision.id,
        relationType: "FINDS_VIOLATION_OF",
        targetDocumentId: document.id,
        targetEntityId: target.id,
        targetReference: finding.targetReference,
        provenance: "DECISION_TEXT",
        evidenceText: decision.findingEvidence.text,
        evidenceLocator: decision.findingEvidence.locator,
        sourceRef: decision.sourceDocumentUrl,
        reviewStatus: "reviewed",
        reviewedAt: dataset.reviewedAt,
        builderMethod: SUPERVISORY_DECISION_BUILDER,
        builderVersion: SUPERVISORY_DECISION_BUILDER_VERSION,
        resolutionStatus: "resolved",
      });
    }
    authorityIds.add(authority.id);
    decisions.push({
      id: decision.id,
      slug: decision.slug,
      authorityId: decision.authorityId,
      jurisdiction: decision.jurisdiction,
      decisionNumber: decision.decisionNumber,
      decisionDate: decision.decisionDate,
      decisionType: decision.decisionType,
      officialTitle: decision.officialTitle,
      subject: decision.subject,
      respondentLabel: decision.respondentLabel,
      targetDocumentId: document.id,
      sourcePageUrl: decision.sourcePageUrl,
      sourceDocumentUrl: decision.sourceDocumentUrl,
      sourceDocumentSha256: decision.sourceDocument.sha256,
      sourceDocumentByteCount: decision.sourceDocument.byteCount,
      sourceDocumentPageCount: decision.sourceDocument.pageCount,
      outcomeKind: decision.outcome.kind,
      fineAmountMinor: decision.outcome.amountMinor,
      fineCurrency: decision.outcome.currency,
      outcomeEvidenceText: decision.outcome.evidenceText,
      outcomeEvidenceLocator: decision.outcome.evidenceLocator,
      provenance: decision.provenance,
      reviewStatus: decision.reviewStatus,
      reviewedAt: dataset.reviewedAt,
      builderMethod: SUPERVISORY_DECISION_BUILDER,
      builderVersion: SUPERVISORY_DECISION_BUILDER_VERSION,
    });
  }
  return {
    decisions: decisions.sort((left, right) => left.id.localeCompare(right.id)),
    findings: findings.sort((left, right) =>
      left.targetEntityId.localeCompare(right.targetEntityId, undefined, {
        numeric: true,
      }),
    ),
    authorityIds,
  };
}
