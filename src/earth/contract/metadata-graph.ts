import { z } from "zod";

const nodeSchema = z.object({
  id: z.string(),
  kind: z.enum(["work", "institution"]),
  label: z.string(),
  title: z.string(),
  uri: z.string().url(),
  celex: z.string().optional(),
  included: z.boolean(),
  sectors: z.array(z.string()),
  families: z.array(z.string()),
  types: z.array(z.string()),
  inForce: z.array(z.string()),
});

export const metadataGraphSchema = z.object({
  schemaVersion: z.literal("earth-metadata-graph-1"),
  builtAt: z.string(),
  source: z.object({
    endpoint: z.string().url(),
    rawDirectory: z.string(),
    snapshotHash: z.string(),
    censusRetrievedAt: z.string(),
    scopeDescription: z.string(),
    language: z.literal("ENG"),
  }),
  nodes: z.array(nodeSchema),
  edges: z.array(
    z.object({
      id: z.string(),
      source: z.string(),
      target: z.string(),
      predicate: z.string().url(),
    }),
  ),
  report: z.object({
    scopeWorks: z.number(),
    boundaryWorks: z.number(),
    institutions: z.number(),
    rawRelations: z.number(),
    excludedPredicates: z.record(z.number()),
    missingEnglishBoundary: z.number(),
  }),
});

export type MetadataGraph = z.infer<typeof metadataGraphSchema>;
export type MetadataGraphNode = MetadataGraph["nodes"][number];
export type MetadataGraphEdge = MetadataGraph["edges"][number];
export const CDM = "http://publications.europa.eu/ontology/cdm#";
export const graphPredicateLabels: Record<string, string> = {
  [`${CDM}work_cites_work`]: "Cites",
  [`${CDM}resource_legal_based_on_resource_legal`]: "Based on",
  [`${CDM}resource_legal_completes_resource_legal`]: "Completes",
  [`${CDM}resource_legal_amends_resource_legal`]: "Amends",
  [`${CDM}resource_legal_corrects_resource_legal`]: "Corrects",
  [`${CDM}resource_legal_repeals_resource_legal`]: "Repeals",
  [`${CDM}resource_legal_implements_resource_legal`]: "Implements",
  [`${CDM}work_created_by_agent`]: "Created by · metadata",
};
