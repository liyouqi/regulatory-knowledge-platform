import { z } from "zod";

export const sourceLocatorSchema = z
  .object({
    kind: z.enum(["xml-id", "xpath", "css-selector", "pdf-page", "fixture"]),
    value: z.string().min(1),
  })
  .strict();

export type SourceLocator = z.infer<typeof sourceLocatorSchema>;
