import { z } from "zod";
import { documentSummarySchema } from "./legal";

export const countryCodeSchema = z.enum([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  "NO",
  "IS",
  "LI",
  "GB",
  "CH",
]);

const httpsUrl = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === "https:", {
    message: "Country source links require HTTPS",
  });

export const countryDefinitionSchema = z
  .object({
    code: countryCodeSchema,
    slug: z.string().regex(/^[a-z]{2}$/),
    name: z.string().min(1),
    nameZh: z.string().min(1),
    group: z.enum(["EU", "EEA-EFTA", "OTHER"]),
    legislationPortal: z
      .object({
        label: z.string().min(1),
        url: httpsUrl,
        reviewStatus: z.enum(["reviewed", "pending"]),
        checkedAt: z.string().datetime().nullable(),
        evidenceUrl: httpsUrl,
      })
      .strict(),
  })
  .strict()
  .superRefine((country, context) => {
    if (country.slug !== country.code.toLowerCase()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Country slug must match its ISO code",
      });
    }
    if (
      country.legislationPortal.reviewStatus === "reviewed" &&
      !country.legislationPortal.checkedAt
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Reviewed country portals require a check time",
      });
    }
  });

export const countryDatasetSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    datasetVersion: z.string().min(1),
    countries: z.array(countryDefinitionSchema).length(32),
  })
  .strict()
  .superRefine((dataset, context) => {
    const codes = dataset.countries.map((country) => country.code);
    if (new Set(codes).size !== codes.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Country codes must be unique",
      });
    }
    for (const country of dataset.countries) {
      const expected = ["NO", "IS", "LI"].includes(country.code)
        ? "EEA-EFTA"
        : ["GB", "CH"].includes(country.code)
          ? "OTHER"
          : "EU";
      if (country.group !== expected) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Country group mismatch: ${country.code}`,
        });
      }
    }
  });

const runtimeSchema = z.object({
  buildId: z.string().min(1),
  profileId: z.string().min(1),
  profileDisplayName: z.string().min(1),
  datasetVersion: z.string().min(1),
});

const countryEntrySchema = z
  .object({
    country: countryDefinitionSchema,
    localDocumentCount: z.number().int().nonnegative(),
    readerAvailability: z.enum(["available", "none"]),
    path: z.string().startsWith("/countries/"),
  })
  .strict();

export const countryCatalogResponseSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    runtime: runtimeSchema,
    countries: z.array(countryEntrySchema),
    euDocumentCount: z.number().int().nonnegative(),
  })
  .strict();

export const countryDetailResponseSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    runtime: runtimeSchema,
    entry: countryEntrySchema,
    localDocuments: z.array(
      documentSummarySchema.extend({ jurisdiction: countryCodeSchema }),
    ),
    euFramework: z
      .object({
        documentCount: z.number().int().nonnegative(),
        path: z.literal("/topics"),
        applicabilityConclusion: z.literal(false),
        relationshipStatus: z.literal("not-assessed"),
      })
      .strict(),
  })
  .strict();

export type CountryDefinition = z.infer<typeof countryDefinitionSchema>;
export type CountryDataset = z.infer<typeof countryDatasetSchema>;
export type CountryCatalogResponse = z.infer<
  typeof countryCatalogResponseSchema
>;
export type CountryDetailResponse = z.infer<typeof countryDetailResponseSchema>;
