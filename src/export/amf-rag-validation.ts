import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { BodyBlock } from "../shared/legal";
import type { RagDocument, RagProvision } from "./rag-snapshot-contract";

const versionUrl =
  "https://www.amf-france.org/fr/eli/fr/aai/amf/rg/20260911/notes";
const hash = (url: string) => createHash("sha256").update(url).digest("hex");
const noteOnly = (block: BodyBlock, contentHash: string): boolean => {
  if (
    block.contentRole !== "source-note" ||
    block.children.length !== 0 ||
    !block.orderedContent.every(
      (item) => item.type === "text" && item.contentRole === "source-note",
    )
  )
    return false;
  const text = block.orderedContent
    .map((item) => (item.type === "text" ? item.text : ""))
    .join("");
  return block.text === text && contentHash === `sha256:${hash(text)}`;
};

export function verifyAmfRagDocument(doc: RagDocument): void {
  const expression = doc.expressions[0];
  const notes = doc.scoped_source_notes ?? [];
  const owners = doc.structure_owner_ids ?? [];
  if (
    doc.official_page_url !== versionUrl ||
    expression.official_source_url !== versionUrl ||
    doc.text_as_of !== "2026-09-11" ||
    doc.source_version !== doc.text_as_of ||
    expression.expression_date !== doc.text_as_of ||
    expression.source_version !== doc.source_version ||
    !isDeepStrictEqual(doc.source_status, expression.source_status) ||
    doc.lifecycle_status !== null ||
    doc.version_status !== null ||
    doc.legal_effect !== null ||
    doc.date_entry_into_force !== null ||
    doc.date_application !== null ||
    doc.date_repeal !== null ||
    owners.length !== 693 ||
    new Set(owners).size !== 693 ||
    notes.length !== 64
  ) {
    throw new Error(
      "Invalid AMF RAG provenance, source status, or owner coverage",
    );
  }
  const indexes = new Map(owners.map((id, index) => [id, index]));
  let lastIndex = -1;
  for (const [index, note] of notes.entries()) {
    if (!noteOnly(note.block, note.content_hash))
      throw new Error("Invalid AMF source-note content");
    if (index === 0) {
      if (
        note.scope !== "document" ||
        note.owner_id !== doc.document_id ||
        note.owner_source_url !== versionUrl ||
        note.position !== 2
      )
        throw new Error("Invalid AMF document source-note owner");
      continue;
    }
    const ownerIndex = indexes.get(note.owner_id);
    if (
      note.scope !== "structure" ||
      note.position !== 1 ||
      !/^https:\/\/www\.amf-france\.org\/fr\/eli\/fr\/aai\/amf\/rg\/livre\/[1-7](?:\/(?:titre|chapitre|section|sous-section|paragraphe|sous-paragraphe)\/[0-9_]+)*\/notes$/.test(
        note.owner_source_url,
      ) ||
      note.owner_id !== `fr:amf:rg:structure:${hash(note.owner_source_url)}` ||
      ownerIndex === undefined ||
      ownerIndex <= lastIndex
    ) {
      throw new Error("Invalid AMF structural source-note owner or order");
    }
    lastIndex = ownerIndex;
  }
}

export function verifyAmfRagProvisions(provisions: RagProvision[]): void {
  const roots = provisions.filter(
    (p) => p.document_id === "fr:amf:rg" && p.parent_provision_id === null,
  );
  if (roots.length !== 1821) throw new Error("Invalid AMF article coverage");
  for (const root of roots) {
    if (
      root.unit_type !== "article" ||
      !/^https:\/\/www\.amf-france\.org\/fr\/eli\/fr\/aai\/amf\/rg\/article\/\d{3}(?:-(?:\d+|[Aa]))+(?:-(?:bis|ter|quater))?\/\d{8}\/notes(?:-0)?$/.test(
        root.official_source_url,
      ) ||
      root.provision_id !==
        `fr:amf:rg:article:${hash(root.official_source_url)}`
    )
      throw new Error(`Invalid AMF article identity: ${root.provision_id}`);
  }
}
