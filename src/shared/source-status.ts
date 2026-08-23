import { z } from "zod";

export const sourceCorrectionSchema = z.object({
  date: z.string().date(),
  url: z.string().url(),
});

export const sourceStatusSchema = z.object({
  basis: z.enum(["original-oj", "consolidated"]),
  textAsOf: z.string().date(),
  checkedAt: z.string().datetime().optional(),
  currentVersionUrl: z.string().url(),
  corrections: z.array(sourceCorrectionSchema),
});

export type SourceStatus = z.infer<typeof sourceStatusSchema>;
