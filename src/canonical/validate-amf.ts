import { createHash } from "node:crypto";
import {
  type ContentUnit,
  contentUnitsText,
  projectContentUnits,
  validateContentLayout,
} from "../shared/content-unit";
import type { CanonicalDocument } from "./schema";

type AmfDocument = Extract<CanonicalDocument, { schemaVersion: "1.5.0" }>;
const origin = "https://www.amf-france.org";
const prefix = `${origin}/fr/eli/fr/aai/amf/rg`;
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const addressId = (kind: "article" | "structure", url: string) =>
  `fr:amf:rg:${kind}:${digest(url)}`;
const parentXPath = (value: string) => value.replace(/\/\*\[\d+\]$/u, "");
function sourceUrl(value: string) {
  const url = new URL(value);
  if (
    url.origin !== origin ||
    url.href !== value ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash
  )
    throw new Error("Invalid AMF source address");
}
function unitsText(
  units: ContentUnit[],
  role: "operative-text" | "source-note" | "toc",
) {
  return `sha256:${digest(contentUnitsText(units, role))}`;
}
function validateUnits(units: ContentUnit[], requiredRole?: "source-note") {
  const visit = (unit: ContentUnit, inheritedNote: boolean) => {
    if ((inheritedNote || requiredRole) && unit.contentRole !== "source-note")
      throw new Error("AMF publisher note contains an operative unit");
    if (unit.type === "element") {
      if (
        unit.columnCount !== undefined ||
        unit.columnStart !== undefined ||
        unit.columnSpan !== undefined ||
        ["table", "row", "cell", "line-break", "list-marker"].includes(
          unit.name,
        )
      )
        throw new Error("Unreviewed AMF content layout");
      if (unit.name === "list" && !unit.listStyle)
        throw new Error("AMF list requires its normalized style");
      for (const child of unit.children)
        visit(child, inheritedNote || unit.contentRole === "source-note");
    }
  };
  for (const unit of units) visit(unit, false);
  const projected = projectContentUnits(units);
  validateContentLayout(projected.orderedContent, projected.contentLayout);
}

export function validateAmfDocument(document: AmfDocument) {
  const version = document.source.sourceStatus.textAsOf;
  if (
    document.source.sourceVersion !== version ||
    document.source.canonicalUrl !==
      `${prefix}/${version.replaceAll("-", "")}/notes` ||
    document.source.contentUrl !== prefix ||
    document.sourceSnapshotId !==
      `snapshot:amf:fr-amf-rg:${document.source.sha256.slice(7)}` ||
    document.source.bytes === 0
  )
    throw new Error("AMF source identity and publisher version disagree");
  const groups = new Map(
    document.structuralNodes.map((node) => [node.logicalId, node]),
  );
  const ancestors = new Map<string, AmfDocument["structuralNodes"]>();
  const active = new Set<string>();
  const chain = (id: string): AmfDocument["structuralNodes"] => {
    const saved = ancestors.get(id);
    if (saved) return saved;
    const group = groups.get(id);
    if (!group || active.has(id))
      throw new Error("Invalid or cyclic AMF structure parent");
    active.add(id);
    const path = group.parentLogicalId
      ? [...chain(group.parentLogicalId), group]
      : [group];
    active.delete(id);
    ancestors.set(id, path);
    return path;
  };
  const orders = new Set<number>();
  const rootParents = new Set<string>();
  for (const group of document.structuralNodes) {
    sourceUrl(group.officialSourceUrl);
    if (
      !/^https:\/\/www\.amf-france\.org\/fr\/eli\/fr\/aai\/amf\/rg\/livre\/[1-7](?:\/(?:titre|chapitre|section|sous-section|paragraphe|sous-paragraphe)\/[0-9_]+)*\/notes$/u.test(
        group.officialSourceUrl,
      ) ||
      group.logicalId !== addressId("structure", group.officialSourceUrl) ||
      group.sourceLocator.kind !== "xpath"
    )
      throw new Error("Invalid AMF group address or identity");
    if (orders.has(group.displayOrder))
      throw new Error("Duplicate AMF source order");
    orders.add(group.displayOrder);
    chain(group.logicalId);
    if (group.parentLogicalId) {
      const parent = groups.get(group.parentLogicalId);
      if (
        !parent ||
        parentXPath(group.sourceLocator.value) !== parent.sourceLocator.value ||
        !group.officialSourceUrl.startsWith(
          `${parent.officialSourceUrl.slice(0, -6)}/`,
        ) ||
        parent.displayOrder >= group.displayOrder
      )
        throw new Error("AMF group parent disagrees with source hierarchy");
    } else {
      if (
        !/^https:\/\/www\.amf-france\.org\/fr\/eli\/fr\/aai\/amf\/rg\/livre\/[1-7]\/notes$/u.test(
          group.officialSourceUrl,
        )
      )
        throw new Error("AMF root group must identify a source book");
      rootParents.add(parentXPath(group.sourceLocator.value));
    }
  }
  if (rootParents.size !== 1)
    throw new Error("AMF books must share the source content root");
  const labels = new Set<string>();
  for (const provision of document.provisions) {
    sourceUrl(provision.officialSourceUrl);
    const parent =
      provision.parentLogicalId && groups.get(provision.parentLogicalId);
    const labelKey = provision.label
      .normalize("NFC")
      .replace(/\s+/gu, " ")
      .trim();
    if (
      !parent ||
      provision.kind !== "article" ||
      provision.contentRole !== "operative-text" ||
      provision.logicalId !==
        addressId("article", provision.officialSourceUrl) ||
      new URL(provision.rawHref, origin).href !== provision.officialSourceUrl ||
      !/^https:\/\/www\.amf-france\.org\/fr\/eli\/fr\/aai\/amf\/rg\/article\/\d{3}(?:-(?:\d+|[Aa]))+(?:-(?:bis|ter|quater))?\/\d{8}\/notes(?:-0)?$/u.test(
        provision.officialSourceUrl,
      ) ||
      !/^Article \d{3}(?:-(?:\d+|A))+(?: (?:bis|ter|quater))?$/u.test(
        labelKey,
      ) ||
      labels.has(labelKey) ||
      provision.sourceLocator.kind !== "xpath" ||
      parentXPath(provision.sourceLocator.value) !==
        parent.sourceLocator.value ||
      orders.has(provision.displayOrder) ||
      parent.displayOrder >= provision.displayOrder
    )
      throw new Error("Invalid AMF source article identity or ownership");
    labels.add(labelKey);
    orders.add(provision.displayOrder);
    const expectedPath = chain(parent.logicalId).map((node) => ({
      logicalId: node.logicalId,
      kind: node.kind,
      label: node.label,
    }));
    if (
      JSON.stringify(provision.structuralPath) !== JSON.stringify(expectedPath)
    )
      throw new Error("AMF structural path differs from actual ancestor chain");
    validateUnits(provision.orderedUnits);
    if (
      provision.text !==
      contentUnitsText(provision.orderedUnits, "operative-text")
    )
      throw new Error("AMF operative projection mismatch");
    for (const role of ["operative-text", "source-note", "toc"] as const)
      if (
        provision.roleHashes[role] !== unitsText(provision.orderedUnits, role)
      )
        throw new Error("AMF content role hash mismatch");
  }
  if ([...orders].sort((a, b) => a - b).some((order, index) => order !== index))
    throw new Error(
      "AMF groups and articles must share contiguous source order",
    );
  const seen = new Set<string>();
  let previousOwnerOrder = -2;
  for (const note of document.scopedSourceNotes) {
    const owner =
      note.scope === "structure" ? groups.get(note.ownerId) : undefined;
    const ownerOrder = owner?.displayOrder ?? -1;
    const key = `${note.ownerId}:${note.position}`;
    if (
      seen.has(key) ||
      ownerOrder <= previousOwnerOrder ||
      note.sourceLocator.kind !== "xpath" ||
      (note.scope === "document"
        ? note.ownerId !== document.logicalId ||
          note.ownerSourceUrl !== document.source.canonicalUrl ||
          note.position !== 2
        : !owner ||
          note.ownerSourceUrl !== owner.officialSourceUrl ||
          note.position !== 1)
    )
      throw new Error("Invalid AMF scoped note ownership or source order");
    const ownerXPath =
      owner?.sourceLocator.value ?? parentXPath(document.sourceLocator.value);
    if (
      note.sourceLocator.value !== `${ownerXPath}/*[${note.position + 1}]` ||
      note.orderedUnits.length !== 1 ||
      note.orderedUnits[0].sourceLocator.value !== note.sourceLocator.value
    )
      throw new Error(
        "AMF scoped note locator differs from its source position",
      );
    validateUnits(note.orderedUnits, "source-note");
    if (note.contentHash !== unitsText(note.orderedUnits, "source-note"))
      throw new Error("AMF scoped note content hash mismatch");
    seen.add(key);
    previousOwnerOrder = ownerOrder;
  }
}
