import { z } from "zod";
import { authoritySchema } from "./regulatory-context";

export const supervisoryDecisionTypeSchema = z.enum([
  "administrative-fine",
  "corrective-measure",
  "fine-and-corrective-measure",
  "case-closure",
]);

export const supervisoryDecisionOutcomeSchema = z
  .object({
    kind: supervisoryDecisionTypeSchema,
    amountMinor: z.number().int().nonnegative().nullable(),
    currency: z.string().length(3).nullable(),
    evidenceText: z.string().min(1),
    evidenceLocator: z.string().min(1),
  })
  .strict()
  .superRefine((outcome, context) => {
    const hasAmount = outcome.amountMinor !== null;
    const hasCurrency = outcome.currency !== null;
    if (hasAmount !== hasCurrency) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Decision outcome amount and currency must appear together",
      });
    }
  });

export const supervisoryDecisionFindingSchema = z
  .object({
    id: z.string().startsWith("relationship:"),
    relationType: z.literal("FINDS_VIOLATION_OF"),
    target: z
      .object({
        entityId: z.string().min(1),
        documentId: z.string().min(1),
        documentShortName: z.string().min(1),
        label: z.string().min(1),
        title: z.string().nullable(),
        path: z.string().startsWith("/"),
        reference: z.string().min(1),
      })
      .strict(),
    evidence: z
      .object({
        text: z.string().min(1),
        locator: z.string().min(1),
        sourceUrl: z.string().url(),
      })
      .strict(),
    provenance: z.literal("DECISION_TEXT"),
    reviewStatus: z.literal("reviewed"),
    reviewedAt: z.string().datetime(),
    builder: z
      .object({
        method: z.literal("supervisory-decision"),
        version: z.literal("1.0.0"),
      })
      .strict(),
  })
  .strict();

export const supervisoryDecisionSchema = z
  .object({
    id: z.string().startsWith("decision:"),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    path: z.string().startsWith("/"),
    jurisdiction: z.string().length(2),
    decisionNumber: z.string().min(1),
    decisionDate: z.string().date(),
    decisionType: supervisoryDecisionTypeSchema,
    officialTitle: z.string().min(1),
    subject: z.string().min(1),
    respondentLabel: z.string().min(1).nullable(),
    authority: authoritySchema,
    sourcePageUrl: z.string().url(),
    sourceDocumentUrl: z.string().url(),
    sourceDocument: z
      .object({
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        byteCount: z.number().int().positive(),
        pageCount: z.number().int().positive(),
      })
      .strict(),
    outcome: supervisoryDecisionOutcomeSchema,
    provenance: z.literal("OFFICIAL_METADATA"),
    reviewStatus: z.literal("reviewed"),
    reviewedAt: z.string().datetime(),
    builder: z
      .object({
        method: z.literal("supervisory-decision"),
        version: z.literal("1.0.0"),
      })
      .strict(),
    findings: z.array(supervisoryDecisionFindingSchema).min(1),
  })
  .strict();

export const documentSupervisoryDecisionsResponseSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    document: z
      .object({
        id: z.string().min(1),
        slug: z.string().min(1),
        shortName: z.string().min(1),
        officialTitle: z.string().min(1),
      })
      .strict(),
    runtime: z
      .object({
        buildId: z.string().min(1),
        profileId: z.string().min(1),
        profileVersion: z.string().min(1),
        profileHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      })
      .strict(),
    provisionId: z.string().min(1).optional(),
    decisions: z.array(supervisoryDecisionSchema),
  })
  .strict();

export type SupervisoryDecision = z.infer<typeof supervisoryDecisionSchema>;
export type SupervisoryDecisionFinding = z.infer<
  typeof supervisoryDecisionFindingSchema
>;
export type DocumentSupervisoryDecisionsResponse = z.infer<
  typeof documentSupervisoryDecisionsResponseSchema
>;
