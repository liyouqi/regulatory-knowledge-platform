import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";

const CSSF_HOSTS = new Set(["cssf.lu", "www.cssf.lu"]);

export function officialCssfHttpsUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || !CSSF_HOSTS.has(url.hostname)) {
    throw new Error(`Unexpected CSSF official URL: ${value}`);
  }
  return url.toString();
}

export function cssfDocumentLogicalId(localId: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(localId)) {
    throw new Error(`Invalid CSSF local identifier: ${localId}`);
  }
  return `lu:cssf:${localId}`;
}

export const cssfSourceDefinitionSchema = z
  .object({
    localId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    familyId: z.literal("family:cssf"),
    authority: z.literal("CSSF"),
    jurisdiction: z.literal("LU"),
    shortName: z.string().min(1),
    officialTitle: z.string().min(1),
    subject: z.string().min(1).optional(),
    aliases: z.array(z.string().min(1)).min(1),
    language: z.literal("en"),
    documentType: z.enum([
      "circular",
      "communication",
      "regulation",
      "guidance",
    ]),
    publicationDate: z.string().date(),
    updatedDate: z.string().date().optional(),
    checkedAt: z.string().datetime(),
    pageUrl: z.string().url(),
    contentUrl: z.string().url(),
    contentMediaType: z.enum(["text/html", "application/pdf"]),
    topics: z.array(z.string().min(1)).min(1),
    quality: z
      .object({
        sectionCount: z.number().int().positive(),
        blockCount: z.number().int().positive(),
        maximumWarnings: z.number().int().nonnegative(),
        textHashes: z.record(
          z.string().min(1),
          z.string().regex(/^sha256:[a-f0-9]{64}$/),
        ),
      })
      .optional(),
  })
  .superRefine((source, context) => {
    for (const [field, value] of [
      ["pageUrl", source.pageUrl],
      ["contentUrl", source.contentUrl],
    ] as const) {
      try {
        officialCssfHttpsUrl(value);
      } catch {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${field} must use the official CSSF HTTPS host`,
          path: [field],
        });
      }
    }
  });

export type CssfSourceDefinition = z.infer<typeof cssfSourceDefinitionSchema>;

function parseCssfSourceRegistry(raw: unknown): CssfSourceDefinition[] {
  const sources = z.array(cssfSourceDefinitionSchema).min(1).parse(raw);
  const identifiers = new Set<string>();
  const aliasOwners = new Map<string, string>();

  for (const source of sources) {
    if (identifiers.has(source.localId)) {
      throw new Error(`Duplicate CSSF local ID: ${source.localId}`);
    }
    identifiers.add(source.localId);
    for (const alias of [source.shortName, ...source.aliases]) {
      const normalized = alias.normalize("NFKC").trim().toLowerCase();
      const owner = aliasOwners.get(normalized);
      if (owner && owner !== source.localId) {
        throw new Error(
          `Ambiguous CSSF source alias ${alias}: used by ${owner} and ${source.localId}`,
        );
      }
      aliasOwners.set(normalized, source.localId);
    }
  }
  return sources;
}

export function loadCssfSourceRegistrySync(
  registryPath = resolve(process.cwd(), "data/cssf-source-registry.json"),
): CssfSourceDefinition[] {
  return parseCssfSourceRegistry(
    JSON.parse(readFileSync(registryPath, "utf8")),
  );
}

export async function loadCssfSourceRegistry(
  registryPath = resolve(process.cwd(), "data/cssf-source-registry.json"),
): Promise<CssfSourceDefinition[]> {
  return parseCssfSourceRegistry(
    JSON.parse(await readFile(registryPath, "utf8")),
  );
}

export async function findCssfSource(
  localId: string,
): Promise<CssfSourceDefinition> {
  const source = (await loadCssfSourceRegistry()).find(
    (candidate) => candidate.localId === localId,
  );
  if (!source) throw new Error(`CSSF source is not registered: ${localId}`);
  return source;
}
