import { CANONICAL_SCHEMA_VERSION } from "../canonical/schema";
import type { CanonicalDocument, Provision } from "../canonical/schema";
import { sha256, validateCanonicalDocument } from "../canonical/validate";
import type { EbaSourceSnapshot } from "./eba-snapshot";
import type { EbaSourceDefinition } from "./eba-source-registry";
import {
  type TaggedPdfSemanticEvent,
  extractTaggedPdfSemanticEvents,
} from "./tagged-pdf";

export const EBA_GUIDELINES_PDF_PARSER_VERSION = "1.1.0";

interface MutableProvision {
  logicalId: string;
  page: number;
  label: string;
  numberRaw?: string;
  numberNormalized?: string;
  text: string;
  children: MutableProvision[];
  parentLogicalId?: string;
  structuralPath: Provision["structuralPath"];
}

export interface EbaGuidelinesParseResult {
  document: CanonicalDocument;
  report: {
    pageCount: number;
    structuralNodeCount: number;
    provisionCount: number;
    blockCount: number;
    warningCount: number;
  };
}

const EARLY_NUMBERED_HEADINGS = new Set([
  "1. Compliance and reporting obligations",
  "2. Subject matter, scope and definitions",
  "3. Implementation",
  "4. Guidelines",
]);

function structuralHeading(
  event: TaggedPdfSemanticEvent,
  expectedParagraph: number,
): boolean {
  const { text } = event;
  if (EARLY_NUMBERED_HEADINGS.has(text)) return true;
  const numbered = /^(\d+(?:\.\d+)*)(?:\.)?\s+\S/u.exec(text);
  if (
    event.role !== "note" &&
    numbered &&
    Number(numbered[1]) !== expectedParagraph
  ) {
    return true;
  }
  return /^(?:Title\s+[IVX]+\b|Section\s+\d+\b|Status of these guidelines$|Reporting requirements$|Subject matter$|Addressees$|Scope of application$|Definitions$|Date of application$|Repeal$)/u.test(
    text,
  );
}

function headingKind(text: string): "title" | "section" | "subsection" {
  if (/^Title\s+/u.test(text)) return "title";
  if (/^(?:\d+\.\s+|Section\s+)/u.test(text)) return "section";
  return "subsection";
}

function appendBlock(
  parent: MutableProvision,
  event: TaggedPdfSemanticEvent,
): void {
  const sequence = parent.children.length + 1;
  parent.children.push({
    logicalId: `${parent.logicalId}:block:${sequence}`,
    page: event.page,
    label:
      event.role === "list-item"
        ? `Item ${sequence}`
        : event.role === "table"
          ? `Table ${sequence}`
          : `Text ${sequence}`,
    text: event.text,
    children: [],
    parentLogicalId: parent.logicalId,
    structuralPath: parent.structuralPath,
  });
}

function completeText(provision: MutableProvision): string {
  return [provision.text, ...provision.children.map(completeText)]
    .filter(Boolean)
    .join("\n");
}

export function buildEbaGuidelinesFromSemanticEvents(
  events: TaggedPdfSemanticEvent[],
  pageCount: number,
  snapshot: EbaSourceSnapshot,
  source: EbaSourceDefinition,
): EbaGuidelinesParseResult {
  if (snapshot.documentId !== source.documentId) {
    throw new Error("EBA snapshot does not match source registry entry");
  }
  if (pageCount !== 93) {
    throw new Error(`EBA Guidelines page-count drift: ${pageCount}`);
  }
  const documentId = source.documentId;
  const sourceVersion = `eba-pdf-${EBA_GUIDELINES_PDF_PARSER_VERSION}-${snapshot.content.sha256.slice(7, 19)}`;
  const structuralNodes: CanonicalDocument["structuralNodes"] = [];
  const roots: MutableProvision[] = [];
  const warnings = [
    "Excluded Final Report front matter on PDF pages 1-12 from the Guidelines legal body.",
    "Excluded accompanying documents on PDF pages 65-93 from the Guidelines legal body.",
  ];
  let expectedParagraph = 1;
  let current: MutableProvision | undefined;
  let currentPath: Provision["structuralPath"] = [];
  let annex: MutableProvision | undefined;

  for (const event of events.filter(
    (candidate) => candidate.page >= 14 && candidate.page <= 64,
  )) {
    if (
      event.text ===
      "Annex I – Aspects to take into account when developing an internal governance policy"
    ) {
      annex = {
        logicalId: `${documentId}:annex:i`,
        page: event.page,
        label: "Annex I",
        numberRaw: "I",
        numberNormalized: "i",
        text: event.text,
        children: [],
        structuralPath: [],
      };
      roots.push(annex);
      current = annex;
      continue;
    }
    if (annex) {
      appendBlock(annex, event);
      continue;
    }
    if (structuralHeading(event, expectedParagraph)) {
      const kind = headingKind(event.text);
      const logicalId = `${documentId}:structure:${structuralNodes.length + 1}`;
      const label = event.text;
      structuralNodes.push({
        logicalId,
        sourceVersionId: `${logicalId}@${sourceVersion}`,
        sourceSnapshotId: snapshot.snapshotId,
        displayOrder: event.page * 1_000 + structuralNodes.length,
        sourceLocator: { kind: "pdf-page", value: String(event.page) },
        parserWarnings: [],
        kind,
        label,
        parentLogicalId: documentId,
      });
      currentPath = [{ logicalId, kind, label }];
      current = undefined;
      continue;
    }
    const paragraph = /^(\d+)\.\s+(.*)$/u.exec(event.text);
    if (paragraph && Number(paragraph[1]) === expectedParagraph) {
      const logicalId = `${documentId}:paragraph:${paragraph[1]}`;
      current = {
        logicalId,
        page: event.page,
        label: `Paragraph ${paragraph[1]}`,
        numberRaw: `${paragraph[1]}.`,
        numberNormalized: paragraph[1],
        text: paragraph[2],
        children: [],
        parentLogicalId: currentPath.at(-1)?.logicalId,
        structuralPath: currentPath,
      };
      roots.push(current);
      expectedParagraph += 1;
      continue;
    }
    if (current) appendBlock(current, event);
  }

  if (expectedParagraph !== 235) {
    throw new Error(
      `EBA Guidelines paragraphs are not contiguous through 234: stopped at ${expectedParagraph - 1}`,
    );
  }
  if (!annex || annex.children.length === 0) {
    throw new Error("EBA Guidelines Annex I was not captured");
  }

  const provisions: Provision[] = [];
  let displayOrder = 0;
  const addProvision = (
    item: MutableProvision,
    kind: Provision["kind"],
  ): void => {
    displayOrder += 1;
    const text = completeText(item);
    provisions.push({
      logicalId: item.logicalId,
      sourceVersionId: `${item.logicalId}@${sourceVersion}`,
      sourceSnapshotId: snapshot.snapshotId,
      displayOrder,
      sourceLocator: { kind: "pdf-page", value: String(item.page) },
      parserWarnings: [],
      kind,
      numberRaw: item.numberRaw,
      numberNormalized: item.numberNormalized,
      label: item.label,
      text,
      leadText: item.children.length > 0 ? item.text : undefined,
      contentHash: sha256(text),
      parentLogicalId: item.parentLogicalId,
      structuralPath: item.structuralPath,
    });
    if (kind === "other" && item.numberNormalized && item.text) {
      const logicalId = `${item.logicalId}:text`;
      displayOrder += 1;
      provisions.push({
        logicalId,
        sourceVersionId: `${logicalId}@${sourceVersion}`,
        sourceSnapshotId: snapshot.snapshotId,
        displayOrder,
        sourceLocator: { kind: "pdf-page", value: String(item.page) },
        parserWarnings: [],
        kind: "paragraph",
        label: item.label,
        text: item.text,
        contentHash: sha256(item.text),
        parentLogicalId: item.logicalId,
        structuralPath: item.structuralPath,
      });
    }
    for (const child of item.children) addProvision(child, "other");
  };
  for (const root of roots) {
    addProvision(root, root === annex ? "annex" : "other");
  }

  const document = validateCanonicalDocument({
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    logicalId: documentId,
    sourceVersionId: `${documentId}@${sourceVersion}`,
    sourceSnapshotId: snapshot.snapshotId,
    displayOrder: 0,
    sourceLocator: { kind: "pdf-page", value: "13" },
    parserWarnings: warnings,
    jurisdiction: source.jurisdiction,
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
  const result = {
    document,
    report: {
      pageCount,
      structuralNodeCount: structuralNodes.length,
      provisionCount: roots.length,
      blockCount: provisions.length - roots.length,
      warningCount: warnings.length,
    },
  };
  if (source.quality) {
    for (const field of [
      "pageCount",
      "structuralNodeCount",
      "provisionCount",
      "blockCount",
    ] as const) {
      if (result.report[field] !== source.quality[field]) {
        throw new Error(
          `EBA Guidelines ${field} drift: expected ${source.quality[field]}, received ${result.report[field]}`,
        );
      }
    }
    if (result.report.warningCount > source.quality.maximumWarnings) {
      throw new Error("EBA Guidelines parser warning limit exceeded");
    }
    for (const [logicalId, expectedHash] of Object.entries(
      source.quality.textHashes,
    )) {
      const provision = document.provisions.find(
        (candidate) => candidate.logicalId === logicalId,
      );
      if (!provision)
        throw new Error(`EBA quality anchor missing: ${logicalId}`);
      if (provision.contentHash !== expectedHash) {
        throw new Error(`EBA quality anchor text drift: ${logicalId}`);
      }
    }
  }
  return result;
}

export async function parseEbaGuidelinesPdf(
  bytes: Uint8Array,
  snapshot: EbaSourceSnapshot,
  source: EbaSourceDefinition,
): Promise<EbaGuidelinesParseResult> {
  if (sha256(bytes) !== snapshot.content.sha256) {
    throw new Error("EBA PDF input does not match snapshot content hash");
  }
  const { pageCount, events } = await extractTaggedPdfSemanticEvents(bytes);
  return buildEbaGuidelinesFromSemanticEvents(
    events,
    pageCount,
    snapshot,
    source,
  );
}
