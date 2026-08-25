import { z } from "zod";
import {
  provisionRelationshipSchema,
  relationshipEndpointSchema,
  relationshipProvenanceSchema,
} from "./legal";

const loadedRelationshipGraphNodeSchema = relationshipEndpointSchema.extend({
  kind: relationshipEndpointSchema.shape.kind.refine(
    (kind) => kind !== "external-work",
  ),
  role: z.enum(["center", "neighbor"]),
  explorerAnchor: z.string().min(1).optional(),
});

const externalRelationshipGraphNodeSchema = z
  .object({
    entityId: z.string().min(1),
    documentId: z.string().min(1),
    documentShortName: z.string().min(1),
    kind: z.literal("external-work"),
    label: z.string().min(1),
    title: z.null(),
    sourceUrl: z.string().url(),
    role: z.literal("neighbor"),
  })
  .strict();

const caseRelationshipGraphNodeSchema = z
  .object({
    entityId: z.string().startsWith("case:eu:"),
    documentShortName: z.literal("CJEU"),
    kind: z.literal("case"),
    label: z.string().min(1),
    title: z.string().min(1),
    sourceUrl: z.string().url(),
    role: z.literal("neighbor"),
    caseCelex: z.string().min(1),
    ecli: z.string().min(1),
    decisionType: z.enum(["judgment", "order"]),
    decisionDate: z.string().date(),
    officialTitle: z.string().min(1),
  })
  .strict();

export const relationshipGraphNodeSchema = z.union([
  loadedRelationshipGraphNodeSchema,
  externalRelationshipGraphNodeSchema,
  caseRelationshipGraphNodeSchema,
]);

export const relationshipGraphEvidenceSchema = z.object({
  text: z.string().min(1),
  sourceUrl: z.string().url(),
});

export const relationshipGraphEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  relationType: z.union([
    provisionRelationshipSchema.shape.relationType,
    z.literal("INTERPRETS"),
  ]),
  provenance: relationshipProvenanceSchema,
  relationshipIds: z.array(z.string().startsWith("relationship:")).min(1),
  evidence: z.array(relationshipGraphEvidenceSchema).min(1),
  score: z.number().nonnegative().optional(),
});

export const relationshipGraphResponseSchema = z.object({
  documentId: z.string().min(1),
  provisionId: z.string().min(1),
  buildId: z.string().min(1),
  nodes: z.array(relationshipGraphNodeSchema).min(1),
  edges: z.array(relationshipGraphEdgeSchema),
});

export const documentRelationshipGraphResponseSchema = z.object({
  documentId: z.string().min(1),
  buildId: z.string().min(1),
  nodes: z.array(relationshipGraphNodeSchema).min(1),
  edges: z.array(relationshipGraphEdgeSchema),
});

export const globalRelationshipGraphResponseSchema = z.object({
  scope: z.literal("global"),
  buildId: z.string().min(1),
  nodes: z.array(relationshipGraphNodeSchema).min(1),
  edges: z.array(relationshipGraphEdgeSchema),
});

export type RelationshipGraphNode = z.infer<typeof relationshipGraphNodeSchema>;
export type RelationshipGraphEdge = z.infer<typeof relationshipGraphEdgeSchema>;
export type RelationshipGraphResponse = z.infer<
  typeof relationshipGraphResponseSchema
>;
export type DocumentRelationshipGraphResponse = z.infer<
  typeof documentRelationshipGraphResponseSchema
>;
export type GlobalRelationshipGraphResponse = z.infer<
  typeof globalRelationshipGraphResponseSchema
>;
export type AnyRelationshipGraphResponse =
  | RelationshipGraphResponse
  | DocumentRelationshipGraphResponse
  | GlobalRelationshipGraphResponse;
