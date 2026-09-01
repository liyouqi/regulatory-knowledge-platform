import { z } from "zod";
import { dossierPreviewSchema } from "./regulatory-dossier";

const publicIdSchema = z.string().regex(/^\d{4}_\d+$/u);
const officialEbaUrlSchema = z
  .string()
  .url()
  .refine((value) => new URL(value).hostname === "www.eba.europa.eu", {
    message: "Expected an official www.eba.europa.eu URL",
  });
const sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);

const ebaQaCatalogItemObjectSchema = z
  .object({
    id: z.string().regex(/^qa:eba:\d{4}_\d+$/u),
    publicId: publicIdSchema,
    title: z.string().min(1),
    question: z.string().min(1),
    legalActLabel: z.string().min(1),
    associatedMeasureLabel: z.string().min(1),
    topicLabel: z.string().min(1),
    submittedAt: z.string().date(),
    publishedAt: z.string().date().nullable(),
    officialUrl: officialEbaUrlSchema,
    statusAtImport: z.literal("Final"),
    detailAvailable: z.boolean(),
  })
  .strict();

function validateQaId(
  item: { id: string; publicId: string },
  context: z.RefinementCtx,
): void {
  if (item.id !== `qa:eba:${item.publicId}`) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["id"],
      message: "Q&A stable ID does not match public ID",
    });
  }
}

export const ebaQaCatalogItemSchema =
  ebaQaCatalogItemObjectSchema.superRefine(validateQaId);

export const ebaQaCatalogDatasetSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    sourceSystem: z.literal("eba-single-rulebook-qa"),
    scope: z.literal("final"),
    sourceUrl: officialEbaUrlSchema,
    retrievedAt: z.string().datetime(),
    declaredRecordCount: z.number().int().positive(),
    contentHash: sha256Schema,
    records: z.array(ebaQaCatalogItemSchema).min(1),
  })
  .strict()
  .superRefine((dataset, context) => {
    if (dataset.declaredRecordCount !== dataset.records.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["declaredRecordCount"],
        message: "Declared Q&A count does not match records",
      });
    }
    if (
      new Set(dataset.records.map((item) => item.id)).size !==
      dataset.records.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["records"],
        message: "Q&A IDs must be unique",
      });
    }
  });

export const ebaQaDetailSchema = z
  .object({
    id: z.string().regex(/^qa:eba:\d{4}_\d+$/u),
    publicId: publicIdSchema,
    articleLabel: z.string().nullable(),
    paragraphLabel: z.string().nullable(),
    subparagraphLabel: z.string().nullable(),
    associatedMeasureArticleLabel: z.string().nullable(),
    background: z.string(),
    finalAnswer: z.string().min(1),
    answerPreparedBy: z.string().min(1).nullable(),
    finalStatusLabel: z.literal("Final Q&A"),
    nonBindingNotice: z.string().min(1),
    contentHash: sha256Schema,
  })
  .strict()
  .superRefine((detail, context) => {
    if (detail.id !== `qa:eba:${detail.publicId}`) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["id"],
        message: "Q&A detail ID does not match public ID",
      });
    }
  });

export const ebaQaDetailDatasetSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    sourceSystem: z.literal("eba-single-rulebook-qa"),
    scope: z.literal("dora-final-details"),
    sourceUrl: officialEbaUrlSchema,
    retrievedAt: z.string().datetime(),
    declaredRecordCount: z.number().int().positive(),
    contentHash: sha256Schema,
    records: z.array(ebaQaDetailSchema).min(1),
  })
  .strict()
  .superRefine((dataset, context) => {
    if (dataset.declaredRecordCount !== dataset.records.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["declaredRecordCount"],
        message: "Declared Q&A detail count does not match records",
      });
    }
    if (
      new Set(dataset.records.map((item) => item.id)).size !==
      dataset.records.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["records"],
        message: "Q&A detail IDs must be unique",
      });
    }
  });

export const ebaQaLegalReferenceSchema = z
  .object({
    qaId: z.string().regex(/^qa:eba:\d{4}_\d+$/u),
    role: z.enum([
      "declared-legal-act",
      "declared-provision",
      "associated-measure",
    ]),
    targetDocumentId: z.string().nullable(),
    targetEntityId: z.string().nullable(),
    citationLabel: z.string().min(1),
    officialUrl: z.string().url().nullable(),
    provenance: z.literal("OFFICIAL_QA_METADATA"),
    resolutionStatus: z.enum(["resolved", "external", "unresolved"]),
    evidenceLocator: z.string().min(1),
  })
  .strict();

const runtimeIdentitySchema = z
  .object({
    buildId: z.string().min(1),
    profileId: z.string().min(1),
    profileVersion: z.string().min(1),
    profileDisplayName: z.string().min(1),
    profileHash: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  })
  .strict();

export const ebaQaCatalogResponseSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    runtime: runtimeIdentitySchema,
    importedAt: z.string().datetime(),
    sourceUrl: officialEbaUrlSchema,
    page: z.number().int().positive(),
    pageSize: z.number().int().min(1).max(100),
    pageCount: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    filters: z
      .object({
        legalActs: z.array(z.string().min(1)),
        topics: z.array(z.string().min(1)),
      })
      .strict(),
    records: z.array(
      ebaQaCatalogItemObjectSchema
        .extend({
          internalPath: z.string().startsWith("/qa/eba/").nullable(),
        })
        .superRefine(validateQaId),
    ),
  })
  .strict();

export const ebaQaResolvedReferenceSchema = ebaQaLegalReferenceSchema.extend({
  targetLabel: z.string().nullable(),
  targetTitle: z.string().nullable(),
  targetPath: z.string().startsWith("/").nullable(),
  targetDocumentShortName: z.string().nullable(),
});

export const ebaQaDetailResponseSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    runtime: runtimeIdentitySchema,
    importedAt: z.string().datetime(),
    sourceUrl: officialEbaUrlSchema,
    catalog: ebaQaCatalogItemSchema,
    detail: ebaQaDetailSchema,
    references: z.array(ebaQaResolvedReferenceSchema),
    dossiers: z.array(dossierPreviewSchema),
  })
  .strict();

export type EbaQaCatalogItem = z.infer<typeof ebaQaCatalogItemSchema>;
export type EbaQaCatalogDataset = z.infer<typeof ebaQaCatalogDatasetSchema>;
export type EbaQaDetail = z.infer<typeof ebaQaDetailSchema>;
export type EbaQaDetailDataset = z.infer<typeof ebaQaDetailDatasetSchema>;
export type EbaQaLegalReference = z.infer<typeof ebaQaLegalReferenceSchema>;
export type EbaQaCatalogResponse = z.infer<typeof ebaQaCatalogResponseSchema>;
export type EbaQaDetailResponse = z.infer<typeof ebaQaDetailResponseSchema>;
export type EbaQaResolvedReference = z.infer<
  typeof ebaQaResolvedReferenceSchema
>;
