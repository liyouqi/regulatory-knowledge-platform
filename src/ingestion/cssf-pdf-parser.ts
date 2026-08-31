import { CANONICAL_SCHEMA_VERSION } from "../canonical/schema";
import type { CanonicalDocument, Provision } from "../canonical/schema";
import { sha256, validateCanonicalDocument } from "../canonical/validate";
import { buildCssfConsolidatedCircularFromSemanticEvents } from "./cssf-consolidated-pdf-parser";
import type { CssfSourceSnapshot } from "./cssf-snapshot";
import {
  type CssfSourceDefinition,
  cssfDocumentLogicalId,
} from "./cssf-source-registry";
import {
  type TaggedPdfSemanticEvent,
  extractTaggedPdfSemanticEvents,
} from "./tagged-pdf";

export const CSSF_PDF_PARSER_VERSION = "1.1.2";

export type CssfPdfSemanticEvent = TaggedPdfSemanticEvent;

export interface CssfPdfParseResult {
  document: CanonicalDocument;
  report: {
    pageCount: number;
    structuralNodeCount: number;
    provisionCount: number;
    pointCount: number;
    warningCount: number;
  };
}

export async function extractCssfPdfSemanticEvents(
  bytes: Uint8Array,
): Promise<{ pageCount: number; events: CssfPdfSemanticEvent[] }> {
  return extractTaggedPdfSemanticEvents(bytes);
}

type Marker =
  | { kind: "number"; raw: string; normalized: string; text: string }
  | { kind: "letter"; raw: string; normalized: string; text: string }
  | { kind: "subpoint"; raw: string; normalized: string; text: string }
  | { kind: "bullet"; raw: string; normalized?: string; text: string };

function markerOf(value: string): Marker | null {
  const number = /^(\d+)\.\s+(.*)$/u.exec(value);
  if (number) {
    return {
      kind: "number",
      raw: `${number[1]}.`,
      normalized: number[1],
      text: number[2],
    };
  }
  const letter = /^([a-z])\)\s+(.*)$/iu.exec(value);
  if (letter) {
    return {
      kind: "letter",
      raw: `${letter[1]})`,
      normalized: letter[1].toLowerCase(),
      text: letter[2],
    };
  }
  const subpoint = /^\((\d+)\)\s+(.*)$/u.exec(value);
  if (subpoint) {
    return {
      kind: "subpoint",
      raw: `(${subpoint[1]})`,
      normalized: subpoint[1],
      text: subpoint[2],
    };
  }
  const bullet = /^([•▪])\s*(.*)$/u.exec(value);
  if (bullet) return { kind: "bullet", raw: bullet[1], text: bullet[2] };
  return null;
}

interface MutableProvision {
  logicalId: string;
  marker: Marker;
  page: number;
  text: string;
  children: MutableProvision[];
  parentLogicalId?: string;
  structuralPath: Provision["structuralPath"];
}

function completeText(provision: MutableProvision): string {
  return [provision.text, ...provision.children.map(completeText)]
    .filter(Boolean)
    .join("\n");
}

export function buildCssfCircularFromSemanticEvents(
  events: CssfPdfSemanticEvent[],
  pageCount: number,
  snapshot: CssfSourceSnapshot,
  source: CssfSourceDefinition,
): CssfPdfParseResult {
  if (source.contentMediaType !== "application/pdf") {
    throw new Error(`CSSF PDF parser cannot parse ${source.contentMediaType}`);
  }
  if (snapshot.localId !== source.localId) {
    throw new Error("CSSF snapshot does not match source registry entry");
  }
  const documentId = cssfDocumentLogicalId(source.localId);
  const sourceVersion = `cssf-pdf-${CSSF_PDF_PARSER_VERSION}-${snapshot.content.sha256.slice(7, 19)}`;
  const structuralNodes: CanonicalDocument["structuralNodes"] = [];
  const roots: MutableProvision[] = [];
  const introduction: MutableProvision = {
    logicalId: `${documentId}:provision:introduction`,
    marker: {
      kind: "bullet",
      raw: "Introduction",
      normalized: "introduction",
      text: "",
    },
    page: 2,
    text: "",
    children: [],
    structuralPath: [],
  };
  roots.push(introduction);
  const warnings: string[] = [];
  const introductionNotes: MutableProvision[] = [];
  let currentChapter: CanonicalDocument["structuralNodes"][number] | undefined;
  let currentRoot: MutableProvision | undefined;
  let currentLetter: MutableProvision | undefined;
  let introductionBlock = 0;

  for (const event of events.filter((candidate) => candidate.page > 1)) {
    if (event.role === "heading") {
      const match = /^Chapter\s+(\d+)\s*:\s*(.+)$/iu.exec(event.text);
      if (!match) {
        warnings.push(
          `Excluded unsupported CSSF PDF heading on page ${event.page}: ${event.text}`,
        );
        continue;
      }
      const logicalId = `${documentId}:chapter:${match[1]}`;
      currentChapter = {
        logicalId,
        sourceVersionId: `${logicalId}@${sourceVersion}`,
        sourceSnapshotId: snapshot.snapshotId,
        displayOrder: event.page * 1_000,
        sourceLocator: { kind: "pdf-page", value: String(event.page) },
        parserWarnings: [],
        kind: "chapter",
        numberRaw: match[1],
        numberNormalized: match[1],
        label: `Chapter ${match[1]}`,
        title: match[2],
        parentLogicalId: documentId,
      };
      structuralNodes.push(currentChapter);
      currentRoot = undefined;
      currentLetter = undefined;
      continue;
    }
    if (event.role === "table") {
      warnings.push(`Excluded CSSF PDF table on page ${event.page}`);
      continue;
    }
    if (event.role === "paragraph" || event.role === "note") {
      if (currentChapter) {
        if (event.text.length > 1) {
          warnings.push(
            `Excluded unnumbered CSSF PDF text on page ${event.page}`,
          );
        }
        continue;
      }
      if (
        event.text === source.officialTitle ||
        event.text === source.subject ||
        event.text === "TABLE OF CONTENTS"
      ) {
        continue;
      }
      introductionBlock += 1;
      const logicalId = `${introduction.logicalId}:block:${introductionBlock}`;
      const block: MutableProvision = {
        logicalId,
        marker: { kind: "bullet", raw: "Paragraph", text: event.text },
        page: event.page,
        text: event.text,
        children: [],
        parentLogicalId: introduction.logicalId,
        structuralPath: [],
      };
      if (event.role === "note") introductionNotes.push(block);
      else introduction.children.push(block);
      continue;
    }
    const marker = markerOf(event.text);
    if (!marker) {
      if (!currentChapter) {
        introductionBlock += 1;
        const logicalId = `${introduction.logicalId}:block:${introductionBlock}`;
        introduction.children.push({
          logicalId,
          marker: { kind: "bullet", raw: "•", text: event.text },
          page: event.page,
          text: event.text,
          children: [],
          parentLogicalId: introduction.logicalId,
          structuralPath: [],
        });
      } else {
        warnings.push(
          `Excluded unmarked CSSF PDF list item on page ${event.page}`,
        );
      }
      continue;
    }
    if (!currentChapter) {
      introductionBlock += 1;
      const logicalId = `${introduction.logicalId}:point:${introductionBlock}`;
      introduction.children.push({
        logicalId,
        marker,
        page: event.page,
        text: marker.text,
        children: [],
        parentLogicalId: introduction.logicalId,
        structuralPath: [],
      });
      continue;
    }
    const structuralPath = [
      {
        logicalId: currentChapter.logicalId,
        kind: currentChapter.kind,
        label: currentChapter.label,
      },
    ];
    if (marker.kind === "number") {
      const logicalId = `${documentId}:provision:point-${marker.normalized}`;
      currentRoot = {
        logicalId,
        marker,
        page: event.page,
        text: marker.text,
        children: [],
        parentLogicalId: currentChapter.logicalId,
        structuralPath,
      };
      roots.push(currentRoot);
      currentLetter = undefined;
      continue;
    }
    if (!currentRoot) {
      throw new Error(
        `CSSF PDF child point has no numbered parent on page ${event.page}`,
      );
    }
    if (marker.kind === "letter") {
      const logicalId = `${currentRoot.logicalId}:point:${marker.normalized}`;
      currentLetter = {
        logicalId,
        marker,
        page: event.page,
        text: marker.text,
        children: [],
        parentLogicalId: currentRoot.logicalId,
        structuralPath,
      };
      currentRoot.children.push(currentLetter);
      continue;
    }
    const parent =
      marker.kind === "subpoint" && currentLetter ? currentLetter : currentRoot;
    const suffix = marker.normalized ?? String(parent.children.length + 1);
    const logicalId = `${parent.logicalId}:${marker.kind}:${suffix}`;
    parent.children.push({
      logicalId,
      marker,
      page: event.page,
      text: marker.text,
      children: [],
      parentLogicalId: parent.logicalId,
      structuralPath,
    });
  }

  introduction.children.push(...introductionNotes);
  introduction.text = introduction.children.map(completeText).join("\n");
  if (!introduction.text)
    throw new Error("CSSF PDF parser produced no introduction");
  const numbered = roots.filter((root) => root.marker.kind === "number");
  const expected = numbered.map((root) => Number(root.marker.normalized));
  if (expected.some((number, index) => number !== index + 1)) {
    throw new Error(
      `CSSF PDF numbered provisions are not contiguous: ${expected.join(", ")}`,
    );
  }

  let provisionSequence = 0;
  const provisions: Provision[] = [];
  const addProvision = (item: MutableProvision, kind: Provision["kind"]) => {
    provisionSequence += 1;
    const displayOrder = item.page * 1_000 + provisionSequence;
    const text = item === introduction ? introduction.text : completeText(item);
    provisions.push({
      logicalId: item.logicalId,
      sourceVersionId: `${item.logicalId}@${sourceVersion}`,
      sourceSnapshotId: snapshot.snapshotId,
      displayOrder,
      sourceLocator: { kind: "pdf-page", value: String(item.page) },
      parserWarnings: [],
      kind,
      numberRaw: item.marker.raw,
      numberNormalized: item.marker.normalized,
      label:
        item === introduction
          ? "Introduction"
          : item.marker.kind === "number"
            ? `Point ${item.marker.normalized}`
            : item.marker.raw,
      text,
      leadText:
        item.children.length > 0 && item !== introduction
          ? item.text
          : undefined,
      contentHash: sha256(text),
      parentLogicalId: item.parentLogicalId,
      structuralPath: item.structuralPath,
    });
    for (const child of item.children) {
      addProvision(
        child,
        child.marker.kind === "subpoint"
          ? "subpoint"
          : child.marker.kind === "letter"
            ? "point"
            : "other",
      );
    }
  };
  for (const root of roots) addProvision(root, "other");

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
  const result = {
    document,
    report: {
      pageCount,
      structuralNodeCount: structuralNodes.length,
      provisionCount: roots.length,
      pointCount: provisions.length - roots.length,
      warningCount: warnings.length,
    },
  };
  if (source.pdfQuality) {
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
    for (const [logicalId, expectedHash] of Object.entries(
      quality.textHashes,
    )) {
      const provision = document.provisions.find(
        (candidate) => candidate.logicalId === logicalId,
      );
      if (!provision)
        throw new Error(`CSSF PDF quality anchor is missing: ${logicalId}`);
      if (provision.contentHash !== expectedHash) {
        throw new Error(`CSSF PDF quality anchor text drift: ${logicalId}`);
      }
    }
  }
  return result;
}

export async function parseCssfPdf(
  bytes: Uint8Array,
  snapshot: CssfSourceSnapshot,
  source: CssfSourceDefinition,
): Promise<CssfPdfParseResult> {
  if (sha256(bytes) !== snapshot.content.sha256) {
    throw new Error("CSSF PDF input does not match snapshot content hash");
  }
  const { pageCount, events } = await extractCssfPdfSemanticEvents(bytes);
  if (source.pdfProfile === "consolidated-governance") {
    return buildCssfConsolidatedCircularFromSemanticEvents(
      events,
      pageCount,
      snapshot,
      source,
      CSSF_PDF_PARSER_VERSION,
    );
  }
  return buildCssfCircularFromSemanticEvents(
    events,
    pageCount,
    snapshot,
    source,
  );
}
