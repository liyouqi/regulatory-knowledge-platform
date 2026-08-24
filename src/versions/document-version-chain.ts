import { createHash } from "node:crypto";
import {
  type DocumentVersionChain,
  type DocumentVersionEdge,
  type DocumentVersionNode,
  documentVersionChainSchema,
} from "../shared/document-version-chain";
import type { DocumentView } from "../shared/legal";

export const DOCUMENT_VERSION_CHAIN_BUILDER = "document-version-chain";
export const DOCUMENT_VERSION_CHAIN_BUILDER_VERSION = "1.0.0";

function correctionId(documentId: string, date: string, url: string): string {
  const urlHash = createHash("sha256").update(url).digest("hex").slice(0, 12);
  return `version:${documentId}:corrigendum:${date}:${urlHash}`;
}

export function buildDocumentVersionChain(
  document: DocumentView,
): DocumentVersionChain | null {
  const status = document.sourceStatus;
  if (!status) return null;

  const loadedKind =
    status.basis === "original-oj"
      ? "original-oj-snapshot"
      : "consolidated-snapshot";
  const loadedVersionId = `version:${document.id}:${status.basis}:${status.textAsOf}`;
  const currentVersionId = `version:${document.id}:current-version`;
  const loadedNode: DocumentVersionNode = {
    id: loadedVersionId,
    documentId: document.id,
    kind: loadedKind,
    label:
      status.basis === "original-oj"
        ? "Loaded original Official Journal text"
        : "Loaded consolidated text",
    date: status.textAsOf,
    sourceUrl: document.sourceUrl,
    availability: "loaded",
  };
  const currentNode: DocumentVersionNode = {
    id: currentVersionId,
    documentId: document.id,
    kind: "current-version-link",
    label: "Current EUR-Lex version",
    sourceUrl: status.currentVersionUrl,
    availability: "external",
  };
  const currentEdge: DocumentVersionEdge = {
    id: `version-edge:${document.id}:current-version-link`,
    documentId: document.id,
    sourceVersionId: loadedVersionId,
    relationType: "CURRENT_VERSION_LINK",
    targetVersionId: currentVersionId,
    provenance: "OFFICIAL_METADATA",
    sourceRef: status.currentVersionUrl,
  };
  const corrections = [...status.corrections].sort(
    (left, right) =>
      left.date.localeCompare(right.date) || left.url.localeCompare(right.url),
  );
  const correctionNodes: DocumentVersionNode[] = corrections.map(
    (correction) => ({
      id: correctionId(document.id, correction.date, correction.url),
      documentId: document.id,
      kind: "corrigendum",
      label: `Official corrigendum ${correction.date}`,
      date: correction.date,
      sourceUrl: correction.url,
      availability: "external",
    }),
  );
  const correctionEdges: DocumentVersionEdge[] = correctionNodes.map(
    (node) => ({
      id: `version-edge:${document.id}:has-corrigendum:${node.id.slice("version:".length)}`,
      documentId: document.id,
      sourceVersionId: loadedVersionId,
      relationType: "HAS_CORRIGENDUM",
      targetVersionId: node.id,
      provenance: "OFFICIAL_METADATA",
      sourceRef: node.sourceUrl,
    }),
  );

  return documentVersionChainSchema.parse({
    documentId: document.id,
    buildId: document.buildId,
    coverage: "source-status-only",
    checkedAt: status.checkedAt,
    loadedVersionId,
    nodes: [loadedNode, currentNode, ...correctionNodes],
    edges: [currentEdge, ...correctionEdges],
  });
}
