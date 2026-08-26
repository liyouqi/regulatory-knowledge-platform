import { z } from "zod";
import { sourceLocatorSchema } from "./source-locator";

export const implementationTimelineEventTypeSchema = z.enum([
  "publication",
  "entry-into-force",
  "general-application",
  "phased-application",
  "transitional-period",
  "measure-milestone",
]);

export const timelineDateBasisSchema = z.enum([
  "official-metadata",
  "explicit-legal-text",
  "calculated-from-publication",
]);

export const implementationTimelineEventSchema = z
  .object({
    id: z.string().startsWith("timeline-event:"),
    eventType: implementationTimelineEventTypeSchema,
    date: z.string().date(),
    label: z.string().min(1),
    scopeLabel: z.string().min(1),
    dateBasis: timelineDateBasisSchema,
    source: z
      .object({
        entityId: z.string().min(1),
        label: z.string().min(1),
        path: z.string().startsWith("/"),
        sourceUrl: z.string().url(),
        sourceLocator: sourceLocatorSchema.optional(),
        evidenceText: z.string().min(1),
        evidenceLocator: z.string().min(1),
      })
      .strict(),
    derivation: z
      .object({
        method: z.literal("calendar-days-after-publication"),
        baseDate: z.string().date(),
        days: z.number().int().positive(),
      })
      .strict()
      .optional(),
    provenance: z.enum(["LEGAL_TEXT", "OFFICIAL_METADATA", "DERIVED"]),
    reviewStatus: z.literal("reviewed"),
    reviewedAt: z.string().datetime(),
    builder: z
      .object({
        method: z.literal("implementation-timeline"),
        version: z.literal("1.0.0"),
      })
      .strict(),
  })
  .strict()
  .superRefine((event, context) => {
    const valid =
      (event.dateBasis === "official-metadata" &&
        event.provenance === "OFFICIAL_METADATA" &&
        !event.derivation) ||
      (event.dateBasis === "explicit-legal-text" &&
        event.provenance === "LEGAL_TEXT" &&
        !event.derivation) ||
      (event.dateBasis === "calculated-from-publication" &&
        event.provenance === "DERIVED" &&
        Boolean(event.derivation));
    if (!valid) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Timeline date basis, provenance, and derivation disagree",
      });
    }
  });

export const implementationTimelineSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    id: z.string().startsWith("timeline:"),
    version: z.string().min(1),
    document: z
      .object({
        id: z.string().min(1),
        slug: z.string().min(1),
        shortName: z.string().min(1),
        officialTitle: z.string().min(1),
        sourceUrl: z.string().url(),
        sourceVersion: z.string().min(1),
        asOf: z.string().date(),
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
    events: z.array(implementationTimelineEventSchema).min(1),
  })
  .strict();

export type ImplementationTimeline = z.infer<
  typeof implementationTimelineSchema
>;
export type ImplementationTimelineEvent = z.infer<
  typeof implementationTimelineEventSchema
>;
