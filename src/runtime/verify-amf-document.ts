import { createHash } from "node:crypto";
import {
  type BodyBlock,
  type DocumentView,
  type TocNode,
  documentViewSchema,
} from "../shared/legal";

export function parseVerifiedDocumentView(input: unknown): DocumentView {
  const document = documentViewSchema.parse(input);
  if (document.jurisdiction !== "FR") return document;
  const digest = (url: string) =>
    createHash("sha256").update(url).digest("hex");
  const groups: string[] = [];
  const visit = (node: TocNode) => {
    if (node.type === "group") groups.push(node.id);
    for (const child of node.children) visit(child);
  };
  for (const collection of document.collections)
    for (const root of collection.roots) visit(root);
  if (
    groups.length !== 693 ||
    new Set(groups).size !== 693 ||
    document.provisions.length !== 1821 ||
    document.scopedSourceNotes?.length !== 64
  )
    throw new Error(
      "AMF Reader coverage differs from the reviewed complete source",
    );
  let articleNotes = 0;
  const blockRoles = (block: BodyBlock) => {
    for (const layout of block.contentLayout ?? [])
      if (layout.contentRole === "source-note") articleNotes++;
    for (const child of block.children) blockRoles(child);
  };
  for (const provision of document.provisions) {
    const url = provision.officialSourceUrl;
    if (
      !url ||
      provision.id !== `fr:amf:rg:article:${digest(url)}` ||
      !url.startsWith(
        "https://www.amf-france.org/fr/eli/fr/aai/amf/rg/article/",
      )
    )
      throw new Error("AMF Reader article source address mismatch");
    for (const block of provision.blocks) blockRoles(block);
  }
  if (articleNotes !== 68)
    throw new Error("AMF Reader article publisher-note coverage mismatch");
  const notes = document.scopedSourceNotes ?? [];
  for (const note of notes) {
    const block = note.block;
    const text = block.orderedContent
      .map((item) => (item.type === "text" ? item.text : ""))
      .join("");
    if (
      block.children.length !== 0 ||
      block.contentRole !== "source-note" ||
      !block.orderedContent.every(
        (item) => item.type === "text" && item.contentRole === "source-note",
      ) ||
      block.text !== text ||
      note.contentHash !== `sha256:${digest(text)}`
    )
      throw new Error("AMF Reader scoped note content hash mismatch");
  }
  const documentNotes = notes.filter((note) => note.scope === "document");
  if (
    documentNotes.length !== 1 ||
    notes[0] !== documentNotes[0] ||
    documentNotes[0].position !== 2 ||
    documentNotes[0].ownerSourceUrl !== document.sourceUrl
  )
    throw new Error("AMF document publisher note ownership mismatch");
  let lastGroup = -1;
  for (const note of notes.filter((entry) => entry.scope === "structure")) {
    const index = groups.indexOf(note.ownerId);
    if (
      index <= lastGroup ||
      note.position !== 1 ||
      note.ownerId !== `fr:amf:rg:structure:${digest(note.ownerSourceUrl)}` ||
      !note.ownerSourceUrl.startsWith(
        "https://www.amf-france.org/fr/eli/fr/aai/amf/rg/livre/",
      )
    )
      throw new Error(
        "AMF scoped publisher-note source address or order mismatch",
      );
    lastGroup = index;
  }
  return document;
}
