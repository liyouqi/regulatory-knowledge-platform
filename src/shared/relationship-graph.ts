import { z } from "zod";
import {
  provisionRelationshipSchema,
  relationshipEndpointSchema,
  relationshipProvenanceSchema,
} from "./legal";

export const relationshipGraphNodeSchema = relationshipEndpointSchema.extend({
  role: z.enum(["center", "neighbor"]),
  explorerAnchor: z.string().min(1).optional(),
});

export const relationshipGraphEvidenceSchema = z.object({
  text: z.string().min(1),
  sourceUrl: z.string().url(),
});

export const relationshipGraphEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  relationType: provisionRelationshipSchema.shape.relationType,
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

export type RelationshipGraphNode = z.infer<typeof relationshipGraphNodeSchema>;
export type RelationshipGraphEdge = z.infer<typeof relationshipGraphEdgeSchema>;
export type RelationshipGraphResponse = z.infer<
  typeof relationshipGraphResponseSchema
>;
