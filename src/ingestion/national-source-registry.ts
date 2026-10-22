import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";

export function officialNationalHttpsUrl(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "www.gesetze-im-internet.de" ||
    url.username ||
    url.password ||
    url.port
  )
    throw new Error(`Unexpected national official URL: ${value}`);
  return url.toString();
}
const count = z.number().int().nonnegative();
export const nationalQualitySchema = z
  .object({
    normCount: count,
    normIds: z.array(z.string().min(1)),
    metadataHashes: z.record(
      z.string().min(1),
      z.string().regex(/^sha256:[a-f0-9]{64}$/),
    ),
    structuralNodeCount: count,
    provisionCount: count,
    sourceNoteCount: count,
    tocCount: count,
    blockCount: count,
    tableCount: count,
    maximumWarnings: count,
    textHashes: z.record(
      z.string().min(1),
      z.string().regex(/^sha256:[a-f0-9]{64}$/),
    ),
  })
  .strict();
export const nationalSourceDefinitionSchema = z
  .object({
    status: z.enum(["active", "candidate"]),
    localId: z.string().regex(/^de-[a-z0-9-]+$/),
    documentId: z.string().regex(/^de:gii:bjnr[0-9]+$/),
    sourceWorkId: z.string().regex(/^BJNR[0-9]+$/),
    slug: z.string().regex(/^[a-z0-9_]+$/),
    familyId: z.string().startsWith("family:"),
    authority: z.literal("Germany"),
    jurisdiction: z.literal("DE"),
    shortName: z.string().min(1),
    officialTitle: z.string().min(1),
    aliases: z.array(z.string().min(1)).min(1),
    language: z.literal("de"),
    documentType: z.literal("law"),
    regulatoryLevel: z.literal("level-1"),
    measureType: z.literal("primary-act"),
    enactmentDate: z.string().date(),
    publicationDate: z.string().date().optional(),
    publicationEvidenceUrl: z.string().url().optional(),
    lastAmendmentDate: z.string().date(),
    checkedAt: z.string().datetime(),
    pageUrl: z.string().url(),
    contentUrl: z.string().url(),
    contentMediaType: z.literal("application/xml"),
    topics: z.array(z.string().min(1)),
    quality: nationalQualitySchema.optional(),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (s.documentId !== `de:gii:${s.sourceWorkId.toLowerCase()}`)
      ctx.addIssue({
        code: "custom",
        path: ["documentId"],
        message: "Document ID must match source work ID",
      });
    if (
      s.pageUrl !== `https://www.gesetze-im-internet.de/${s.slug}/` ||
      s.contentUrl !== `${s.pageUrl}xml.zip`
    )
      ctx.addIssue({
        code: "custom",
        path: ["contentUrl"],
        message: "URL must match the registered official slug",
      });
    if (
      s.status === "active" &&
      (!s.quality || !s.publicationDate || !s.publicationEvidenceUrl)
    )
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "Active sources require reviewed quality and publication date",
      });
  });
export type NationalSourceDefinition = z.infer<
  typeof nationalSourceDefinitionSchema
>;
const defaultPath = () =>
  resolve(process.cwd(), "data/national-source-registry.json");
function parseCatalog(value: unknown): NationalSourceDefinition[] {
  const result = z.array(nationalSourceDefinitionSchema).parse(value);
  for (const key of ["localId", "documentId", "sourceWorkId", "slug"] as const)
    if (new Set(result.map((x) => x[key])).size !== result.length)
      throw new Error(`Duplicate national source ${key}`);
  return result;
}
export function loadNationalSourceCatalogSync(
  path = defaultPath(),
): NationalSourceDefinition[] {
  return parseCatalog(JSON.parse(readFileSync(path, "utf8")));
}
export function loadNationalSourceRegistrySync(
  path = defaultPath(),
): NationalSourceDefinition[] {
  return loadNationalSourceCatalogSync(path).filter(
    (s) => s.status === "active",
  );
}
export async function loadNationalSourceRegistry(
  path = defaultPath(),
): Promise<NationalSourceDefinition[]> {
  return parseCatalog(JSON.parse(await readFile(path, "utf8"))).filter(
    (s) => s.status === "active",
  );
}
export async function findNationalSource(
  localId: string,
  path = defaultPath(),
): Promise<NationalSourceDefinition> {
  const source = parseCatalog(JSON.parse(await readFile(path, "utf8"))).find(
    (s) => s.localId === localId,
  );
  if (!source) throw new Error(`National source is not registered: ${localId}`);
  return source;
}
