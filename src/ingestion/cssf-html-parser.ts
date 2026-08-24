import { XMLParser } from "fast-xml-parser";
import { CANONICAL_SCHEMA_VERSION } from "../canonical/schema";
import type { CanonicalDocument, Provision } from "../canonical/schema";
import { sha256, validateCanonicalDocument } from "../canonical/validate";
import type { CssfSourceSnapshot } from "./cssf-snapshot";
import {
  type CssfSourceDefinition,
  cssfDocumentLogicalId,
} from "./cssf-source-registry";

export const CSSF_HTML_PARSER_VERSION = "1.0.0";

type OrderedNode = Record<string, unknown>;

interface ParsedBlock {
  kind: "other" | "point";
  marker?: string;
  text: string;
  locator: string;
  children: ParsedBlock[];
}

interface ParsedSection {
  key: string;
  label: string;
  title?: string;
  locator: string;
  blocks: ParsedBlock[];
}

export interface CssfHtmlParseResult {
  document: CanonicalDocument;
  report: {
    sectionCount: number;
    blockCount: number;
    warningCount: number;
  };
}

function validateQualityBaseline(
  result: CssfHtmlParseResult,
  source: CssfSourceDefinition,
): void {
  const quality = source.quality;
  if (!quality) return;
  if (result.report.sectionCount !== quality.sectionCount) {
    throw new Error(
      `CSSF section count drift: expected ${quality.sectionCount}, received ${result.report.sectionCount}`,
    );
  }
  if (result.report.blockCount !== quality.blockCount) {
    throw new Error(
      `CSSF block count drift: expected ${quality.blockCount}, received ${result.report.blockCount}`,
    );
  }
  if (result.report.warningCount > quality.maximumWarnings) {
    throw new Error(
      `CSSF parser warning limit exceeded: expected at most ${quality.maximumWarnings}, received ${result.report.warningCount}`,
    );
  }
  for (const [logicalId, expectedHash] of Object.entries(quality.textHashes)) {
    const provision = result.document.provisions.find(
      (candidate) => candidate.logicalId === logicalId,
    );
    if (!provision) {
      throw new Error(`CSSF quality anchor is missing: ${logicalId}`);
    }
    if (provision.contentHash !== expectedHash) {
      throw new Error(`CSSF quality anchor text drift: ${logicalId}`);
    }
  }
}

function tagOf(node: OrderedNode): string | undefined {
  return Object.keys(node).find((key) => key !== ":@" && key !== "#text");
}

function childrenOf(node: OrderedNode): OrderedNode[] {
  const tag = tagOf(node);
  const children = tag ? node[tag] : undefined;
  return Array.isArray(children) ? (children as OrderedNode[]) : [];
}

function attributesOf(node: OrderedNode): Record<string, unknown> {
  const attributes = node[":@"];
  return attributes &&
    typeof attributes === "object" &&
    !Array.isArray(attributes)
    ? (attributes as Record<string, unknown>)
    : {};
}

function hasClass(node: OrderedNode, wanted: string): boolean {
  const value = attributesOf(node).class;
  return (
    typeof value === "string" &&
    value.split(/\s+/u).some((candidate) => candidate === wanted)
  );
}

function findFirst(
  nodes: OrderedNode[],
  predicate: (node: OrderedNode) => boolean,
): OrderedNode | undefined {
  for (const node of nodes) {
    if (predicate(node)) return node;
    const nested = findFirst(childrenOf(node), predicate);
    if (nested) return nested;
  }
  return undefined;
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: "\u00a0",
    quot: '"',
    raquo: "»",
  };
  const decoded = value.replace(
    /&(#\d+|#x[a-f0-9]+|[a-z][a-z0-9]+);/giu,
    (entity, token: string) => {
      if (token.startsWith("#x")) {
        return String.fromCodePoint(Number.parseInt(token.slice(2), 16));
      }
      if (token.startsWith("#")) {
        return String.fromCodePoint(Number.parseInt(token.slice(1), 10));
      }
      return named[token.toLowerCase()] ?? entity;
    },
  );
  const unknown = decoded.match(/&[a-z][a-z0-9]+;/iu)?.[0];
  if (unknown)
    throw new Error(`Unsupported HTML entity in CSSF text: ${unknown}`);
  return decoded.replaceAll("\u00a0", " ").replace(/\s+/gu, " ").trim();
}

function textOf(nodes: OrderedNode[], skipLists = false): string {
  const parts: string[] = [];
  for (const node of nodes) {
    if (typeof node["#text"] === "string") {
      parts.push(node["#text"] as string);
      continue;
    }
    const tag = tagOf(node);
    if (skipLists && (tag === "ol" || tag === "ul")) continue;
    if (tag === "br") parts.push(" ");
    parts.push(textOf(childrenOf(node), skipLists));
  }
  return decodeHtmlEntities(parts.join(""));
}

function directElements(nodes: OrderedNode[], tag: string): OrderedNode[] {
  return nodes.filter((node) => tagOf(node) === tag);
}

function imageSources(nodes: OrderedNode[]): string[] {
  const sources: string[] = [];
  for (const node of nodes) {
    if (tagOf(node) === "img") {
      const source = attributesOf(node).src;
      if (typeof source === "string") sources.push(source);
    }
    sources.push(...imageSources(childrenOf(node)));
  }
  return sources;
}

function listBlocks(list: OrderedNode, locator: string): ParsedBlock[] {
  const ordered = tagOf(list) === "ol";
  const startValue = attributesOf(list).start;
  const start =
    ordered &&
    (typeof startValue === "string" || typeof startValue === "number")
      ? Number.parseInt(String(startValue), 10)
      : 1;
  return directElements(childrenOf(list), "li").flatMap((item, index) => {
    const itemText = textOf(childrenOf(item), true);
    if (!itemText) return [];
    const marker = ordered ? `${start + index}.` : "•";
    const itemLocator = `${locator}/li[${index + 1}]`;
    const nested = childrenOf(item)
      .filter((child) => ["ol", "ul"].includes(tagOf(child) ?? ""))
      .flatMap((child, childIndex) =>
        listBlocks(
          child,
          `${itemLocator}/*[self::ol or self::ul][${childIndex + 1}]`,
        ),
      );
    return [
      {
        kind: "point" as const,
        marker,
        text: itemText,
        locator: itemLocator,
        children: nested,
      },
    ];
  });
}

function contentBlocks(
  container: OrderedNode,
  occurrence: number,
): ParsedBlock[] {
  const base = `(//div[contains(concat(' ', normalize-space(@class), ' '), ' text_content ')])[${occurrence}]`;
  const counters = { p: 0, ol: 0, ul: 0 };
  return childrenOf(container).flatMap((node) => {
    const tag = tagOf(node);
    if (tag !== "p" && tag !== "ol" && tag !== "ul") return [];
    counters[tag] += 1;
    const locator = `${base}/${tag}[${counters[tag]}]`;
    if (tag === "ol" || tag === "ul") return listBlocks(node, locator);
    const text = textOf(childrenOf(node));
    return text
      ? [{ kind: "other" as const, text, locator, children: [] }]
      : [];
  });
}

function footnoteBlocks(container: OrderedNode): ParsedBlock[] {
  return directElements(childrenOf(container), "p").flatMap((node, index) => {
    const text = textOf(childrenOf(node));
    return text
      ? [
          {
            kind: "other" as const,
            text,
            locator: `(//div[contains(concat(' ', normalize-space(@class), ' '), ' footnotes ')])[1]/p[${index + 1}]`,
            children: [],
          },
        ]
      : [];
  });
}

function completeBlockText(block: ParsedBlock): string {
  return [block.text, ...block.children.map(completeBlockText)]
    .filter(Boolean)
    .join("\n");
}

function countBlocks(blocks: ParsedBlock[]): number {
  return blocks.reduce(
    (count, block) => count + 1 + countBlocks(block.children),
    0,
  );
}

function canonicalDocumentType(
  source: CssfSourceDefinition,
): CanonicalDocument["documentType"] {
  return source.documentType === "communication"
    ? "other"
    : source.documentType;
}

export function parseCssfHtml(
  html: string,
  snapshot: CssfSourceSnapshot,
  source: CssfSourceDefinition,
): CssfHtmlParseResult {
  if (source.contentMediaType !== "text/html") {
    throw new Error(`CSSF HTML parser cannot parse ${source.contentMediaType}`);
  }
  if (snapshot.localId !== source.localId) {
    throw new Error("CSSF snapshot does not match source registry entry");
  }
  const inputBytes = new TextEncoder().encode(html);
  if (sha256(inputBytes) !== snapshot.content.sha256) {
    throw new Error("CSSF HTML input does not match snapshot content hash");
  }

  const parsed = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: "",
    parseAttributeValue: false,
    parseTagValue: false,
    processEntities: false,
    trimValues: false,
    unpairedTags: [
      "area",
      "base",
      "br",
      "col",
      "embed",
      "hr",
      "img",
      "input",
      "link",
      "meta",
      "source",
      "track",
      "wbr",
    ],
    stopNodes: ["*.script", "*.style"],
  }).parse(html) as OrderedNode[];
  const mainContent = findFirst(
    parsed,
    (node) => tagOf(node) === "div" && hasClass(node, "main-content"),
  );
  if (!mainContent) throw new Error("CSSF HTML has no main-content container");
  const contentSection = findFirst(
    childrenOf(mainContent),
    (node) => tagOf(node) === "div" && hasClass(node, "content-section"),
  );
  if (!contentSection) throw new Error("CSSF HTML has no content-section");
  const titleNode = findFirst(
    childrenOf(contentSection),
    (node) => tagOf(node) === "h1" && hasClass(node, "single-news__title"),
  );
  const officialTitle = titleNode ? textOf(childrenOf(titleNode)) : "";
  if (!officialTitle) throw new Error("CSSF HTML has no official H1 title");
  if (officialTitle !== source.officialTitle) {
    throw new Error(
      `CSSF official title mismatch: expected ${source.officialTitle}, received ${officialTitle}`,
    );
  }

  const sections: ParsedSection[] = [
    {
      key: "introduction",
      label: "Introduction",
      locator:
        "(//div[contains(concat(' ', normalize-space(@class), ' '), ' text_content ')])[1]",
      blocks: [],
    },
  ];
  const warnings: string[] = [];
  let current = sections[0];
  let textContentOccurrence = 0;
  let relatedCollectionCount = 0;

  const visit = (nodes: OrderedNode[]) => {
    for (const node of nodes) {
      const tag = tagOf(node);
      if (tag === "h2") {
        const heading = textOf(childrenOf(node));
        const id = attributesOf(node).id;
        if (!heading || typeof id !== "string") continue;
        const number = /^(\d+)\.\s*/u.exec(heading)?.[1];
        const key = number ? `section-${number}` : `section-${sections.length}`;
        current = {
          key,
          label: number ? `Section ${number}` : `Section ${sections.length}`,
          title: heading,
          locator: `//*[@id='${id}']`,
          blocks: [],
        };
        sections.push(current);
        continue;
      }
      if (tag === "div" && hasClass(node, "text_content")) {
        textContentOccurrence += 1;
        for (const sourceUrl of imageSources(childrenOf(node))) {
          warnings.push(
            `Unsupported substantive image in CSSF HTML: ${sourceUrl}`,
          );
        }
        current.blocks.push(...contentBlocks(node, textContentOccurrence));
        continue;
      }
      if (tag === "div" && hasClass(node, "footnotes")) {
        current.blocks.push(...footnoteBlocks(node));
        continue;
      }
      if (tag === "ul" && hasClass(node, "files-links-table")) {
        relatedCollectionCount += 1;
        continue;
      }
      visit(childrenOf(node));
    }
  };
  visit(childrenOf(contentSection));
  if (relatedCollectionCount > 0) {
    warnings.push(
      `Excluded ${relatedCollectionCount} CSSF related-document collections from official body text`,
    );
  }
  const nonEmptySections = sections.filter(
    (section) => section.blocks.length > 0,
  );
  if (nonEmptySections.length === 0) {
    throw new Error("CSSF HTML parser produced no body sections");
  }

  const documentId = cssfDocumentLogicalId(source.localId);
  const sourceVersion = `cssf-html-${CSSF_HTML_PARSER_VERSION}-${snapshot.content.sha256.slice(7, 19)}`;
  let displayOrder = 0;
  const provisions: Provision[] = [];
  const addBlocks = (blocks: ParsedBlock[], parentId: string, path: string) => {
    blocks.forEach((block, index) => {
      displayOrder += 1;
      const blockPath = `${path}-${index + 1}`;
      const logicalId = `${parentId}:${block.kind === "point" ? "point" : "block"}:${blockPath}`;
      const text = completeBlockText(block);
      const numberNormalized = block.marker
        ?.replace(/[^0-9a-z]+/giu, "")
        .toLowerCase();
      provisions.push({
        logicalId,
        sourceVersionId: `${logicalId}@${sourceVersion}`,
        sourceSnapshotId: snapshot.snapshotId,
        displayOrder,
        sourceLocator: { kind: "xpath", value: block.locator },
        parserWarnings: [],
        kind: block.kind,
        numberRaw: block.marker,
        numberNormalized: numberNormalized || undefined,
        label: block.marker ?? "Paragraph",
        text,
        leadText: block.children.length > 0 ? block.text : undefined,
        contentHash: sha256(text),
        parentLogicalId: parentId,
        structuralPath: [],
      });
      addBlocks(block.children, logicalId, blockPath);
    });
  };
  for (const section of nonEmptySections) {
    displayOrder += 1;
    const logicalId = `${documentId}:provision:${section.key}`;
    const text = section.blocks.map(completeBlockText).join("\n");
    provisions.push({
      logicalId,
      sourceVersionId: `${logicalId}@${sourceVersion}`,
      sourceSnapshotId: snapshot.snapshotId,
      displayOrder,
      sourceLocator: { kind: "xpath", value: section.locator },
      parserWarnings: [],
      kind: "other",
      numberRaw: section.key,
      numberNormalized: section.key,
      label: section.label,
      title: section.title,
      text,
      contentHash: sha256(text),
      structuralPath: [],
    });
    addBlocks(section.blocks, logicalId, section.key);
  }

  const document = validateCanonicalDocument({
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    logicalId: documentId,
    sourceVersionId: `${documentId}@${sourceVersion}`,
    sourceSnapshotId: snapshot.snapshotId,
    displayOrder: 0,
    sourceLocator: { kind: "css-selector", value: ".main-content" },
    parserWarnings: warnings,
    jurisdiction: "LU",
    language: source.language,
    documentType: canonicalDocumentType(source),
    identifiers: { localId: source.localId },
    familyIds: [source.familyId],
    shortName: source.shortName,
    officialTitle,
    publicationDate: source.publicationDate,
    source: {
      id: snapshot.snapshotId,
      provenance: snapshot.provenance,
      sourceSystem: snapshot.sourceSystem,
      retrievedAt: snapshot.retrievedAt,
      canonicalUrl: snapshot.canonicalUrl,
      contentUrl: snapshot.content.url,
      mediaType: snapshot.content.mediaType ?? source.contentMediaType,
      sha256: snapshot.content.sha256,
      bytes: snapshot.content.bytes,
      sourceVersion,
    },
    structuralNodes: [],
    provisions,
  });
  const result = {
    document,
    report: {
      sectionCount: nonEmptySections.length,
      blockCount: nonEmptySections.reduce(
        (count, section) => count + countBlocks(section.blocks),
        0,
      ),
      warningCount: warnings.length,
    },
  };
  validateQualityBaseline(result, source);
  return result;
}
