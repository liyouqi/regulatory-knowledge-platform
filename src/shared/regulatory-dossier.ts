import { z } from "zod";

const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const dossierIdSchema = z.string().regex(/^dossier:[a-z0-9-]+$/u);
const sourceIdSchema = z.string().regex(/^source:[a-z0-9-]+$/u);

const dossierSourceInputSchema = z
  .object({
    id: sourceIdSchema,
    kind: z.enum(["legal-entity", "eba-qa"]),
    targetId: z.string().min(1),
    role: z.enum(["primary", "supporting"]),
    required: z.boolean(),
  })
  .strict();

const dossierSectionInputSchema = z
  .object({
    id: z.string().regex(/^section:[a-z0-9-]+$/u),
    eyebrow: z.string().min(1),
    title: z.string().min(1),
    body: z.string().min(1),
    sourceIds: z.array(sourceIdSchema).min(1),
  })
  .strict();

const dossierInputObjectSchema = z
  .object({
    id: dossierIdSchema,
    slug: slugSchema,
    title: z.string().min(1),
    kicker: z.string().min(1),
    summary: z.string().min(1),
    audience: z.string().min(1),
    reviewedAt: z.string().datetime(),
    sources: z.array(dossierSourceInputSchema).min(1),
    sections: z.array(dossierSectionInputSchema).min(1),
  })
  .strict();

function validateDossier(
  dossier: z.infer<typeof dossierInputObjectSchema>,
  context: z.RefinementCtx,
): void {
  if (dossier.id !== `dossier:${dossier.slug}`) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["id"],
      message: "Dossier stable ID does not match its slug",
    });
  }
  const sourceIds = dossier.sources.map((source) => source.id);
  if (new Set(sourceIds).size !== sourceIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["sources"],
      message: "Dossier source IDs must be unique",
    });
  }
  const knownSources = new Set(sourceIds);
  for (const [index, section] of dossier.sections.entries()) {
    for (const sourceId of section.sourceIds) {
      if (!knownSources.has(sourceId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sections", index, "sourceIds"],
          message: `Section references unknown source ${sourceId}`,
        });
      }
    }
  }
}

export const dossierInputSchema =
  dossierInputObjectSchema.superRefine(validateDossier);

export const dossierDatasetSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    datasetVersion: z.string().min(1),
    provenance: z.literal("EDITORIAL"),
    reviewStatus: z.literal("reviewed"),
    reviewedAt: z.string().datetime(),
    dossiers: z.array(dossierInputSchema).min(1),
  })
  .strict()
  .superRefine((dataset, context) => {
    const ids = dataset.dossiers.map((dossier) => dossier.id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dossiers"],
        message: "Dossier IDs must be unique",
      });
    }
  });

export const dossierSourceSchema = dossierSourceInputSchema.extend({
  targetLabel: z.string().min(1),
  targetTitle: z.string().nullable(),
  targetPath: z.string().startsWith("/"),
  officialUrl: z.string().url(),
  provenance: z.enum(["OFFICIAL_TEXT", "OFFICIAL_QA"]),
});

export const dossierSectionSchema = dossierSectionInputSchema;

export const regulatoryDossierSchema = dossierInputObjectSchema
  .omit({ sources: true })
  .extend({
    provenance: z.literal("EDITORIAL"),
    reviewStatus: z.literal("reviewed"),
    sources: z.array(dossierSourceSchema).min(1),
  });

const runtimeIdentitySchema = z
  .object({
    buildId: z.string().min(1),
    profileId: z.string().min(1),
    profileVersion: z.string().min(1),
    profileDisplayName: z.string().min(1),
    profileHash: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  })
  .strict();

export const dossierPreviewSchema = regulatoryDossierSchema
  .pick({ id: true, slug: true, title: true, kicker: true, summary: true })
  .extend({
    sectionCount: z.number().int().positive(),
    sourceCount: z.number().int().positive(),
    qaCount: z.number().int().nonnegative(),
  });

export const dossierCatalogResponseSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    runtime: runtimeIdentitySchema,
    provenance: z.literal("EDITORIAL"),
    records: z.array(dossierPreviewSchema),
  })
  .strict();

export const dossierDetailResponseSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    runtime: runtimeIdentitySchema,
    dossier: regulatoryDossierSchema,
  })
  .strict();

export type DossierDataset = z.infer<typeof dossierDatasetSchema>;
export type DossierInput = z.infer<typeof dossierInputSchema>;
export type DossierSource = z.infer<typeof dossierSourceSchema>;
export type RegulatoryDossier = z.infer<typeof regulatoryDossierSchema>;
export type DossierPreview = z.infer<typeof dossierPreviewSchema>;
export type DossierCatalogResponse = z.infer<
  typeof dossierCatalogResponseSchema
>;
export type DossierDetailResponse = z.infer<typeof dossierDetailResponseSchema>;
