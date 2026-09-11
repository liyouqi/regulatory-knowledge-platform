import { z } from "zod";

export const EARTH_READ_MODEL_SCHEMA_VERSION = "0.1.0" as const;

export const earthEntityKindSchema = z.enum([
  "document",
  "title",
  "part",
  "chapter",
  "section",
  "subsection",
  "division",
  "article",
  "recital",
  "annex",
  "other",
  "external-work",
]);

export const earthMeasureTypeSchema = z.enum([
  "primary-act",
  "rts",
  "its",
  "guideline",
  "qa",
  "other",
]);

export const earthOfficialIdentitySchema = z
  .object({
    celex: z
      .string()
      .regex(/^[0-9][0-9A-Z()_-]{4,39}$/u)
      .optional(),
    workUri: z.string().url(),
    expressionUri: z.string().url().optional(),
  })
  .strict();

const earthNodeBaseSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  title: z.string().min(1).optional(),
});

const includedEarthWorkNodeSchema = earthNodeBaseSchema
  .extend({
    membership: z.literal("included"),
    entityKind: z.literal("document"),
    workId: z.string().min(1),
    officialIdentity: earthOfficialIdentitySchema,
    measureType: earthMeasureTypeSchema,
    path: z.string().startsWith("/").optional(),
  })
  .strict();

const includedEarthHierarchyNodeSchema = earthNodeBaseSchema
  .extend({
    membership: z.literal("included"),
    entityKind: earthEntityKindSchema.exclude(["document", "external-work"]),
    workId: z.string().min(1),
    parentId: z.string().min(1).optional(),
    path: z.string().startsWith("/").optional(),
    sourceLocator: z.string().min(1),
  })
  .strict();

const boundaryEarthNodeSchema = earthNodeBaseSchema
  .extend({
    membership: z.literal("boundary"),
    entityKind: z.literal("external-work"),
    officialIdentity: earthOfficialIdentitySchema,
    sourceUrl: z.string().url(),
  })
  .strict();

export const earthNodeSchema = z.union([
  includedEarthWorkNodeSchema,
  includedEarthHierarchyNodeSchema,
  boundaryEarthNodeSchema,
]);

export const earthRelationshipTypeSchema = z.enum([
  "REFERENCES",
  "MANDATES",
  "ADOPTED_UNDER",
  "AMENDS",
  "CORRECTS",
  "INTERPRETS",
  "SUPPLEMENTS",
  "IMPLEMENTS",
  "RELATED_DOCUMENT",
]);

export const earthOfficialProvenanceSchema = z.enum([
  "LEGAL_TEXT",
  "CELLAR_METADATA",
  "EUR_LEX_METADATA",
  "OFFICIAL_MAPPING",
]);

const exactEarthEdgeSchema = z
  .object({
    projection: z.literal("exact"),
    id: z.string().startsWith("relationship:"),
    source: z.string().min(1),
    target: z.string().min(1),
    relationType: earthRelationshipTypeSchema,
    provenance: earthOfficialProvenanceSchema,
    evidence: z
      .object({
        text: z.string().min(1),
        locator: z.string().min(1),
        sourceUrl: z.string().url(),
      })
      .strict(),
  })
  .strict();

const aggregateEarthEdgeSchema = z
  .object({
    projection: z.literal("aggregate"),
    id: z.string().startsWith("earth-aggregate:"),
    source: z.string().min(1),
    target: z.string().min(1),
    relationTypes: z.array(earthRelationshipTypeSchema).min(1),
    provenances: z.array(earthOfficialProvenanceSchema).min(1),
    relationshipIds: z.array(z.string().startsWith("relationship:")).min(1),
    count: z.number().int().positive(),
  })
  .strict()
  .superRefine((edge, context) => {
    if (new Set(edge.relationshipIds).size !== edge.relationshipIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Aggregate Earth edge contains duplicate relationship IDs",
        path: ["relationshipIds"],
      });
    }
    if (edge.count !== edge.relationshipIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Aggregate Earth edge count must match relationship IDs",
        path: ["count"],
      });
    }
  });

export const earthEdgeSchema = z.union([
  exactEarthEdgeSchema,
  aggregateEarthEdgeSchema,
]);

export const earthGraphSchema = z
  .object({
    schemaVersion: z.literal(EARTH_READ_MODEL_SCHEMA_VERSION),
    buildId: z.string().min(1),
    builtAt: z.string().datetime(),
    universeId: z.string().min(1),
    universeVersion: z.string().min(1),
    sourceSnapshotIds: z.array(z.string().min(1)).min(1),
    nodes: z.array(earthNodeSchema),
    edges: z.array(earthEdgeSchema),
  })
  .strict();

export type EarthNode = z.infer<typeof earthNodeSchema>;
export type EarthEdge = z.infer<typeof earthEdgeSchema>;
export type EarthGraph = z.infer<typeof earthGraphSchema>;
