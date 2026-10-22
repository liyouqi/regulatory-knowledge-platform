import { z } from "zod";

export const sourceCorrectionSchema = z.object({
  date: z.string().date(),
  url: z.string().url(),
});

export const legacySourceStatusSchema = z.object({
  basis: z.enum(["original-oj", "consolidated"]),
  textAsOf: z.string().date(),
  checkedAt: z.string().datetime().optional(),
  currentVersionUrl: z.string().url(),
  corrections: z.array(sourceCorrectionSchema),
  textAuthorityStatus: z.literal("non-authoritative-consolidation").optional(),
  textAsOfBasis: z.literal("last-amendment-act-date").optional(),
  authorityNote: z.string().optional(),
  sourceNotes: z.array(z.string()).optional(),
});

export const sourceStatusSchema = legacySourceStatusSchema.extend({
  textAuthorityStatus: z
    .enum(["non-authoritative-consolidation", "publisher-consolidation"])
    .optional(),
  textAsOfBasis: z
    .enum(["last-amendment-act-date", "publisher-version-date"])
    .optional(),
});

export type SourceStatus = z.infer<typeof sourceStatusSchema>;
