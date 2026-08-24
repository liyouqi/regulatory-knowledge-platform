import { CANONICAL_SCHEMA_VERSION } from "../canonical/schema";
import type { CanonicalDocument, Provision } from "../canonical/schema";
import { sha256, validateCanonicalDocument } from "../canonical/validate";
import type {
  CssfPdfParseResult,
  CssfPdfSemanticEvent,
} from "./cssf-pdf-parser";
import type { CssfSourceSnapshot } from "./cssf-snapshot";
import {
  type CssfSourceDefinition,
  cssfDocumentLogicalId,
} from "./cssf-source-registry";

type StructuralNode = CanonicalDocument["structuralNodes"][number];
type StructuralPath = Provision["structuralPath"];

interface HeadingMarker {
  level: number;
  kind: StructuralNode["kind"];
  numberRaw: string;
  numberNormalized: string;
  label: string;
  title: string;
}

interface MutableProvision {
  logicalId: string;
  page: number;
  order: number;
  kind: Provision["kind"];
  label: string;
  text: string;
  children: MutableProvision[];
  structuralPath: StructuralPath;
  numberRaw?: string;
  numberNormalized?: string;
  parentLogicalId?: string;
}

interface StructuralStackEntry {
  level: number;
  node: StructuralNode;
}

function headingMarker(value: string): HeadingMarker | null {
  const patterns: Array<{
    expression: RegExp;
    level: number;
    kind: StructuralNode["kind"];
    label: (number: string) => string;
  }> = [
    {
      expression: /^Part\s+([IVX]+)\s*[-.]\s*(.+)$/iu,
      level: 0,
      kind: "part",
      label: (number) => `Part ${number.toUpperCase()}`,
    },
    {
      expression: /^Chapter\s+(\d+)\.\s*(.+)$/iu,
      level: 1,
      kind: "chapter",
      label: (number) => `Chapter ${number}`,
    },
    {
      expression: /^Sub-chapter\s+([\d.]*\d)\.?\s+(.+)$/iu,
      level: 2,
      kind: "division",
      label: (number) => `Sub-chapter ${number}`,
    },
    {
      expression: /^Section\s+([\d.]*\d)\.\s*(.+)$/iu,
      level: 3,
      kind: "section",
      label: (number) => `Section ${number}`,
    },
    {
      expression: /^Sub-section\s+([\d.]*\d)\.\s*(.+)$/iu,
      level: 4,
      kind: "subsection",
      label: (number) => `Sub-section ${number}`,
    },
  ];
  for (const pattern of patterns) {
    const match = pattern.expression.exec(value);
    if (!match) continue;
    return {
      level: pattern.level,
      kind: pattern.kind,
      numberRaw: match[1],
      numberNormalized: match[1].toLowerCase(),
      label: pattern.label(match[1]),
      title: match[2],
    };
  }
  return null;
}

function structuralPath(stack: StructuralStackEntry[]): StructuralPath {
  return stack.map(({ node }) => ({
    logicalId: node.logicalId,
    kind: node.kind,
    label: node.label,
  }));
}

function completeText(provision: MutableProvision): string {
  return [provision.text, ...provision.children.map(completeText)]
    .filter(Boolean)
    .join("\n");
}

function assertSequence(label: string, values: number[], first: number): void {
  if (values.length === 0) {
    throw new Error(`CSSF consolidated PDF ${label} has no provisions`);
  }
  if (values.some((value, index) => value !== first + index)) {
    throw new Error(
      `CSSF consolidated PDF ${label} provisions are not contiguous: ${values.join(", ")}`,
    );
  }
}

function assertQuality(
  result: CssfPdfParseResult,
  source: CssfSourceDefinition,
): void {
  if (!source.pdfQuality) return;
  const quality = source.pdfQuality;
  for (const field of [
    "pageCount",
    "structuralNodeCount",
    "provisionCount",
    "pointCount",
  ] as const) {
    if (result.report[field] !== quality[field]) {
      throw new Error(
        `CSSF PDF ${field} drift: expected ${quality[field]}, received ${result.report[field]}`,
      );
    }
  }
  if (result.report.warningCount > quality.maximumWarnings) {
    throw new Error(
      `CSSF PDF parser warning limit exceeded: expected at most ${quality.maximumWarnings}, received ${result.report.warningCount}`,
    );
  }
  for (const [logicalId, expectedHash] of Object.entries(quality.textHashes)) {
    const provision = result.document.provisions.find(
      (candidate) => candidate.logicalId === logicalId,
    );
    if (!provision)
      throw new Error(`CSSF PDF quality anchor is missing: ${logicalId}`);
    if (provision.contentHash !== expectedHash) {
      throw new Error(`CSSF PDF quality anchor text drift: ${logicalId}`);
    }
  }
}

export function buildCssfConsolidatedCircularFromSemanticEvents(
  events: CssfPdfSemanticEvent[],
  pageCount: number,
  snapshot: CssfSourceSnapshot,
  source: CssfSourceDefinition,
  parserVersion: string,
): CssfPdfParseResult {
  if (source.contentMediaType !== "application/pdf") {
    throw new Error(
      `CSSF consolidated PDF parser cannot parse ${source.contentMediaType}`,
    );
  }
  if (snapshot.localId !== source.localId) {
    throw new Error("CSSF snapshot does not match source registry entry");
  }

  const documentId = cssfDocumentLogicalId(source.localId);
  const sourceVersion = `cssf-pdf-${parserVersion}-${snapshot.content.sha256.slice(7, 19)}`;
  const structuralNodes: StructuralNode[] = [];
  const stack: StructuralStackEntry[] = [];
  const roots: MutableProvision[] = [];
  const warnings: string[] = [];
  const partNumbers = new Map<string, number[]>();
  let order = 0;
  let currentPart: string | undefined;
  let currentRoot: MutableProvision | undefined;
  let currentContentParent: MutableProvision | undefined;
  let currentListByDepth = new Map<number, MutableProvision>();
  let currentAnnex: MutableProvision | undefined;
  let timelineCount = 0;
  let standaloneCount = 0;
  let context: "preamble" | "main" | "timeline" | "annex" = "preamble";

  const introduction: MutableProvision = {
    logicalId: `${documentId}:provision:introduction`,
    page: 2,
    order: 1,
    kind: "other",
    label: "Introduction",
    numberRaw: "Introduction",
    numberNormalized: "introduction",
    text: "",
    children: [],
    structuralPath: [],
  };
  roots.push(introduction);

  const addChild = (
    parent: MutableProvision,
    child: Omit<MutableProvision, "parentLogicalId">,
  ): MutableProvision => {
    const complete = { ...child, parentLogicalId: parent.logicalId };
    parent.children.push(complete);
    return complete;
  };

  const currentPath = () => structuralPath(stack);
  const currentStructuralParent = () =>
    stack.at(-1)?.node.logicalId ?? documentId;
  const resetProvisionContext = () => {
    currentRoot = undefined;
    currentContentParent = undefined;
    currentListByDepth = new Map();
  };

  for (const event of events) {
    order += 1;

    if (event.role === "heading") {
      const marker = headingMarker(event.text);
      if (!marker) {
        throw new Error(
          `Unsupported CSSF consolidated PDF heading on page ${event.page}: ${event.text}`,
        );
      }
      while ((stack.at(-1)?.level ?? -1) >= marker.level) stack.pop();
      const parentLogicalId = stack.at(-1)?.node.logicalId ?? documentId;
      const logicalId = `${parentLogicalId}:${marker.kind}:${marker.numberNormalized}`;
      const node: StructuralNode = {
        logicalId,
        sourceVersionId: `${logicalId}@${sourceVersion}`,
        sourceSnapshotId: snapshot.snapshotId,
        displayOrder: order,
        sourceLocator: { kind: "pdf-page", value: String(event.page) },
        parserWarnings: [],
        kind: marker.kind,
        numberRaw: marker.numberRaw,
        numberNormalized: marker.numberNormalized,
        label: marker.label,
        title: marker.title,
        parentLogicalId,
      };
      structuralNodes.push(node);
      stack.push({ level: marker.level, node });
      if (marker.kind === "part") {
        currentPart = marker.numberNormalized.toUpperCase();
        context = currentPart === "IV" ? "timeline" : "main";
      }
      currentAnnex = undefined;
      resetProvisionContext();
      continue;
    }

    const annexMatch = /^Annex\s+(I|II)\s+-\s+(.+)$/iu.exec(event.text);
    if (event.role === "paragraph" && annexMatch) {
      stack.length = 0;
      context = "annex";
      resetProvisionContext();
      const annexNumber = annexMatch[1].toLowerCase();
      const logicalId = `${documentId}:annex:${annexNumber}`;
      currentAnnex = {
        logicalId,
        page: event.page,
        order,
        kind: "annex",
        label: `Annex ${annexMatch[1].toUpperCase()}`,
        numberRaw: annexMatch[1].toUpperCase(),
        numberNormalized: annexNumber,
        text: annexMatch[2],
        children: [],
        structuralPath: [],
      };
      roots.push(currentAnnex);
      currentRoot = currentAnnex;
      currentContentParent = currentAnnex;
      continue;
    }

    if (event.page === 83) {
      if (!warnings.includes("Excluded CSSF PDF contact footer on page 83")) {
        warnings.push("Excluded CSSF PDF contact footer on page 83");
      }
      continue;
    }

    if (context === "preamble") {
      if (
        event.page === 1 ||
        event.text === "TABLE OF CONTENTS" ||
        /^Circular CSSF 12\/552 as amended by/iu.test(event.text)
      ) {
        continue;
      }
      addChild(introduction, {
        logicalId: `${introduction.logicalId}:block:${introduction.children.length + 1}`,
        page: event.page,
        order,
        kind: event.role === "note" ? "subparagraph" : "paragraph",
        label: event.role === "note" ? "Footnote" : "Paragraph",
        text: event.text,
        children: [],
        structuralPath: [],
      });
      continue;
    }

    if (
      context === "timeline" &&
      (event.role === "paragraph" || event.role === "note")
    ) {
      timelineCount += 1;
      const logicalId = `${documentId}:part:iv:timeline:block-${timelineCount}`;
      currentRoot = {
        logicalId,
        page: event.page,
        order,
        kind: "other",
        label: event.role === "note" ? "Footnote" : "Paragraph",
        numberNormalized: `timeline-${timelineCount}`,
        text: event.text,
        children: [],
        parentLogicalId: currentStructuralParent(),
        structuralPath: currentPath(),
      };
      roots.push(currentRoot);
      currentContentParent = currentRoot;
      currentListByDepth = new Map();
      continue;
    }

    if (event.role === "table") {
      if (!currentRoot) {
        standaloneCount += 1;
        const logicalId = `${documentId}:part:${currentPart?.toLowerCase() ?? "unknown"}:provision:block-${standaloneCount}`;
        currentRoot = {
          logicalId,
          page: event.page,
          order,
          kind: "other",
          label: "Table",
          numberNormalized: `block-${standaloneCount}`,
          text: event.text,
          children: [],
          parentLogicalId: currentStructuralParent(),
          structuralPath: currentPath(),
        };
        roots.push(currentRoot);
        currentContentParent = currentRoot;
        continue;
      }
      addChild(currentRoot, {
        logicalId: `${currentRoot.logicalId}:table:${currentRoot.children.length + 1}`,
        page: event.page,
        order,
        kind: "table",
        label: "Table",
        text: event.text,
        children: [],
        structuralPath: currentRoot.structuralPath,
      });
      continue;
    }

    const numberDot = /^(\d+)\.\s+(.*)$/u.exec(event.text);
    const numberParen = /^(\d+)\)\s+(.*)$/u.exec(event.text);
    const letter = /^([a-z]|i{1,3})\.\s+(.*)$/iu.exec(event.text);
    const bullet = /^([•▪])\s*(.*)$/u.exec(event.text);

    if (context === "timeline" && bullet) {
      timelineCount += 1;
      const logicalId = `${documentId}:part:iv:timeline:${timelineCount}`;
      currentRoot = {
        logicalId,
        page: event.page,
        order,
        kind: "other",
        label: "•",
        numberRaw: bullet[1],
        numberNormalized: `timeline-${timelineCount}`,
        text: bullet[2],
        children: [],
        parentLogicalId: currentStructuralParent(),
        structuralPath: currentPath(),
      };
      roots.push(currentRoot);
      currentContentParent = currentRoot;
      currentListByDepth = new Map();
      continue;
    }

    if (numberDot) {
      const number = Number(numberDot[1]);
      if (context === "annex") {
        if (!currentAnnex) {
          throw new Error(
            `CSSF consolidated PDF annex point has no annex on page ${event.page}`,
          );
        }
        currentRoot = addChild(currentAnnex, {
          logicalId: `${currentAnnex.logicalId}:point:${number}`,
          page: event.page,
          order,
          kind: "point",
          label: `Point ${number}`,
          numberRaw: `${number}.`,
          numberNormalized: String(number),
          text: numberDot[2],
          children: [],
          structuralPath: [],
        });
      } else if (
        currentPart === "I" &&
        stack.at(-1)?.node.label === "Chapter 1" &&
        currentRoot
      ) {
        currentContentParent = addChild(currentRoot, {
          logicalId: `${currentRoot.logicalId}:definition:${number}`,
          page: event.page,
          order,
          kind: "point",
          label: `Point ${number}`,
          numberRaw: `${number}.`,
          numberNormalized: String(number),
          text: numberDot[2],
          children: [],
          structuralPath: currentRoot.structuralPath,
        });
        currentListByDepth = new Map([[0, currentContentParent]]);
        continue;
      } else {
        if (!currentPart || !["I", "II", "III"].includes(currentPart)) {
          throw new Error(
            `CSSF consolidated PDF numbered provision is outside Parts I-III on page ${event.page}`,
          );
        }
        const logicalId = `${documentId}:part:${currentPart.toLowerCase()}:provision:point-${number}`;
        currentRoot = {
          logicalId,
          page: event.page,
          order,
          kind: "other",
          label: `Point ${number}`,
          numberRaw: `${number}.`,
          numberNormalized: String(number),
          text: numberDot[2],
          children: [],
          parentLogicalId: currentStructuralParent(),
          structuralPath: currentPath(),
        };
        roots.push(currentRoot);
        const numbers = partNumbers.get(currentPart) ?? [];
        numbers.push(number);
        partNumbers.set(currentPart, numbers);
      }
      currentContentParent = currentRoot;
      currentListByDepth = new Map();
      continue;
    }

    if (numberParen && context === "annex") {
      if (!currentAnnex) {
        throw new Error(
          `CSSF consolidated PDF annex point has no annex on page ${event.page}`,
        );
      }
      const number = Number(numberParen[1]);
      currentRoot = addChild(currentAnnex, {
        logicalId: `${currentAnnex.logicalId}:point:${number}`,
        page: event.page,
        order,
        kind: "point",
        label: `Point ${number}`,
        numberRaw: `${number})`,
        numberNormalized: String(number),
        text: numberParen[2],
        children: [],
        structuralPath: [],
      });
      currentContentParent = currentRoot;
      currentListByDepth = new Map();
      continue;
    }

    if (letter || bullet) {
      if (!currentContentParent && !currentRoot) {
        throw new Error(
          `CSSF consolidated PDF list item has no parent on page ${event.page}`,
        );
      }
      const matchedMarker = letter ?? bullet;
      if (!matchedMarker) {
        throw new Error(
          `CSSF consolidated PDF marker is unavailable on page ${event.page}`,
        );
      }
      const raw = letter ? `${letter[1]}.` : matchedMarker[1];
      const text = matchedMarker[2];
      const baseParent = currentContentParent ?? currentRoot;
      if (!baseParent) {
        throw new Error(
          `CSSF consolidated PDF list parent is unavailable on page ${event.page}`,
        );
      }
      let parent = baseParent;
      if (event.depth > 0) {
        parent =
          currentListByDepth.get(event.depth - 1) ??
          currentContentParent ??
          baseParent;
      }
      const normalized = letter
        ? letter[1].toLowerCase()
        : String(parent.children.length + 1);
      const suffix = letter ? `point:${normalized}` : `bullet:${normalized}`;
      const child = addChild(parent, {
        logicalId: `${parent.logicalId}:${suffix}`,
        page: event.page,
        order,
        kind: letter ? "point" : "subpoint",
        label: raw,
        numberRaw: raw,
        numberNormalized: normalized,
        text,
        children: [],
        structuralPath: parent.structuralPath,
      });
      currentListByDepth.set(event.depth, child);
      for (const depth of [...currentListByDepth.keys()]) {
        if (depth > event.depth) currentListByDepth.delete(depth);
      }
      continue;
    }

    if (event.role === "paragraph" || event.role === "note") {
      if (!currentRoot) {
        standaloneCount += 1;
        const logicalId = `${documentId}:part:${currentPart?.toLowerCase() ?? "unknown"}:provision:block-${standaloneCount}`;
        currentRoot = {
          logicalId,
          page: event.page,
          order,
          kind: "other",
          label: event.role === "note" ? "Footnote" : "Paragraph",
          numberNormalized: `block-${standaloneCount}`,
          text: event.text,
          children: [],
          parentLogicalId: currentStructuralParent(),
          structuralPath: currentPath(),
        };
        roots.push(currentRoot);
        currentContentParent = currentRoot;
      } else {
        const parent = currentContentParent ?? currentRoot;
        addChild(parent, {
          logicalId: `${parent.logicalId}:${event.role}:${parent.children.length + 1}`,
          page: event.page,
          order,
          kind: event.role === "note" ? "subparagraph" : "paragraph",
          label: event.role === "note" ? "Footnote" : "Paragraph",
          text: event.text,
          children: [],
          structuralPath: parent.structuralPath,
        });
      }
      continue;
    }

    throw new Error(
      `Unsupported CSSF consolidated PDF event on page ${event.page}: ${event.text}`,
    );
  }

  introduction.text = introduction.children.map(completeText).join("\n");
  if (!introduction.text) {
    throw new Error("CSSF consolidated PDF parser produced no introduction");
  }
  assertSequence("Part I", partNumbers.get("I") ?? [], 1);
  assertSequence("Part II", partNumbers.get("II") ?? [], 1);
  assertSequence("Part III", partNumbers.get("III") ?? [], 1);
  const annexOne = roots.find((root) => root.logicalId.endsWith(":annex:i"));
  const annexTwo = roots.find((root) => root.logicalId.endsWith(":annex:ii"));
  assertSequence(
    "Annex I",
    annexOne?.children
      .filter((child) => child.numberNormalized)
      .map((child) => Number(child.numberNormalized)) ?? [],
    89,
  );
  assertSequence(
    "Annex II",
    annexTwo?.children
      .filter((child) => child.numberNormalized)
      .map((child) => Number(child.numberNormalized)) ?? [],
    1,
  );

  const provisions: Provision[] = [];
  const addProvision = (item: MutableProvision) => {
    const text = completeText(item);
    provisions.push({
      logicalId: item.logicalId,
      sourceVersionId: `${item.logicalId}@${sourceVersion}`,
      sourceSnapshotId: snapshot.snapshotId,
      displayOrder: item.order,
      sourceLocator: { kind: "pdf-page", value: String(item.page) },
      parserWarnings: [],
      kind: item.kind,
      numberRaw: item.numberRaw,
      numberNormalized: item.numberNormalized,
      label: item.label,
      text,
      leadText: item.children.length > 0 ? item.text : undefined,
      contentHash: sha256(text),
      parentLogicalId: item.parentLogicalId,
      structuralPath: item.structuralPath,
    });
    item.children.forEach(addProvision);
  };
  roots.forEach(addProvision);

  const document = validateCanonicalDocument({
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    logicalId: documentId,
    sourceVersionId: `${documentId}@${sourceVersion}`,
    sourceSnapshotId: snapshot.snapshotId,
    displayOrder: 0,
    sourceLocator: { kind: "pdf-page", value: "1" },
    parserWarnings: warnings,
    jurisdiction: "LU",
    language: source.language,
    documentType: source.documentType,
    identifiers: { localId: source.localId },
    familyIds: [source.familyId],
    shortName: source.shortName,
    officialTitle: source.officialTitle,
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
    structuralNodes,
    provisions,
  });
  const result: CssfPdfParseResult = {
    document,
    report: {
      pageCount,
      structuralNodeCount: structuralNodes.length,
      provisionCount: roots.length,
      pointCount: provisions.length - roots.length,
      warningCount: warnings.length,
    },
  };
  assertQuality(result, source);
  return result;
}
