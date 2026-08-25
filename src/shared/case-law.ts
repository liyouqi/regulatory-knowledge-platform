import { z } from "zod";

export const caseLawEndpointSchema = z
  .object({
    entityId: z.string().startsWith("case:eu:"),
    kind: z.literal("case"),
    jurisdiction: z.literal("EU"),
    caseCelex: z.string().min(1),
    ecli: z.string().min(1),
    caseNumber: z.string().min(1),
    caseName: z.string().min(1),
    decisionType: z.enum(["judgment", "order"]),
    decisionDate: z.string().date(),
    officialTitle: z.string().min(1),
    sourceUrl: z.string().url(),
    availability: z.literal("metadata-only"),
  })
  .strict();

export const caseLawTargetSchema = z
  .object({
    entityId: z.string().min(1),
    documentId: z.string().min(1),
    documentShortName: z.string().min(1),
    kind: z.literal("document"),
    label: z.string().min(1),
    title: z.string().min(1),
    path: z.string().startsWith("/"),
    sourceUrl: z.string().url(),
    availability: z.literal("loaded"),
  })
  .strict();

export const caseLawRelationshipSchema = z.object({
  id: z.string().startsWith("relationship:"),
  relationType: z.literal("INTERPRETS"),
  provenance: z.literal("OFFICIAL_METADATA"),
  source: caseLawEndpointSchema,
  target: caseLawTargetSchema,
  evidence: z.object({
    text: z.literal("CELLAR case-law_interpretes_resource_legal"),
    locator: z.string().min(1),
    sourceUrl: z.string().url(),
  }),
  builder: z.object({
    method: z.string().min(1),
    version: z.string().min(1),
  }),
  resolutionStatus: z.literal("metadata-only"),
});

export const documentCaseLawRelationshipsResponseSchema = z.object({
  documentId: z.string().min(1),
  buildId: z.string().min(1),
  relationships: z.array(caseLawRelationshipSchema),
});

export type CaseLawEndpoint = z.infer<typeof caseLawEndpointSchema>;
export type CaseLawRelationship = z.infer<typeof caseLawRelationshipSchema>;
export type DocumentCaseLawRelationshipsResponse = z.infer<
  typeof documentCaseLawRelationshipsResponseSchema
>;
