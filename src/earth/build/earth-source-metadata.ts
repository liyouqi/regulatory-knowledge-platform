import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { earthMeasureTypeSchema } from "../contract/earth-contract";

export const earthReviewedSourceMetadataEntrySchema = z
  .object({
    publicationDate: z.string().date(),
    measureType: earthMeasureTypeSchema,
    evidenceUrl: z
      .string()
      .url()
      .refine(
        (value) => {
          const url = new URL(value);
          return (
            url.protocol === "https:" &&
            ["eur-lex.europa.eu", "publications.europa.eu"].includes(
              url.hostname,
            )
          );
        },
        {
          message:
            "Reviewed Earth metadata evidenceUrl must be an official EU HTTPS URL",
        },
      ),
  })
  .strict();

export const earthReviewedSourceMetadataSchema = z.record(
  z.string().regex(/^[0-9][0-9A-Z()_-]{4,39}$/u),
  earthReviewedSourceMetadataEntrySchema,
);

export type EarthReviewedSourceMetadataEntry = z.infer<
  typeof earthReviewedSourceMetadataEntrySchema
>;
export type EarthReviewedSourceMetadata = z.infer<
  typeof earthReviewedSourceMetadataSchema
>;

/** Loads reviewed Earth-only parser metadata; this is not Platform source registry data. */
export async function loadEarthReviewedSourceMetadata(
  providedPath: string,
): Promise<EarthReviewedSourceMetadata> {
  return earthReviewedSourceMetadataSchema.parse(
    JSON.parse(await readFile(resolve(process.cwd(), providedPath), "utf8")),
  );
}
