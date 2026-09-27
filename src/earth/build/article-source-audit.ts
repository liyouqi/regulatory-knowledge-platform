import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import type { Provision } from "../../canonical/schema";
import {
  type EarthReadingBlock,
  earthReadingBlockSchema,
  validateReadingBlocks,
} from "../contract/article-reading";

type OrderedNode = Record<string, unknown>;
type Element = {
  tag: string;
  path: string;
  identifier?: string;
  listType?: string;
  children: Element[];
  raw: OrderedNode;
};
const excluded = new Set(["NOTE", "NO.P", "NO.PARAG"]);
const spaced = new Set([
  "ALINEA",
  "ITEM",
  "LIST",
  "NP",
  "P",
  "PARAG",
  "TABLE",
  "TXT",
]);
const normalize = (text: string) =>
  text.replaceAll("\u00a0", " ").replace(/\s+/gu, " ").trim();
const tagOf = (node: OrderedNode) =>
  Object.keys(node).find(
    (key) => key !== ":@" && key !== "#text" && !key.startsWith("?"),
  );
function rawChildren(node: OrderedNode): OrderedNode[] {
  const tag = tagOf(node);
  return tag && Array.isArray(node[tag]) ? (node[tag] as OrderedNode[]) : [];
}
function textOf(node: OrderedNode): string {
  if ("#text" in node) return String(node["#text"] ?? "");
  const tag = tagOf(node);
  if (!tag || excluded.has(tag)) return "";
  const text = rawChildren(node).map(textOf).join("");
  return spaced.has(tag) ? ` ${text} ` : text;
}
function tree(
  nodes: OrderedNode[],
  parent = "",
  listType?: string,
  xsiDeclared = false,
): Element[] {
  const counts = new Map<string, number>();
  return nodes.flatMap((node) => {
    const tag = tagOf(node);
    if (!tag) return [];
    const attrs = node[":@"] as Record<string, unknown> | undefined;
    const hasXsi =
      xsiDeclared ||
      attrs?.["@_xmlns:xsi"] === "http://www.w3.org/2001/XMLSchema-instance";
    if (
      !/^[A-Z0-9._-]+$/u.test(tag) ||
      Object.entries(attrs ?? {}).some(([key, value]) => {
        if (
          key === "@_xmlns:xsi" &&
          value === "http://www.w3.org/2001/XMLSchema-instance"
        )
          return false;
        // Two older snapshots declare fmx but never use it on elements/attributes.
        if (key === "@_xmlns:fmx" && value === "http://opoce") return false;
        if (key === "@_xsi:noNamespaceSchemaLocation" && hasXsi) return false;
        return key.startsWith("@_xmlns") || key.includes(":");
      })
    )
      throw new Error(
        `Namespaced/unsupported Formex element in Earth source audit: ${parent}/${tag}`,
      );
    const index = (counts.get(tag) ?? 0) + 1;
    counts.set(tag, index);
    const path = `${parent}/${tag}[${index}]`;
    return [
      {
        tag,
        path,
        listType,
        identifier:
          typeof attrs?.["@_IDENTIFIER"] === "string"
            ? attrs["@_IDENTIFIER"]
            : undefined,
        children: tree(
          rawChildren(node),
          path,
          tag === "LIST"
            ? String(attrs?.["@_TYPE"] ?? "").toUpperCase()
            : undefined,
          hasXsi,
        ),
        raw: node,
      },
    ];
  });
}
function findPath(roots: Element[], path: string): Element {
  let candidates = roots;
  const steps = path.slice(1).split("/");
  for (let index = 0; index < steps.length; index++) {
    const match = /^([A-Z.]+)(?:\[(?:(\d+)|@IDENTIFIER='([^']+)')\])?$/u.exec(
      steps[index] ?? "",
    );
    if (!match) throw new Error(`Unsupported Article audit path: ${path}`);
    const matching = candidates.filter((element) => element.tag === match[1]);
    candidates = match[2]
      ? matching.slice(Number(match[2]) - 1, Number(match[2]))
      : match[3]
        ? matching.filter((element) => element.identifier === match[3])
        : matching;
    if (candidates.length !== 1)
      throw new Error(`Non-unique Article audit path: ${path}`);
    if (index < steps.length - 1) candidates = candidates[0]?.children ?? [];
  }
  return candidates[0] as Element;
}
function topLists(element: Element): Element[] {
  return element.children.flatMap((child) =>
    child.tag === "NOTE"
      ? []
      : child.tag === "LIST"
        ? [child]
        : topLists(child),
  );
}
function descendants(element: Element): Element[] {
  return element.children.flatMap((child) =>
    child.tag === "NOTE" ? [] : [child, ...descendants(child)],
  );
}
function ownMarker(element: Element, tag: string): Element | undefined {
  for (const child of element.children) {
    if (["LIST", "NOTE"].includes(child.tag)) continue;
    if (child.tag === tag) return child;
    const match = ownMarker(child, tag);
    if (match) return match;
  }
  return undefined;
}
function sourceContent(
  element: Element,
  items: Element[],
  children: Provision[],
) {
  const references = new Map(
    items.map((item, index) => [
      item.raw,
      `earth-reading:${children[index]?.logicalId}`,
    ]),
  );
  const entries: Array<string | { type: "child"; childId: string }> = [];
  const appendText = (text: string) => {
    const last = entries.at(-1);
    if (typeof last === "string") entries[entries.length - 1] = last + text;
    else entries.push(text);
  };
  const visit = (node: OrderedNode) => {
    const childId = references.get(node);
    if (childId) {
      entries.push({ type: "child", childId });
      return;
    }
    if ("#text" in node) {
      appendText(String(node["#text"] ?? ""));
      return;
    }
    const tag = tagOf(node);
    if (!tag || excluded.has(tag)) return;
    if (spaced.has(tag)) appendText(" ");
    rawChildren(node).forEach(visit);
    if (spaced.has(tag)) appendText(" ");
  };
  visit(element.raw);
  return entries.flatMap<EarthReadingBlock["content"][number]>((entry) =>
    typeof entry === "string"
      ? normalize(entry)
        ? [{ type: "text" as const, text: normalize(entry) }]
        : []
      : [entry],
  );
}
export type AuditedArticle = {
  article: Provision;
  sourcePath: string;
  blocks: EarthReadingBlock[];
};

/** Source audit only: no changes to shared parser text, IDs, or relationship semantics. */
export function auditArticleReadings(
  xml: string,
  provisions: Provision[],
): AuditedArticle[] {
  const roots = tree(
    new XMLParser({
      preserveOrder: true,
      ignoreAttributes: false,
      trimValues: false,
      parseTagValue: false,
      parseAttributeValue: false,
      processEntities: false,
    }).parse(xml) as OrderedNode[],
  );
  const children = new Map<string, Provision[]>();
  for (const provision of provisions) {
    if (!provision.parentLogicalId) continue;
    const group = children.get(provision.parentLogicalId) ?? [];
    group.push(provision);
    children.set(provision.parentLogicalId, group);
  }
  for (const group of children.values())
    group.sort((a, b) => a.displayOrder - b.displayOrder);
  const collectArticles = (element: Element): Element[] =>
    element.children.flatMap((child) =>
      child.tag === "ARTICLE"
        ? [child]
        : child.tag === "DIVISION"
          ? collectArticles(child)
          : [],
    );
  const rawArticles = findPath(roots, "/ACT[1]")
    .children.filter((element) => element.tag === "ENACTING.TERMS")
    .flatMap(collectArticles);
  const articles = provisions.filter(
    (provision) => provision.kind === "article",
  );
  if (
    rawArticles.length !== articles.length ||
    JSON.stringify(
      articles
        .map((article) => findPath(roots, article.sourceLocator.value).path)
        .sort(),
    ) !== JSON.stringify(rawArticles.map((element) => element.path).sort())
  )
    throw new Error("Incomplete source Article coverage");
  return provisions
    .filter((p) => p.kind === "article")
    .map((article) => {
      if (article.parserWarnings.length)
        throw new Error(`Article parser warnings: ${article.logicalId}`);
      const source = findPath(roots, article.sourceLocator.value);
      if (descendants(source).some((element) => element.tag === "TABLE"))
        throw new Error(
          `Earth reading does not support Article tables: ${article.logicalId}`,
        );
      if (
        descendants(source).some((element) =>
          ["FORMULA", "GRAPHIC", "IMAGE"].includes(element.tag),
        )
      )
        throw new Error(
          `Unsupported Article non-text body: ${article.logicalId}`,
        );
      const paragraphs = source.children.filter(
        (element) => element.tag === "PARAG",
      );
      const body = paragraphs.length
        ? paragraphs
        : source.children.filter((element) =>
            ["ALINEA", "P"].includes(element.tag),
          );
      if (
        source.children.some(
          (element) =>
            !body.includes(element) &&
            !["TI.ART", "STI.ART", "NOTE"].includes(element.tag),
        )
      )
        throw new Error(`Unconsumed Article body: ${article.logicalId}`);
      const bodyProvisions = children.get(article.logicalId) ?? [];
      if (!body.length || body.length !== bodyProvisions.length)
        throw new Error(`Incomplete Article body: ${article.logicalId}`);
      const blocks: EarthReadingBlock[] = [];
      const append = (
        provision: Provision,
        element: Element,
        parentId: string | null,
      ): void => {
        const parentKind = parentId
          ? blocks.find((block) => block.id === parentId)?.kind
          : undefined;
        const kind =
          element.tag === "PARAG"
            ? "paragraph"
            : element.tag === "ITEM"
              ? ["paragraph", "subparagraph"].includes(parentKind ?? "")
                ? "point"
                : "subpoint"
              : "subparagraph";
        if (
          provision.kind !== kind ||
          provision.parserWarnings.length ||
          normalize(textOf(element.raw)) !== provision.text
        )
          throw new Error(`Article source body drift: ${provision.logicalId}`);
        const markerElement =
          kind === "subparagraph"
            ? undefined
            : ownMarker(element, kind === "paragraph" ? "NO.PARAG" : "NO.P");
        const marker = markerElement
          ? normalize(rawChildren(markerElement.raw).map(textOf).join(""))
          : element.listType === "DASH"
            ? "dash"
            : "";
        if (marker && marker !== provision.numberRaw)
          throw new Error(`Article marker drift: ${provision.logicalId}`);
        const id = `earth-reading:${provision.logicalId}`;
        const content = provision.orderedContent?.map((entry) =>
          entry.type === "text"
            ? entry
            : {
                type: "child" as const,
                childId: `earth-reading:${entry.childLogicalId}`,
              },
        );
        const items = topLists(element).flatMap((list) =>
          list.children.filter((child) => child.tag === "ITEM"),
        );
        const nested = children.get(provision.logicalId) ?? [];
        if (items.length !== nested.length)
          throw new Error(`Incomplete Article list: ${provision.logicalId}`);
        if (
          JSON.stringify(sourceContent(element, items, nested)) !==
          JSON.stringify(content)
        )
          throw new Error(
            `Article ordered source drift: ${provision.logicalId}`,
          );
        // Re-resolve the generated standard absolute XPath, without descendant-axis hints.
        if (findPath(roots, element.path) !== element)
          throw new Error(`Article source path drift: ${element.path}`);
        blocks.push(
          earthReadingBlockSchema.parse({
            id,
            parentId,
            kind,
            marker,
            displayOrder: provision.displayOrder,
            sourcePath: element.path,
            parserLocator: provision.sourceLocator.value,
            contentHash: provision.contentHash,
            content,
          }),
        );
        items.forEach((item, index) =>
          append(nested[index] as Provision, item, id),
        );
      };
      body.forEach((element, index) =>
        append(bodyProvisions[index] as Provision, element, null),
      );
      validateReadingHashes(blocks);
      return { article, sourcePath: source.path, blocks };
    });
}

export function validateReadingHashes(blocks: EarthReadingBlock[]): void {
  const texts = validateReadingBlocks(blocks);
  for (const block of blocks) {
    const hash = `sha256:${createHash("sha256")
      .update(texts.get(block.id) as string)
      .digest("hex")}`;
    if (hash !== block.contentHash)
      throw new Error(`Reading text hash drift: ${block.id}`);
  }
}
