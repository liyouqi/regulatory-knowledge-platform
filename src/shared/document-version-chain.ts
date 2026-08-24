import { z } from "zod";

export const documentVersionNodeSchema = z.object({
  id: z.string().startsWith("version:"),
  documentId: z.string().min(1),
  kind: z.enum([
    "original-oj-snapshot",
    "consolidated-snapshot",
    "current-version-link",
    "corrigendum",
  ]),
  label: z.string().min(1),
  date: z.string().date().optional(),
  sourceUrl: z.string().url(),
  availability: z.enum(["loaded", "external"]),
});

export const documentVersionEdgeSchema = z.object({
  id: z.string().startsWith("version-edge:"),
  documentId: z.string().min(1),
  sourceVersionId: z.string().startsWith("version:"),
  relationType: z.enum(["CURRENT_VERSION_LINK", "HAS_CORRIGENDUM"]),
  targetVersionId: z.string().startsWith("version:"),
  provenance: z.literal("OFFICIAL_METADATA"),
  sourceRef: z.string().url(),
});

export const documentVersionChainSchema = z
  .object({
    documentId: z.string().min(1),
    buildId: z.string().min(1),
    coverage: z.literal("source-status-only"),
    checkedAt: z.string().datetime().optional(),
    loadedVersionId: z.string().startsWith("version:"),
    nodes: z.array(documentVersionNodeSchema).min(2),
    edges: z.array(documentVersionEdgeSchema).min(1),
  })
  .superRefine((chain, context) => {
    const nodeIds = new Set(chain.nodes.map((node) => node.id));
    if (nodeIds.size !== chain.nodes.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Version node IDs must be unique",
        path: ["nodes"],
      });
    }
    const edgeIds = new Set(chain.edges.map((edge) => edge.id));
    if (edgeIds.size !== chain.edges.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Version edge IDs must be unique",
        path: ["edges"],
      });
    }
    const loadedNodes = chain.nodes.filter(
      (node) => node.availability === "loaded",
    );
    if (
      loadedNodes.length !== 1 ||
      loadedNodes[0]?.id !== chain.loadedVersionId
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Version chain must identify exactly one loaded snapshot",
        path: ["loadedVersionId"],
      });
    }
    for (const [index, node] of chain.nodes.entries()) {
      if (node.documentId !== chain.documentId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Version node belongs to a different document",
          path: ["nodes", index, "documentId"],
        });
      }
    }
    for (const [index, edge] of chain.edges.entries()) {
      if (
        edge.documentId !== chain.documentId ||
        !nodeIds.has(edge.sourceVersionId) ||
        !nodeIds.has(edge.targetVersionId)
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Version edge has an invalid document or endpoint",
          path: ["edges", index],
        });
      }
    }
  });

export type DocumentVersionNode = z.infer<typeof documentVersionNodeSchema>;
export type DocumentVersionEdge = z.infer<typeof documentVersionEdgeSchema>;
export type DocumentVersionChain = z.infer<typeof documentVersionChainSchema>;
