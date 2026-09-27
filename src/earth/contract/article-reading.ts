import { z } from "zod";

export const EARTH_READING_SCHEMA_VERSION = "0.3.0";
export const EARTH_READING_BLOCK_LIMIT = 500;
export const EARTH_READING_BYTE_LIMIT = 512 * 1024;

export const earthReadingBlockSchema = z
  .object({
    id: z.string().startsWith("earth-reading:").min(15),
    parentId: z.string().startsWith("earth-reading:").min(15).nullable(),
    kind: z.enum(["paragraph", "subparagraph", "point", "subpoint"]),
    marker: z.string(),
    displayOrder: z.number().int().nonnegative(),
    sourcePath: z.string().startsWith("/ACT[1]/"),
    parserLocator: z.string().min(1),
    contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    content: z
      .array(
        z.discriminatedUnion("type", [
          z
            .object({ type: z.literal("text"), text: z.string().min(1) })
            .strict(),
          z
            .object({
              type: z.literal("child"),
              childId: z.string().startsWith("earth-reading:").min(15),
            })
            .strict(),
        ]),
      )
      .min(1),
  })
  .strict();

export type EarthReadingBlock = z.infer<typeof earthReadingBlockSchema>;

export const earthArticleReadingSchema = z
  .object({
    articleId: z.string().min(1),
    label: z.string().min(1),
    title: z.string().nullable(),
    sourcePath: z.string().startsWith("/ACT[1]/"),
    source: z
      .object({
        xmlMember: z.string().min(1),
        celex: z.string().min(1),
        language: z.literal("en"),
        workUri: z.string().url(),
        expressionUri: z.string().url(),
        manifestationUri: z.string().url(),
        snapshotId: z.string().min(1),
        contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
        contentUrl: z.string().url(),
        retrievedAt: z.string().datetime(),
        officialSourceUrl: z.string().url(),
      })
      .strict(),
    scope: z.literal("normalized-article-body-without-notes"),
    blocks: z
      .array(earthReadingBlockSchema)
      .min(1)
      .max(EARTH_READING_BLOCK_LIMIT),
  })
  .strict()
  .superRefine((reading, context) => {
    try {
      validateReadingBlocks(reading.blocks);
    } catch (error) {
      context.addIssue({
        code: "custom",
        message:
          error instanceof Error ? error.message : "Invalid reading tree",
      });
    }
  });

export type EarthArticleReading = z.infer<typeof earthArticleReadingSchema>;

/** Every block occurs once in a bounded, ordered tree; source text is not duplicated. */
export function validateReadingBlocks(
  blocks: EarthReadingBlock[],
): Map<string, string> {
  const byId = new Map(blocks.map((block) => [block.id, block]));
  if (byId.size !== blocks.length)
    throw new Error("Duplicate reading block ID");
  const seen = new Set<string>();
  const textById = new Map<string, string>();
  let previousOrder = -1;
  const visit = (block: EarthReadingBlock, parentId: string | null): string => {
    if (
      seen.has(block.id) ||
      block.parentId !== parentId ||
      block.displayOrder <= previousOrder
    )
      throw new Error("Invalid reading block ownership or order");
    seen.add(block.id);
    previousOrder = block.displayOrder;
    const text = block.content
      .map((entry) => {
        if (entry.type === "text") return entry.text;
        const child = byId.get(entry.childId);
        if (!child) throw new Error("Missing reading child");
        return visit(child, block.id);
      })
      .join(" ")
      .replaceAll("\u00a0", " ")
      .replace(/\s+/gu, " ")
      .trim();
    if (!text) throw new Error("Empty reading block");
    textById.set(block.id, text);
    return text;
  };
  for (const root of blocks.filter((block) => block.parentId === null))
    visit(root, null);
  if (seen.size !== blocks.length) throw new Error("Unreachable reading block");
  return textById;
}
