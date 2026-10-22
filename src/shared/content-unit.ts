import { z } from "zod";
import { type SourceLocator, sourceLocatorSchema } from "./source-locator";

export const contentRoleSchema = z.enum([
  "operative-text",
  "source-note",
  "toc",
]);
export type ContentRole = z.infer<typeof contentRoleSchema>;
const legacyLayoutNameSchema = z.enum([
  "group",
  "paragraph",
  "list",
  "list-item",
  "list-marker",
  "table",
  "row",
  "cell",
  "emphasis",
  "line-break",
]);
export const layoutNameSchema = z.enum([
  ...legacyLayoutNameSchema.options,
  "link",
  "superscript",
]);
type LayoutName = z.infer<typeof layoutNameSchema>;
export type ContentUnit = {
  contentRole: ContentRole;
  sourceLocator: SourceLocator;
} & (
  | { type: "text"; text: string }
  | {
      type: "element";
      name: LayoutName;
      sourceName?: string;
      sourceAttributes: Record<string, string>;
      columnCount?: number;
      columnStart?: number;
      columnSpan?: number;
      href?: string;
      listStyle?: "ordered" | "unordered";
      children: ContentUnit[];
    }
);
function makeContentUnitSchema(
  extended: boolean,
  semantic = false,
): z.ZodType<ContentUnit> {
  const schema: z.ZodType<ContentUnit> = z.lazy(() => {
    const text = z
      .object({
        type: z.literal("text"),
        text: z.string(),
        contentRole: contentRoleSchema,
        sourceLocator: sourceLocatorSchema,
      })
      .strict();
    const element = z
      .object({
        type: z.literal("element"),
        name: semantic ? layoutNameSchema : legacyLayoutNameSchema,
        sourceName: z.string().optional(),
        columnCount: (extended
          ? z.number().int().positive()
          : z.never()
        ).optional(),
        columnStart: (extended
          ? z.number().int().positive()
          : z.never()
        ).optional(),
        columnSpan: (extended
          ? z.number().int().positive()
          : z.never()
        ).optional(),
        sourceAttributes: z.record(z.string()),
        children: z.array(schema),
        contentRole: contentRoleSchema,
        sourceLocator: sourceLocatorSchema,
      })
      .strict();
    return z.discriminatedUnion("type", [
      text,
      semantic
        ? element.extend({
            href: z.string().url().optional(),
            listStyle: z.enum(["ordered", "unordered"]).optional(),
          })
        : element,
    ]);
  });
  return schema;
}
export const legacyContentUnitSchema = makeContentUnitSchema(false);
export const contentUnitV14Schema = makeContentUnitSchema(true);
export const contentUnitSchema = makeContentUnitSchema(true, true);
export interface ContentRun {
  type: "text";
  text: string;
  contentRole?: ContentRole;
  sourceLocator?: SourceLocator;
}
export interface ContentLayout {
  name: LayoutName | "run";
  contentRole: ContentRole;
  sourceLocator: SourceLocator;
  contentIndex?: number;
  columnCount?: number;
  columnStart?: number;
  columnSpan?: number;
  href?: string;
  listStyle?: "ordered" | "unordered";
  children: ContentLayout[];
}
export const contentLayoutSchema: z.ZodType<ContentLayout> = z.lazy(() =>
  z
    .object({
      name: z.union([layoutNameSchema, z.literal("run")]),
      contentRole: contentRoleSchema,
      sourceLocator: sourceLocatorSchema,
      contentIndex: z.number().int().nonnegative().optional(),
      columnCount: z.number().int().positive().optional(),
      columnStart: z.number().int().positive().optional(),
      columnSpan: z.number().int().positive().optional(),
      href: z.string().url().optional(),
      listStyle: z.enum(["ordered", "unordered"]).optional(),
      children: z.array(contentLayoutSchema),
    })
    .strict(),
);

// Only norm IDs are stable. Runs retain source-local indexes and exact locators.
export function projectContentUnits(units: ContentUnit[]): {
  orderedContent: ContentRun[];
  contentLayout: ContentLayout[];
} {
  const orderedContent: ContentRun[] = [];
  const visit = (unit: ContentUnit): ContentLayout => {
    if (unit.type === "element") validateSemanticLayoutFields(unit);
    const common = {
      contentRole: unit.contentRole,
      sourceLocator: unit.sourceLocator,
    };
    if (
      unit.type === "element" &&
      unit.name === "line-break" &&
      unit.children.length
    )
      throw new Error("Line break cannot own text children");
    if (unit.type === "text" || unit.name === "line-break") {
      const text = unit.type === "text" ? unit.text : "\n";
      const contentIndex = text.length
        ? orderedContent.push({ type: "text", text, ...common }) - 1
        : undefined;
      return {
        name: contentIndex === undefined ? "group" : "run",
        ...common,
        ...(contentIndex === undefined ? {} : { contentIndex }),
        children: [],
      };
    }
    let projectedChildren = unit.children.map(visit);
    if (unit.name === "table" && unit.columnCount !== undefined) {
      const rows: ContentLayout[] = [];
      const flatten = (node: ContentLayout) => {
        if (node.name === "row") rows.push(node);
        else if (node.name === "group") node.children.forEach(flatten);
        else throw new Error("Invalid table row layout");
      };
      projectedChildren.forEach(flatten);
      projectedChildren = rows;
    }
    return {
      name: unit.name,
      ...common,
      ...(unit.columnCount === undefined
        ? {}
        : { columnCount: unit.columnCount }),
      ...(unit.columnStart === undefined
        ? {}
        : { columnStart: unit.columnStart }),
      ...(unit.columnSpan === undefined ? {} : { columnSpan: unit.columnSpan }),
      ...(unit.href === undefined ? {} : { href: unit.href }),
      ...(unit.listStyle === undefined ? {} : { listStyle: unit.listStyle }),
      children: projectedChildren,
    };
  };
  return { orderedContent, contentLayout: units.map(visit) };
}

export function contentUnitsText(
  units: ContentUnit[],
  role: ContentRole,
): string {
  return projectContentUnits(units)
    .orderedContent.filter((entry) => entry.contentRole === role)
    .map((entry) => entry.text)
    .join("");
}

export function validateContentLayout(
  entries: ContentRun[],
  layout: ContentLayout[],
): void {
  const indexes: number[] = [];
  const visit = (
    node: ContentLayout,
    parent?: ContentLayout,
    tableWidth?: number,
  ) => {
    validateSemanticLayoutFields(node);
    if (
      parent?.contentRole === "source-note" &&
      node.contentRole !== "source-note"
    )
      throw new Error("Publisher note cannot contain operative layout");
    const positive = (v: number | undefined) =>
      v !== undefined && Number.isSafeInteger(v) && v > 0;
    if (
      node.columnCount !== undefined &&
      (node.name !== "table" || !positive(node.columnCount))
    )
      throw new Error("Invalid table column count");
    if (
      (node.columnStart === undefined) !== (node.columnSpan === undefined) ||
      (node.columnStart !== undefined &&
        (node.name !== "cell" ||
          !positive(node.columnStart) ||
          !positive(node.columnSpan) ||
          parent?.name !== "row" ||
          tableWidth === undefined))
    )
      throw new Error("Invalid cell column metadata");
    if (node.name === "table" && node.columnCount !== undefined) {
      const rows = node.children;
      if (rows.some((row) => row.name !== "row"))
        throw new Error("Invalid table row layout");
      if (!rows.length) throw new Error("Table has no rows");
      for (const row of rows) {
        let next = 1;
        for (const cell of row.children) {
          if (
            cell.name !== "cell" ||
            cell.columnStart !== next ||
            !positive(cell.columnSpan)
          )
            throw new Error("Invalid table row coverage");
          next += cell.columnSpan as number;
        }
        if (next !== node.columnCount + 1)
          throw new Error("Invalid table row coverage");
      }
    }

    if (node.name === "run") {
      const entry = entries[node.contentIndex ?? -1];
      if (
        !entry ||
        node.children.length ||
        entry.contentRole !== node.contentRole ||
        JSON.stringify(entry.sourceLocator) !==
          JSON.stringify(node.sourceLocator)
      ) {
        throw new Error("Structured content run differs from ordered content");
      }
      indexes.push(node.contentIndex as number);
    } else if (node.contentIndex !== undefined)
      throw new Error("Container must not own a text index");
    for (const child of node.children)
      visit(child, node, node.name === "table" ? node.columnCount : tableWidth);
  };
  for (const node of layout) visit(node);
  if (
    indexes.length !== entries.length ||
    indexes.some((index, position) => index !== position)
  ) {
    throw new Error(
      "Structured content must reference every ordered run once in source order",
    );
  }
}

function validateSemanticLayoutFields(node: {
  name: string;
  href?: string;
  listStyle?: string;
}) {
  if (
    (node.href !== undefined && node.name !== "link") ||
    (node.name === "link" && node.href === undefined)
  )
    throw new Error("Normalized link must own its href");
  if (node.href !== undefined) {
    const url = new URL(node.href);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error("Unsupported normalized link target");
  }
  if (
    node.listStyle !== undefined &&
    (node.name !== "list" || !["ordered", "unordered"].includes(node.listStyle))
  )
    throw new Error("List style belongs only to a normalized list");
}
