import { z } from "zod";

const lifecycleEndpointBaseSchema = z.object({
  entityId: z.string().min(1),
  celex: z.string().min(1),
  documentId: z.string().min(1),
  documentShortName: z.string().min(1),
  label: z.string().min(1),
  title: z.string().nullable(),
  sourceUrl: z.string().url(),
});

export const lifecycleEndpointSchema = z.discriminatedUnion("kind", [
  lifecycleEndpointBaseSchema
    .extend({
      kind: z.literal("document"),
      path: z.string().startsWith("/"),
      availability: z.literal("loaded"),
    })
    .strict(),
  lifecycleEndpointBaseSchema
    .extend({
      kind: z.literal("external-work"),
      availability: z.literal("external"),
    })
    .strict(),
]);

export const lifecycleRelationshipSchema = z.object({
  id: z.string().startsWith("relationship:"),
  relationType: z.enum(["AMENDS", "CORRECTS"]),
  provenance: z.literal("OFFICIAL_METADATA"),
  source: lifecycleEndpointSchema,
  target: lifecycleEndpointSchema,
  evidence: z.object({
    text: z.string().min(1),
    locator: z.string().min(1),
    sourceUrl: z.string().url(),
  }),
  builder: z.object({
    method: z.string().min(1),
    version: z.string().min(1),
  }),
  resolutionStatus: z.enum(["resolved", "external"]),
});

export const documentLifecycleRelationshipsResponseSchema = z.object({
  documentId: z.string().min(1),
  buildId: z.string().min(1),
  relationships: z.array(lifecycleRelationshipSchema),
});

export type LifecycleEndpoint = z.infer<typeof lifecycleEndpointSchema>;
export type LifecycleRelationship = z.infer<typeof lifecycleRelationshipSchema>;
export type DocumentLifecycleRelationshipsResponse = z.infer<
  typeof documentLifecycleRelationshipsResponseSchema
>;
