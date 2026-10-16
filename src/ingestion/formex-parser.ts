import { XMLParser } from "fast-xml-parser";
import {
  type StructuralIdKind,
  documentLogicalId,
  normalizeLegalNumber,
  provisionLogicalId,
  resourceLogicalId,
  sourceVersionId,
  structuralLogicalId,
} from "../canonical/ids";
import {
  CANONICAL_SCHEMA_VERSION,
  type CanonicalDocument,
  type CanonicalResource,
  type Provision,
} from "../canonical/schema";
import { sha256, validateCanonicalDocument } from "../canonical/validate";
export { FORMEX_PARSER_VERSION } from "../canonical/versions";
import type { PreparedFormexResourceDocument } from "./formex-resources";
import type { OfficialSourceSnapshot } from "./snapshot";
import type { SourceDefinition } from "./source-registry";

type OrderedNode = Record<string, unknown>;
type StructuralNode = CanonicalDocument["structuralNodes"][number];
type StructuralPath = Provision["structuralPath"];
type OrderedProvisionContent = NonNullable<Provision["orderedContent"]>;

const BLOCK_TAGS = new Set([
  "ALINEA",
  "ITEM",
  "LIST",
  "NP",
  "P",
  "PARAG",
  "TABLE",
  "TXT",
]);
const TABLE_BLOCK_TAGS = new Set([...BLOCK_TAGS, "CELL", "ROW", "TBL"]);
const TEXT_EXCLUSIONS = new Set(["NOTE", "NO.P", "NO.PARAG"]);

export interface FormexParseReport {
  schemaVersion: typeof CANONICAL_SCHEMA_VERSION;
  articleCount: number;
  recitalCount: number;
  annexCount: number;
  paragraphCount: number;
  pointCount: number;
  structuralNodeCount: number;
  warningCount: number;
}

export interface FormexParseResult {
  document: CanonicalDocument;
  report: FormexParseReport;
}

export interface FormexAnnexDocument {
  fileName: string;
  xml: string;
}

function tagName(node: OrderedNode): string | undefined {
  return Object.keys(node).find(
    (key) => key !== ":@" && key !== "#text" && !key.startsWith("?"),
  );
}

function elementChildren(node: OrderedNode): OrderedNode[] {
  const tag = tagName(node);
  if (!tag) return [];
  const value = node[tag];
  if (!Array.isArray(value)) return [];
  return value.filter((child): child is OrderedNode =>
    Boolean(child && typeof child === "object"),
  );
}

function directElements(node: OrderedNode, tag?: string): OrderedNode[] {
  return elementChildren(node).filter((child) => {
    const childTag = tagName(child);
    return childTag !== undefined && (tag === undefined || childTag === tag);
  });
}

function childElement(node: OrderedNode, tag: string): OrderedNode | undefined {
  return directElements(node, tag)[0];
}

function attributes(node: OrderedNode): Record<string, unknown> {
  const value = node[":@"];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function plainText(
  node: OrderedNode,
  excludedTags: ReadonlySet<string> = new Set(["NOTE"]),
  blockTags: ReadonlySet<string> = BLOCK_TAGS,
): string {
  function collect(current: OrderedNode): string {
    if ("#text" in current) return String(current["#text"] ?? "");
    const tag = tagName(current);
    if (!tag || excludedTags.has(tag)) return "";
    const content = elementChildren(current).map(collect).join("");
    return blockTags.has(tag) ? ` ${content} ` : content;
  }

  return collect(node).replaceAll("\u00a0", " ").replace(/\s+/gu, " ").trim();
}

function firstDescendant(
  node: OrderedNode,
  wantedTag: string,
): OrderedNode | undefined {
  for (const child of directElements(node)) {
    if (tagName(child) === wantedTag) return child;
    if (tagName(child) === "NOTE") continue;
    const match = firstDescendant(child, wantedTag);
    if (match) return match;
  }
  return undefined;
}

function topLevelLists(node: OrderedNode): OrderedNode[] {
  const lists: OrderedNode[] = [];
  for (const child of directElements(node)) {
    const tag = tagName(child);
    if (tag === "NOTE") continue;
    if (tag === "LIST") lists.push(child);
    else lists.push(...topLevelLists(child));
  }
  return lists;
}

function normalizeText(value: string): string {
  return value.replaceAll("\u00a0", " ").replace(/\s+/gu, " ").trim();
}

function formulaFileName(node: OrderedNode): string | undefined {
  if (tagName(node) !== "INCL.ELEMENT") return undefined;
  const values = attributes(node);
  if (String(values.CONTENT ?? "").toUpperCase() !== "FORMULA") {
    return undefined;
  }
  const fileName = String(values.FILEREF ?? "").trim();
  return fileName || undefined;
}

function containsFormula(node: OrderedNode): boolean {
  if (formulaFileName(node)) return true;
  return elementChildren(node).some(containsFormula);
}

function orderedContentFromElement(
  element: OrderedNode,
  childLogicalIds: string[],
  resolveResourceId: (node: OrderedNode) => string | undefined,
  blockTags: ReadonlySet<string> = BLOCK_TAGS,
): OrderedProvisionContent {
  const raw: Array<
    | string
    | { type: "child"; childLogicalId: string }
    | { type: "resource"; resourceId: string }
  > = [];
  let childIndex = 0;

  const appendText = (value: string): void => {
    const previous = raw.at(-1);
    if (typeof previous === "string") raw[raw.length - 1] = previous + value;
    else raw.push(value);
  };
  const visit = (node: OrderedNode): void => {
    if ("#text" in node) {
      appendText(String(node["#text"] ?? ""));
      return;
    }
    const tag = tagName(node);
    if (!tag || TEXT_EXCLUSIONS.has(tag)) return;
    const resourceId = resolveResourceId(node);
    if (resourceId) {
      raw.push({ type: "resource", resourceId });
      return;
    }
    if (tag === "LIST") {
      for (const _item of directElements(node, "ITEM")) {
        const childLogicalId = childLogicalIds[childIndex];
        if (!childLogicalId) {
          throw new Error("Ordered Formex list has more items than child IDs");
        }
        raw.push({ type: "child", childLogicalId });
        childIndex += 1;
      }
      return;
    }
    if (blockTags.has(tag)) appendText(" ");
    for (const child of elementChildren(node)) visit(child);
    if (blockTags.has(tag)) appendText(" ");
  };
  visit(element);
  if (childIndex !== childLogicalIds.length) {
    throw new Error(
      `Ordered Formex content consumed ${childIndex}/${childLogicalIds.length} child IDs`,
    );
  }

  const content: OrderedProvisionContent = [];
  for (const item of raw) {
    if (typeof item !== "string") {
      content.push(
        item.type === "child"
          ? { type: "child", childLogicalId: item.childLogicalId }
          : { type: "resource", resourceId: item.resourceId },
      );
      continue;
    }
    const text = normalizeText(item);
    if (text) content.push({ type: "text", text });
  }
  return content;
}

function sourceVersion(snapshot: OfficialSourceSnapshot): string {
  const etag = snapshot.content.etag
    ?.replaceAll('"', "")
    .replace(/[^a-zA-Z0-9._-]/gu, "-");
  return etag || `sha256-${snapshot.content.sha256.slice(7)}`;
}

function divisionIdentity(
  label: string,
  fallbackIndex: number,
): { kind: StructuralIdKind; number: string } {
  const match =
    /^(chapter|section|part|title|subsection|division)\s+(.+)$/iu.exec(label);
  return match
    ? { kind: match[1].toLowerCase() as StructuralIdKind, number: match[2] }
    : { kind: "division", number: String(fallbackIndex) };
}

class FormexDocumentBuilder {
  readonly documentId: string;
  readonly version: string;
  readonly structuralNodes: StructuralNode[] = [];
  readonly provisions: Provision[] = [];
  readonly warnings: string[] = [];
  readonly resources: CanonicalResource[];
  private readonly resourceIdsByFileName: Map<string, string>;
  private displayOrder = 0;
  private readonly occurrenceCounts = new Map<string, number>();
  private readonly structuralOverrideGroups = new Map<
    string,
    NonNullable<SourceDefinition["structuralIdentityOverrides"]>
  >();
  private readonly consumedStructuralOverrides = new Set<object>();

  constructor(
    private readonly source: SourceDefinition,
    private readonly snapshot: OfficialSourceSnapshot,
    resources: PreparedFormexResourceDocument[],
  ) {
    this.documentId = documentLogicalId(source.celex);
    this.version = sourceVersion(snapshot);
    for (const override of source.structuralIdentityOverrides ?? []) {
      if (override.sourceContentSha256 !== snapshot.content.sha256) {
        throw new Error(
          "Structural identity override source checksum mismatch",
        );
      }
      const key = this.structuralGroupKey(
        override.parentLogicalId,
        override.kind,
        override.number,
      );
      const group = this.structuralOverrideGroups.get(key) ?? [];
      group.push(override);
      this.structuralOverrideGroups.set(key, group);
    }
    for (const group of this.structuralOverrideGroups.values()) {
      if (
        new Set(group.map((rule) => rule.title)).size !== group.length ||
        group
          .map((rule) => rule.occurrence)
          .sort((a, b) => a - b)
          .some((value, index) => value !== index + 1)
      ) {
        throw new Error(
          "Structural identity overrides require unique titles and contiguous occurrences",
        );
      }
    }
    this.resources = resources.map((resource) => ({
      id: resourceLogicalId(this.documentId, resource.fileName),
      kind: "formula",
      sourceFileName: resource.fileName,
      sourceMediaType: resource.sourceMediaType,
      sourceSha256: sha256(resource.sourceBytes),
      mediaType: resource.mediaType,
      renditionSha256: sha256(resource.renditionBytes),
      dataBase64: Buffer.from(resource.renditionBytes).toString("base64"),
    }));
    this.resourceIdsByFileName = new Map(
      this.resources.map((resource) => [resource.sourceFileName, resource.id]),
    );
    if (this.resourceIdsByFileName.size !== this.resources.length) {
      throw new Error("Formex package contains duplicate resource filenames");
    }
  }

  resolveResourceId(node: OrderedNode): string | undefined {
    const fileName = formulaFileName(node);
    if (!fileName) return undefined;
    const resourceId = this.resourceIdsByFileName.get(fileName);
    if (!resourceId) {
      throw new Error(`Missing Formex formula resource: ${fileName}`);
    }
    return resourceId;
  }

  nextOrder(): number {
    this.displayOrder += 1;
    return this.displayOrder;
  }

  occurrence(parentId: string, kind: string, number: string): number {
    const key = `${parentId}:${kind}:${normalizeLegalNumber(number)}`;
    const occurrence = (this.occurrenceCounts.get(key) ?? 0) + 1;
    this.occurrenceCounts.set(key, occurrence);
    return occurrence;
  }

  private structuralGroupKey(
    parentId: string,
    kind: string,
    number: string,
  ): string {
    return `${parentId}:${kind}:${normalizeLegalNumber(number)}`;
  }

  private structuralOccurrence(
    parentId: string,
    kind: StructuralIdKind,
    number: string,
    title: string | undefined,
  ): number {
    const group = this.structuralOverrideGroups.get(
      this.structuralGroupKey(parentId, kind, number),
    );
    if (!group) return this.occurrence(parentId, kind, number);
    const rule = group.find((candidate) => candidate.title === title);
    if (!rule)
      throw new Error("Unreviewed structural identity in an overridden group");
    if (this.consumedStructuralOverrides.has(rule)) {
      throw new Error(
        "Structural identity override matched multiple divisions",
      );
    }
    this.consumedStructuralOverrides.add(rule);
    return rule.occurrence;
  }

  versionedId(logicalId: string): string {
    return sourceVersionId(logicalId, this.version);
  }

  addPointLists(
    container: OrderedNode,
    parentId: string,
    structuralPath: StructuralPath,
    xpath: string,
    depth = 0,
  ): void {
    const containerIsList = tagName(container) === "LIST";
    const lists = containerIsList ? [container] : topLevelLists(container);
    lists.forEach((list, listIndex) => {
      const listXpath = containerIsList
        ? xpath
        : `${xpath}//LIST[${listIndex + 1}]`;
      directElements(list, "ITEM").forEach((item, itemIndex) => {
        const listType = String(attributes(list).TYPE ?? "").toUpperCase();
        const numberNode = firstDescendant(item, "NO.P");
        const numberRaw = numberNode
          ? plainText(numberNode, new Set())
          : listType === "DASH"
            ? "dash"
            : `item-${itemIndex + 1}`;
        let identityNumber = numberRaw;
        try {
          normalizeLegalNumber(identityNumber);
        } catch {
          identityNumber = `item-${itemIndex + 1}`;
        }
        const kind = depth === 0 ? "point" : "subpoint";
        const occurrence = this.occurrence(parentId, kind, identityNumber);
        const logicalId = provisionLogicalId(
          parentId,
          kind,
          identityNumber,
          occurrence,
        );
        const directText = plainText(
          item,
          new Set([...TEXT_EXCLUSIONS, "LIST"]),
        );
        const warning =
          numberNode || listType === "DASH"
            ? []
            : ["List item has no explicit number."];

        const hasFormula = containsFormula(item);
        if (!directText && !hasFormula) {
          this.warnings.push(`Skipped empty list item at ${xpath}`);
          return;
        }

        const provisionIndex = this.provisions.length;
        const displayOrder = this.nextOrder();
        this.provisions.push({
          logicalId,
          sourceVersionId: this.versionedId(logicalId),
          sourceSnapshotId: this.snapshot.snapshotId,
          displayOrder,
          sourceLocator: {
            kind: "xpath",
            value: `${listXpath}/ITEM[${itemIndex + 1}]`,
          },
          parserWarnings: warning,
          kind,
          numberRaw,
          numberNormalized: normalizeLegalNumber(identityNumber),
          label: numberRaw === "dash" ? "—" : numberRaw,
          text: directText,
          contentHash: sha256(directText),
          parentLogicalId: parentId,
          structuralPath,
        });
        this.addPointLists(
          item,
          logicalId,
          structuralPath,
          `${listXpath}/ITEM[${itemIndex + 1}]`,
          depth + 1,
        );
        const directChildIds = this.provisions
          .filter((provision) => provision.parentLogicalId === logicalId)
          .sort((left, right) => left.displayOrder - right.displayOrder)
          .map((provision) => provision.logicalId);
        const orderedContent = orderedContentFromElement(
          item,
          directChildIds,
          (node) => this.resolveResourceId(node),
        );
        const childrenById = new Map(
          this.provisions.map((provision) => [provision.logicalId, provision]),
        );
        const text = normalizeText(
          orderedContent
            .map((entry) =>
              entry.type === "text"
                ? entry.text
                : entry.type === "child"
                  ? childrenById.get(entry.childLogicalId)?.text
                  : undefined,
            )
            .filter(Boolean)
            .join(" "),
        );
        const expectedText = plainText(item, TEXT_EXCLUSIONS);
        const comparableText = (value: string) =>
          hasFormula ? value.replace(/\s+/gu, "") : value;
        if (comparableText(text) !== comparableText(expectedText)) {
          throw new Error(
            `Ordered content drift at ${listXpath}/ITEM[${itemIndex + 1}]`,
          );
        }
        this.provisions[provisionIndex] = {
          ...this.provisions[provisionIndex],
          text,
          leadText: directText !== text ? directText : undefined,
          orderedContent,
          contentHash: sha256(text),
        };
      });
    });
  }

  addTextProvision(
    element: OrderedNode,
    articleId: string,
    kind: "paragraph" | "subparagraph",
    numberRaw: string,
    structuralPath: StructuralPath,
    xpath: string,
  ): void {
    const occurrence = this.occurrence(articleId, kind, numberRaw);
    const logicalId = provisionLogicalId(
      articleId,
      kind,
      numberRaw,
      occurrence,
    );
    const text = plainText(element, TEXT_EXCLUSIONS);
    const leadText = plainText(element, new Set([...TEXT_EXCLUSIONS, "LIST"]));
    const hasFormula = containsFormula(element);
    const warnings =
      text || hasFormula ? [] : ["Provision contains no normalized text."];
    if (!text && !hasFormula) this.warnings.push(`Empty provision at ${xpath}`);

    const provisionIndex = this.provisions.length;
    this.provisions.push({
      logicalId,
      sourceVersionId: this.versionedId(logicalId),
      sourceSnapshotId: this.snapshot.snapshotId,
      displayOrder: this.nextOrder(),
      sourceLocator: { kind: "xpath", value: xpath },
      parserWarnings: warnings,
      kind,
      numberRaw,
      numberNormalized: normalizeLegalNumber(numberRaw),
      label: kind === "paragraph" ? `Paragraph ${numberRaw}` : "Subparagraph",
      text,
      leadText: leadText && leadText !== text ? leadText : undefined,
      contentHash: sha256(text),
      parentLogicalId: articleId,
      structuralPath,
    });
    this.addPointLists(element, logicalId, structuralPath, xpath);
    const directChildIds = this.provisions
      .filter((provision) => provision.parentLogicalId === logicalId)
      .sort((left, right) => left.displayOrder - right.displayOrder)
      .map((provision) => provision.logicalId);
    const orderedContent = orderedContentFromElement(
      element,
      directChildIds,
      (node) => this.resolveResourceId(node),
    );
    const childrenById = new Map(
      this.provisions.map((provision) => [provision.logicalId, provision]),
    );
    const orderedText = normalizeText(
      orderedContent
        .map((entry) =>
          entry.type === "text"
            ? entry.text
            : entry.type === "child"
              ? childrenById.get(entry.childLogicalId)?.text
              : undefined,
        )
        .filter(Boolean)
        .join(" "),
    );
    const comparable = (value: string) =>
      hasFormula
        ? value.replace(/\s+/gu, "")
        : value.replace(/\s+([,.;:!?])/gu, "$1");
    if (comparable(orderedText) !== comparable(text)) {
      throw new Error(
        `Ordered content drift at ${xpath}: expected ${JSON.stringify(text.slice(0, 500))}, received ${JSON.stringify(orderedText.slice(0, 500))}`,
      );
    }
    this.provisions[provisionIndex] = {
      ...this.provisions[provisionIndex],
      orderedContent,
    };
  }

  addArticle(
    article: OrderedNode,
    parentId: string,
    structuralPath: StructuralPath,
    xpath: string,
  ): void {
    const identifier = String(attributes(article).IDENTIFIER ?? "");
    const label = plainText(childElement(article, "TI.ART") ?? article);
    const labelNumber = /^article\s+(.+)$/iu.exec(label)?.[1];
    const numberRaw =
      labelNumber || identifier || String(this.provisions.length + 1);
    const occurrence = this.occurrence(this.documentId, "article", numberRaw);
    const logicalId = provisionLogicalId(
      this.documentId,
      "article",
      numberRaw,
      occurrence,
    );
    const title = childElement(article, "STI.ART");
    const articleXpath = identifier
      ? `${xpath}/ARTICLE[@IDENTIFIER='${identifier}']`
      : `${xpath}/ARTICLE`;
    const articleWarnings = identifier
      ? []
      : ["Article has no Formex identifier."];

    this.provisions.push({
      logicalId,
      sourceVersionId: this.versionedId(logicalId),
      sourceSnapshotId: this.snapshot.snapshotId,
      displayOrder: this.nextOrder(),
      sourceLocator: { kind: "xpath", value: articleXpath },
      parserWarnings: articleWarnings,
      kind: "article",
      numberRaw,
      numberNormalized: normalizeLegalNumber(numberRaw),
      label: label || `Article ${numberRaw}`,
      title: title ? plainText(title) : undefined,
      text: "",
      contentHash: sha256(""),
      parentLogicalId: parentId,
      structuralPath,
    });

    const paragraphs = directElements(article, "PARAG");
    if (paragraphs.length > 0) {
      paragraphs.forEach((paragraph, index) => {
        const paragraphIdentifier = String(
          attributes(paragraph).IDENTIFIER ?? "",
        );
        const numberNode = childElement(paragraph, "NO.PARAG");
        const displayedNumber = numberNode
          ? plainText(numberNode, new Set())
          : paragraphIdentifier.split(".").at(-1) || String(index + 1);
        let numberRaw = displayedNumber;
        try {
          normalizeLegalNumber(numberRaw);
        } catch {
          const identifierNumber = paragraphIdentifier.split(".").at(-1);
          if (!identifierNumber) throw new Error("Invalid paragraph number");
          normalizeLegalNumber(identifierNumber);
          numberRaw = identifierNumber;
          this.warnings.push(
            `Invalid displayed paragraph number ${displayedNumber}; used Formex identifier ${identifierNumber} at ${articleXpath}.`,
          );
        }
        const paragraphXpath = paragraphIdentifier
          ? `${articleXpath}/PARAG[@IDENTIFIER='${paragraphIdentifier}']`
          : `${articleXpath}/PARAG[${index + 1}]`;
        this.addTextProvision(
          paragraph,
          logicalId,
          "paragraph",
          numberRaw,
          structuralPath,
          paragraphXpath,
        );
      });
      return;
    }

    const alineas = directElements(article).filter((element) =>
      ["ALINEA", "P"].includes(tagName(element) ?? ""),
    );
    alineas.forEach((alinea, index) =>
      this.addTextProvision(
        alinea,
        logicalId,
        "subparagraph",
        String(index + 1),
        structuralPath,
        `${articleXpath}/${tagName(alinea)}[${index + 1}]`,
      ),
    );
    if (alineas.length === 0) {
      this.warnings.push(`Article ${numberRaw} has no direct text container.`);
    }
  }

  addDivision(
    division: OrderedNode,
    parentId: string,
    parentPath: StructuralPath,
    xpath: string,
    divisionIndex: number,
  ): void {
    const titleElement = childElement(division, "TITLE");
    const label = titleElement
      ? plainText(childElement(titleElement, "TI") ?? titleElement)
      : `Division ${divisionIndex}`;
    const titleNode = titleElement
      ? childElement(titleElement, "STI")
      : undefined;
    const identity = divisionIdentity(label, divisionIndex);
    const title = titleNode ? plainText(titleNode) : undefined;
    const occurrence = this.structuralOccurrence(
      parentId,
      identity.kind,
      identity.number,
      title,
    );
    const logicalId = structuralLogicalId(
      parentId,
      identity.kind,
      identity.number,
      occurrence,
    );
    const path = [...parentPath, { logicalId, kind: identity.kind, label }];

    this.structuralNodes.push({
      logicalId,
      sourceVersionId: this.versionedId(logicalId),
      sourceSnapshotId: this.snapshot.snapshotId,
      displayOrder: this.nextOrder(),
      sourceLocator: { kind: "xpath", value: xpath },
      parserWarnings: titleElement ? [] : ["Division has no TITLE element."],
      kind: identity.kind,
      numberRaw: identity.number,
      numberNormalized: normalizeLegalNumber(identity.number),
      label,
      title,
      parentLogicalId: parentId,
    });

    let nestedDivisionIndex = 0;
    for (const child of directElements(division)) {
      if (tagName(child) === "ARTICLE") {
        this.addArticle(child, logicalId, path, xpath);
      } else if (tagName(child) === "DIVISION") {
        nestedDivisionIndex += 1;
        this.addDivision(
          child,
          logicalId,
          path,
          `${xpath}/DIVISION[${nestedDivisionIndex}]`,
          nestedDivisionIndex,
        );
      }
    }
  }

  addRecitals(act: OrderedNode): void {
    const preamble = childElement(act, "PREAMBLE");
    const group = preamble ? childElement(preamble, "GR.CONSID") : undefined;
    const recitals = group ? directElements(group, "CONSID") : [];

    recitals.forEach((recital, index) => {
      const numberNode = firstDescendant(recital, "NO.P");
      const numberRaw = numberNode
        ? plainText(numberNode, new Set())
        : String(index + 1);
      const occurrence = this.occurrence(this.documentId, "recital", numberRaw);
      const logicalId = provisionLogicalId(
        this.documentId,
        "recital",
        numberRaw,
        occurrence,
      );
      const text = plainText(recital, TEXT_EXCLUSIONS);

      this.provisions.push({
        logicalId,
        sourceVersionId: this.versionedId(logicalId),
        sourceSnapshotId: this.snapshot.snapshotId,
        displayOrder: this.nextOrder(),
        sourceLocator: {
          kind: "xpath",
          value: `/ACT/PREAMBLE/GR.CONSID/CONSID[${index + 1}]`,
        },
        parserWarnings: text ? [] : ["Recital contains no normalized text."],
        kind: "recital",
        numberRaw,
        numberNormalized: normalizeLegalNumber(numberRaw),
        label: `Recital ${normalizeLegalNumber(numberRaw)}`,
        text,
        contentHash: sha256(text),
        parentLogicalId: this.documentId,
        structuralPath: [],
      });
      if (!text) this.warnings.push(`Recital ${numberRaw} is empty.`);
    });
  }

  addAnnexText(
    element: OrderedNode,
    parentId: string,
    xpath: string,
    fallbackIndex: number,
  ): void {
    const numberNode = firstDescendant(element, "NO.P");
    const numberRaw = numberNode
      ? plainText(numberNode, new Set())
      : String(fallbackIndex);
    this.addTextProvision(
      element,
      parentId,
      numberNode ? "paragraph" : "subparagraph",
      numberRaw,
      [],
      xpath,
    );
  }

  addAnnexPart(
    group: OrderedNode,
    annexId: string,
    xpath: string,
    groupIndex: number,
  ): void {
    const titleElement = childElement(group, "TITLE");
    const label = titleElement
      ? plainText(childElement(titleElement, "TI") ?? titleElement)
      : `Part ${groupIndex}`;
    const explicitNumber = titleElement
      ? firstDescendant(titleElement, "NO.P")
      : undefined;
    const labelledNumber = /^(?:section|part)\s+([a-z0-9.-]+)/iu.exec(
      label,
    )?.[1];
    const numberRaw = explicitNumber
      ? plainText(explicitNumber, new Set())
      : (labelledNumber ?? String(groupIndex));
    let identityNumber = numberRaw;
    try {
      normalizeLegalNumber(identityNumber);
    } catch {
      const trailingNumber = /([a-z0-9]+)[.)]?\s*$/iu.exec(numberRaw)?.[1];
      if (!trailingNumber)
        throw new Error(`Invalid legal number: ${numberRaw}`);
      identityNumber = trailingNumber;
    }
    const occurrence = this.occurrence(annexId, "annex-part", identityNumber);
    const logicalId = provisionLogicalId(
      annexId,
      "annex-part",
      identityNumber,
      occurrence,
    );
    const text = plainText(group, TEXT_EXCLUSIONS);
    const hasChildContent = directElements(group).some((child) =>
      ["ALINEA", "GR.SEQ", "NP", "P", "PARAG"].includes(tagName(child) ?? ""),
    );

    this.provisions.push({
      logicalId,
      sourceVersionId: this.versionedId(logicalId),
      sourceSnapshotId: this.snapshot.snapshotId,
      displayOrder: this.nextOrder(),
      sourceLocator: { kind: "xpath", value: xpath },
      parserWarnings: titleElement ? [] : ["Annex part has no TITLE element."],
      kind: "annex-part",
      numberRaw,
      numberNormalized: normalizeLegalNumber(identityNumber),
      label: label || `Part ${groupIndex}`,
      text,
      leadText: hasChildContent ? "" : undefined,
      contentHash: sha256(text),
      parentLogicalId: annexId,
      structuralPath: [],
    });

    let contentIndex = 0;
    let nestedGroupIndex = 0;
    let listIndex = 0;
    for (const child of directElements(group)) {
      const tag = tagName(child);
      if (tag === "GR.SEQ") {
        nestedGroupIndex += 1;
        this.addAnnexPart(
          child,
          logicalId,
          `${xpath}/GR.SEQ[${nestedGroupIndex}]`,
          nestedGroupIndex,
        );
      } else if (["ALINEA", "NP", "P", "PARAG"].includes(tag ?? "")) {
        contentIndex += 1;
        this.addAnnexText(
          child,
          logicalId,
          `${xpath}/${tag}[${contentIndex}]`,
          contentIndex,
        );
      } else if (tag === "LIST") {
        listIndex += 1;
        this.addPointLists(child, logicalId, [], `${xpath}/LIST[${listIndex}]`);
      }
    }
  }

  addTable(
    table: OrderedNode,
    annexId: string,
    xpath: string,
    tableIndex: number,
  ): void {
    const sourceNumber = String(attributes(table)["NO.SEQ"] ?? tableIndex);
    const identityNumber = String(tableIndex);
    const occurrence = this.occurrence(annexId, "table", identityNumber);
    const logicalId = provisionLogicalId(
      annexId,
      "table",
      identityNumber,
      occurrence,
    );
    const text = plainText(table, TEXT_EXCLUSIONS, TABLE_BLOCK_TAGS);
    const leadText = plainText(
      table,
      new Set([...TEXT_EXCLUSIONS, "LIST"]),
      TABLE_BLOCK_TAGS,
    );
    const provisionIndex = this.provisions.length;
    this.provisions.push({
      logicalId,
      sourceVersionId: this.versionedId(logicalId),
      sourceSnapshotId: this.snapshot.snapshotId,
      displayOrder: this.nextOrder(),
      sourceLocator: { kind: "xpath", value: xpath },
      parserWarnings: text ? [] : ["Table contains no normalized text."],
      kind: "table",
      numberRaw: sourceNumber,
      numberNormalized: identityNumber,
      label: `Table ${identityNumber}`,
      text,
      leadText: leadText && leadText !== text ? leadText : undefined,
      contentHash: sha256(text),
      parentLogicalId: annexId,
      structuralPath: [],
    });
    this.addPointLists(table, logicalId, [], xpath);
    const directChildIds = this.provisions
      .filter((provision) => provision.parentLogicalId === logicalId)
      .sort((left, right) => left.displayOrder - right.displayOrder)
      .map((provision) => provision.logicalId);
    const orderedContent = orderedContentFromElement(
      table,
      directChildIds,
      (node) => this.resolveResourceId(node),
      TABLE_BLOCK_TAGS,
    );
    const childrenById = new Map(
      this.provisions.map((provision) => [provision.logicalId, provision]),
    );
    const orderedText = normalizeText(
      orderedContent
        .map((entry) =>
          entry.type === "text"
            ? entry.text
            : entry.type === "child"
              ? childrenById.get(entry.childLogicalId)?.text
              : undefined,
        )
        .filter(Boolean)
        .join(" "),
    );
    if (orderedText !== text) {
      throw new Error(`Ordered table content drift at ${xpath}`);
    }
    this.provisions[provisionIndex] = {
      ...this.provisions[provisionIndex],
      orderedContent,
    };
  }

  addAnnex(
    annex: OrderedNode,
    fileName: string,
    annexIndex: number,
    sourceLocator = `${fileName}#/ANNEX`,
  ): void {
    const titleElement = childElement(annex, "TITLE");
    const titleText = titleElement
      ? plainText(childElement(titleElement, "TI") ?? titleElement)
      : `ANNEX ${annexIndex}`;
    const labelMatch =
      /^annex\s+([ivxlcdm]+|\d+[a-z]?)(?:\s+([\s\S]+))?$/iu.exec(titleText);
    const numberRaw = labelMatch?.[1] ?? String(annexIndex);
    const label = labelMatch ? `ANNEX ${numberRaw}` : titleText;
    const occurrence = this.occurrence(this.documentId, "annex", numberRaw);
    const logicalId = provisionLogicalId(
      this.documentId,
      "annex",
      numberRaw,
      occurrence,
    );
    const contents = childElement(annex, "CONTENTS");
    const text = plainText(contents ?? annex, TEXT_EXCLUSIONS);
    const titleNode = titleElement
      ? childElement(titleElement, "STI")
      : undefined;
    const title = titleNode
      ? plainText(titleNode)
      : labelMatch?.[2]?.trim() || undefined;
    const annexXpath = sourceLocator;

    this.provisions.push({
      logicalId,
      sourceVersionId: this.versionedId(logicalId),
      sourceSnapshotId: this.snapshot.snapshotId,
      displayOrder: this.nextOrder(),
      sourceLocator: { kind: "xpath", value: annexXpath },
      parserWarnings: titleElement ? [] : ["Annex has no TITLE element."],
      kind: "annex",
      numberRaw,
      numberNormalized: normalizeLegalNumber(numberRaw),
      label,
      title,
      text,
      contentHash: sha256(text),
      parentLogicalId: this.documentId,
      structuralPath: [],
    });

    if (!contents) {
      this.warnings.push(`Annex ${numberRaw} has no CONTENTS element.`);
      return;
    }
    let contentIndex = 0;
    let groupIndex = 0;
    let listIndex = 0;
    let tableIndex = 0;
    for (const child of directElements(contents)) {
      const tag = tagName(child);
      if (tag === "GR.SEQ") {
        groupIndex += 1;
        this.addAnnexPart(
          child,
          logicalId,
          `${annexXpath}/CONTENTS/GR.SEQ[${groupIndex}]`,
          groupIndex,
        );
      } else if (["ALINEA", "NP", "P", "PARAG"].includes(tag ?? "")) {
        contentIndex += 1;
        this.addAnnexText(
          child,
          logicalId,
          `${annexXpath}/CONTENTS/${tag}[${contentIndex}]`,
          contentIndex,
        );
      } else if (tag === "LIST") {
        listIndex += 1;
        this.addPointLists(
          child,
          logicalId,
          [],
          `${annexXpath}/CONTENTS/LIST[${listIndex}]`,
        );
      } else if (tag === "TBL") {
        tableIndex += 1;
        this.addTable(
          child,
          logicalId,
          `${annexXpath}/CONTENTS/TBL[${tableIndex}]`,
          tableIndex,
        );
      }
    }
  }

  build(
    act: OrderedNode,
    annexes: Array<{ fileName: string; node: OrderedNode }>,
    rootTag: "ACT" | "CONS.ACT" = "ACT",
  ): FormexParseResult {
    const legalBody =
      rootTag === "CONS.ACT" ? (childElement(act, "CONS.DOC") ?? act) : act;
    const legalBodyPath =
      rootTag === "CONS.ACT" ? "/CONS.ACT/CONS.DOC" : "/ACT";
    this.addRecitals(legalBody);
    const enactingTerms = childElement(legalBody, "ENACTING.TERMS");
    if (!enactingTerms) throw new Error("Formex ACT has no ENACTING.TERMS");
    const divisions = directElements(enactingTerms, "DIVISION");
    divisions.forEach((division, index) =>
      this.addDivision(
        division,
        this.documentId,
        [],
        `${legalBodyPath}/ENACTING.TERMS/DIVISION[${index + 1}]`,
        index + 1,
      ),
    );
    for (const article of directElements(enactingTerms, "ARTICLE")) {
      this.addArticle(
        article,
        this.documentId,
        [],
        `${legalBodyPath}/ENACTING.TERMS`,
      );
    }
    annexes.forEach(({ fileName, node }, index) =>
      this.addAnnex(node, fileName, index + 1),
    );
    directElements(legalBody, "CONS.ANNEX").forEach((node, index) =>
      this.addAnnex(
        node,
        "inline",
        annexes.length + index + 1,
        `${legalBodyPath}/CONS.ANNEX[${index + 1}]`,
      ),
    );

    if (
      this.consumedStructuralOverrides.size !==
      (this.source.structuralIdentityOverrides?.length ?? 0)
    ) {
      throw new Error("Unused structural identity override");
    }
    const title =
      childElement(act, "TITLE") ??
      (rootTag === "CONS.ACT"
        ? firstDescendant(legalBody, "TITLE")
        : undefined);
    const officialTitle = title
      ? plainText(childElement(title, "TI") ?? title)
      : this.source.shortName;
    const sourceSnapshot = this.snapshot;
    const document = validateCanonicalDocument({
      schemaVersion: CANONICAL_SCHEMA_VERSION,
      logicalId: this.documentId,
      sourceVersionId: this.versionedId(this.documentId),
      sourceSnapshotId: sourceSnapshot.snapshotId,
      displayOrder: 0,
      sourceLocator: { kind: "xpath", value: `/${rootTag}` },
      parserWarnings: this.warnings,
      jurisdiction: "EU",
      language: "en",
      documentType: this.source.documentType,
      identifiers: { celex: this.source.celex, eli: this.source.eliUrl },
      familyIds: [this.source.familyId],
      shortName: this.source.shortName,
      officialTitle,
      publicationDate: this.source.publicationDate,
      source: {
        id: sourceSnapshot.snapshotId,
        provenance: "official",
        sourceSystem: "cellar",
        retrievedAt: sourceSnapshot.retrievedAt,
        canonicalUrl: sourceSnapshot.canonicalUrl,
        contentUrl: sourceSnapshot.content.url,
        mediaType: sourceSnapshot.content.mediaType ?? "application/zip",
        sha256: sourceSnapshot.content.sha256,
        bytes: sourceSnapshot.content.bytes,
        sourceVersion: this.version,
        sourceStatus: this.source.sourceStatus,
        workUri: sourceSnapshot.workUri,
        expressionUri: sourceSnapshot.expressionUri,
        manifestationUri: sourceSnapshot.manifestationUri,
      },
      resources: this.resources,
      structuralNodes: this.structuralNodes,
      provisions: this.provisions,
    });
    const report = qualityReport(document);

    if (this.source.quality) {
      if (report.articleCount !== this.source.quality.articleCount) {
        throw new Error(
          `Article quality gate failed: expected ${this.source.quality.articleCount}, received ${report.articleCount}`,
        );
      }
      if (report.recitalCount !== this.source.quality.recitalCount) {
        throw new Error(
          `Recital quality gate failed: expected ${this.source.quality.recitalCount}, received ${report.recitalCount}`,
        );
      }
      if (report.annexCount !== this.source.quality.annexCount) {
        throw new Error(
          `Annex quality gate failed: expected ${this.source.quality.annexCount}, received ${report.annexCount}`,
        );
      }
      for (const [field, actual] of [
        ["paragraphCount", report.paragraphCount],
        ["pointCount", report.pointCount],
        ["structuralNodeCount", report.structuralNodeCount],
      ] as const) {
        const expected = this.source.quality[field];
        if (actual !== expected) {
          throw new Error(
            `${field} quality gate failed: expected ${expected}, received ${actual}`,
          );
        }
      }
      if (report.warningCount > this.source.quality.maximumWarnings) {
        throw new Error(
          `Parser warning quality gate failed: allowed ${this.source.quality.maximumWarnings}, received ${report.warningCount}`,
        );
      }
      const contentHashes = new Map(
        document.provisions.map((provision) => [
          provision.logicalId,
          provision.contentHash,
        ]),
      );
      for (const [logicalId, expectedHash] of Object.entries(
        this.source.quality.textHashes,
      )) {
        const actualHash = contentHashes.get(logicalId);
        if (actualHash !== expectedHash) {
          throw new Error(
            `Text fidelity gate failed for ${logicalId}: expected ${expectedHash}, received ${actualHash ?? "missing"}`,
          );
        }
      }
    }

    return { document, report };
  }
}

export function qualityReport(document: CanonicalDocument): FormexParseReport {
  const count = (kinds: Provision["kind"][]) =>
    document.provisions.filter((provision) => kinds.includes(provision.kind))
      .length;
  return {
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    articleCount: count(["article"]),
    recitalCount: count(["recital"]),
    annexCount: count(["annex"]),
    paragraphCount: count(["paragraph", "subparagraph"]),
    pointCount: count(["point", "subpoint"]),
    structuralNodeCount: document.structuralNodes.length,
    warningCount:
      document.parserWarnings.length +
      document.structuralNodes.reduce(
        (total, node) => total + node.parserWarnings.length,
        0,
      ) +
      document.provisions.reduce(
        (total, provision) => total + provision.parserWarnings.length,
        0,
      ),
  };
}

export function parseFormexAct(
  xml: string,
  source: SourceDefinition,
  snapshot: OfficialSourceSnapshot,
  annexDocuments: FormexAnnexDocument[] = [],
  resources: PreparedFormexResourceDocument[] = [],
): FormexParseResult {
  const parseRoot = (
    documentXml: string,
    rootTags: Array<"ACT" | "CONS.ACT" | "ANNEX">,
  ) => {
    const parsed = new XMLParser({
      preserveOrder: true,
      ignoreAttributes: false,
      attributeNamePrefix: "",
      parseTagValue: false,
      processEntities: false,
      trimValues: false,
    }).parse(documentXml) as unknown;
    if (!Array.isArray(parsed))
      throw new Error("Invalid ordered Formex XML tree");
    return (parsed as OrderedNode[]).find((node) =>
      rootTags.includes(tagName(node) as "ACT" | "CONS.ACT" | "ANNEX"),
    );
  };
  const act = parseRoot(xml, ["ACT", "CONS.ACT"]);
  if (!act) throw new Error("Formex XML has no ACT or CONS.ACT root element");
  const rootTag = tagName(act) as "ACT" | "CONS.ACT";
  const annexes = annexDocuments.map(({ fileName, xml: annexXml }) => {
    const node = parseRoot(annexXml, ["ANNEX"]);
    if (!node) {
      throw new Error(`Formex XML has no ANNEX root element: ${fileName}`);
    }
    return { fileName, node };
  });
  return new FormexDocumentBuilder(source, snapshot, resources).build(
    act,
    annexes,
    rootTag,
  );
}
