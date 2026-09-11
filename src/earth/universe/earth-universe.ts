import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";

export const EARTH_UNIVERSE_SCHEMA_VERSION = "0.1.0" as const;

export const earthUniverseMemberSchema = z
  .object({
    celex: z.string().regex(/^[0-9][0-9A-Z()_-]{4,39}$/u),
    label: z.string().min(1),
  })
  .strict();

export const earthUniverseSchema = z
  .object({
    schemaVersion: z.literal(EARTH_UNIVERSE_SCHEMA_VERSION),
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    version: z.string().regex(/^\d+\.\d+\.\d+$/u),
    displayName: z.string().min(1),
    description: z.string().min(1),
    provenance: z.literal("EDITORIAL"),
    language: z.literal("ENG"),
    expressionPolicy: z.literal("english-celex-expression"),
    relationshipPolicy: z
      .object({
        includeOfficialOneHopBoundary: z.boolean(),
      })
      .strict(),
    members: z.array(earthUniverseMemberSchema).min(1),
  })
  .strict()
  .superRefine((universe, context) => {
    const celexes = universe.members.map(({ celex }) => celex);
    if (new Set(celexes).size !== celexes.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Earth universe contains duplicate CELEX identifiers",
        path: ["members"],
      });
    }
  });

export type EarthUniverse = z.infer<typeof earthUniverseSchema>;

export async function loadEarthUniverse(
  providedPath: string,
): Promise<EarthUniverse> {
  const path = resolve(process.cwd(), providedPath);
  return earthUniverseSchema.parse(JSON.parse(await readFile(path, "utf8")));
}

export function findEarthUniverseMember(
  universe: EarthUniverse,
  celex: string,
) {
  const normalized = celex.trim().toUpperCase();
  return universe.members.find((member) => member.celex === normalized);
}
