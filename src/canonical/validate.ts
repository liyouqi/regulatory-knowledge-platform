import { createHash } from "node:crypto";
import { documentLogicalId } from "./ids";
import type { CanonicalDocument } from "./schema";
import { canonicalDocumentSchema } from "./schema";

export function sha256(value: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function validateCanonicalDocument(input: unknown): CanonicalDocument {
  const document = canonicalDocumentSchema.parse(input);
  const entities = [
    document,
    ...document.structuralNodes,
    ...document.provisions,
  ];
  const logicalIds = new Set<string>();

  if (
    document.jurisdiction === "EU" &&
    document.identifiers.celex &&
    document.logicalId !== documentLogicalId(document.identifiers.celex)
  ) {
    throw new Error(
      "EU document logical ID does not match its CELEX identifier",
    );
  }

  for (const entity of entities) {
    if (logicalIds.has(entity.logicalId)) {
      throw new Error(`Duplicate logical ID: ${entity.logicalId}`);
    }
    logicalIds.add(entity.logicalId);

    const expectedSourceVersionId = `${entity.logicalId}@${document.source.sourceVersion}`;
    if (entity.sourceVersionId !== expectedSourceVersionId) {
      throw new Error(
        `Source version ID does not match document source: ${entity.logicalId}`,
      );
    }
    if (entity.sourceSnapshotId !== document.sourceSnapshotId) {
      throw new Error(`Source snapshot mismatch: ${entity.logicalId}`);
    }
  }

  if (document.source.id !== document.sourceSnapshotId) {
    throw new Error(
      "Document source snapshot metadata does not match sourceSnapshotId",
    );
  }

  const resourceIds = new Set<string>();
  for (const resource of document.resources ?? []) {
    if (resourceIds.has(resource.id)) {
      throw new Error(`Duplicate resource ID: ${resource.id}`);
    }
    resourceIds.add(resource.id);
    if (resource.sourceSha256 === resource.renditionSha256) {
      throw new Error(
        `Resource source and browser rendition hashes must differ: ${resource.id}`,
      );
    }
    const rendition = Buffer.from(resource.dataBase64, "base64");
    if (
      rendition.length === 0 ||
      sha256(rendition) !== resource.renditionSha256
    ) {
      throw new Error(`Resource rendition hash mismatch: ${resource.id}`);
    }
  }

  for (const node of document.structuralNodes) {
    if (node.parentLogicalId && !logicalIds.has(node.parentLogicalId)) {
      throw new Error(`Unknown parent logical ID: ${node.parentLogicalId}`);
    }
  }

  for (const provision of document.provisions) {
    if (
      provision.parentLogicalId &&
      !logicalIds.has(provision.parentLogicalId)
    ) {
      throw new Error(
        `Unknown parent logical ID: ${provision.parentLogicalId}`,
      );
    }
    for (const pathEntry of provision.structuralPath) {
      if (!logicalIds.has(pathEntry.logicalId)) {
        throw new Error(
          `Unknown structural path logical ID: ${pathEntry.logicalId}`,
        );
      }
    }
    if (provision.contentHash !== sha256(provision.text)) {
      throw new Error(`Content hash mismatch: ${provision.logicalId}`);
    }
    for (const entry of provision.orderedContent ?? []) {
      if (entry.type === "resource" && !resourceIds.has(entry.resourceId)) {
        throw new Error(
          `Unknown ordered-content resource: ${entry.resourceId}`,
        );
      }
    }
  }

  return document;
}
