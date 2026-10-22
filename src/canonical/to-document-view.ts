import { contentUnitsText, projectContentUnits } from "../shared/content-unit";
import type {
  BodyBlock,
  CollectionId,
  DocumentView,
  ProvisionView,
  TocNode,
} from "../shared/legal";
import { provisionPath } from "../shared/reader-route";
import { relativeProvisionAnchor } from "./ids";
import type { CanonicalDocument, CanonicalResource, Provision } from "./schema";

const collectionForKind = {
  article: "articles",
  recital: "recitals",
  annex: "annexes",
  other: "provisions",
} as const;

function documentSlug(shortName: string): string {
  return shortName
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}

function childMap(document: CanonicalDocument): Map<string, Provision[]> {
  const children = new Map<string, Provision[]>();
  for (const provision of document.provisions) {
    if (!provision.parentLogicalId) continue;
    const siblings = children.get(provision.parentLogicalId) ?? [];
    siblings.push(provision);
    children.set(provision.parentLogicalId, siblings);
  }
  for (const siblings of children.values()) {
    siblings.sort((left, right) => left.displayOrder - right.displayOrder);
  }
  return children;
}

function bodyKind(provision: Provision): BodyBlock["kind"] {
  return [
    "paragraph",
    "subparagraph",
    "point",
    "subpoint",
    "recital",
    "annex",
    "annex-part",
  ].includes(provision.kind)
    ? (provision.kind as BodyBlock["kind"])
    : "other";
}

function orderedContent(
  provision: Provision,
  children: Provision[],
  resources: ReadonlyMap<string, CanonicalResource>,
): BodyBlock["orderedContent"] {
  if (provision.orderedContent) {
    const expectedChildren = children.map((child) => child.logicalId);
    const referencedChildren = provision.orderedContent.flatMap((entry) =>
      entry.type === "child" ? [entry.childLogicalId] : [],
    );
    if (
      referencedChildren.length !== expectedChildren.length ||
      referencedChildren.some(
        (childId, index) => childId !== expectedChildren[index],
      )
    ) {
      throw new Error(
        `Canonical ordered content child mismatch for ${provision.logicalId}`,
      );
    }
    return provision.orderedContent.map((entry) => {
      if (entry.type === "text") return entry;
      if (entry.type === "child") {
        return { type: "child" as const, childId: entry.childLogicalId };
      }
      const resource = resources.get(entry.resourceId);
      if (!resource) {
        throw new Error(
          `Canonical ordered content references missing resource ${entry.resourceId}`,
        );
      }
      return {
        type: "resource" as const,
        resource: {
          id: resource.id,
          kind: resource.kind,
          mediaType: resource.mediaType,
          dataUrl: `data:${resource.mediaType};base64,${resource.dataBase64}`,
          sourceFileName: resource.sourceFileName,
          sourceSha256: resource.sourceSha256,
          renditionSha256: resource.renditionSha256,
        },
      };
    });
  }
  if (children.length === 0) {
    return provision.text.trim()
      ? [{ type: "text", text: provision.text.trim() }]
      : [];
  }

  const childTextsIncluded = children.map((child) =>
    provision.text.includes(child.text.trim()),
  );
  if (childTextsIncluded.every((included) => !included)) {
    return [
      ...(provision.text.trim()
        ? [{ type: "text" as const, text: provision.text.trim() }]
        : []),
      ...children.map((child) => ({
        type: "child" as const,
        childId: child.logicalId,
      })),
    ];
  }
  if (childTextsIncluded.some((included) => !included)) {
    throw new Error(
      `Cannot preserve ordered content for ${provision.logicalId}: canonical text contains only some child texts`,
    );
  }

  const content: BodyBlock["orderedContent"] = [];
  let cursor = 0;
  for (const child of children) {
    const childText = child.text.trim();
    const childIndex = provision.text.indexOf(childText, cursor);
    if (childIndex < 0) {
      throw new Error(
        `Cannot preserve ordered content for ${provision.logicalId}: child ${child.logicalId} is not present after offset ${cursor}`,
      );
    }
    const leadingText = provision.text.slice(cursor, childIndex).trim();
    if (leadingText) content.push({ type: "text", text: leadingText });
    content.push({ type: "child", childId: child.logicalId });
    cursor = childIndex + childText.length;
  }
  const trailingText = provision.text.slice(cursor).trim();
  if (trailingText) content.push({ type: "text", text: trailingText });

  const reconstructed = content
    .map((item) =>
      item.type === "text"
        ? item.text
        : item.type === "child"
          ? children.find((child) => child.logicalId === item.childId)?.text
          : undefined,
    )
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();
  const expected = provision.text.replace(/\s+/gu, " ").trim();
  if (reconstructed !== expected) {
    throw new Error(
      `Ordered content reconstruction drift for ${provision.logicalId}`,
    );
  }
  return content;
}

function toBodyBlock(
  provision: Provision,
  rootId: string,
  children: Map<string, Provision[]>,
  resources: ReadonlyMap<string, CanonicalResource>,
): BodyBlock {
  const nested = (children.get(provision.logicalId) ?? []).map((child) =>
    toBodyBlock(child, rootId, children, resources),
  );
  const directChildren = children.get(provision.logicalId) ?? [];
  const marker = [
    "annex-part",
    "paragraph",
    "point",
    "subpoint",
    "table",
  ].includes(provision.kind)
    ? provision.kind === "paragraph"
      ? provision.numberRaw
      : provision.label
    : undefined;
  const structured = provision.orderedUnits
    ? projectContentUnits(provision.orderedUnits)
    : undefined;
  return {
    ...(provision.contentRole ? { contentRole: provision.contentRole } : {}),
    ...(structured ? { contentLayout: structured.contentLayout } : {}),
    id: provision.logicalId,
    kind: bodyKind(provision),
    marker,
    text:
      nested.length > 0
        ? (provision.leadText ?? provision.text)
        : provision.text,
    anchor: relativeProvisionAnchor(rootId, provision.logicalId),
    sourceLocator: provision.sourceLocator,
    orderedContent:
      structured?.orderedContent ??
      orderedContent(provision, directChildren, resources),
    children: nested,
  };
}

function provisionTocNode(provision: ProvisionView): TocNode {
  return {
    id: provision.id,
    type: "provision",
    kind: provision.kind,
    label: provision.label,
    title: provision.title,
    provisionId: provision.id,
    children: [],
  };
}

function articleRange(nodes: TocNode[], byId: Map<string, ProvisionView>) {
  const numbers: string[] = [];
  const visit = (node: TocNode) => {
    if (node.provisionId) {
      const provision = byId.get(node.provisionId);
      if (provision?.kind === "article") numbers.push(provision.number);
    }
    node.children.forEach(visit);
  };
  nodes.forEach(visit);
  if (numbers.length === 0) return undefined;
  return numbers.length === 1
    ? `Art. ${numbers[0]}`
    : `Art. ${numbers[0]}–${numbers.at(-1)}`;
}

function structuredToc(
  document: CanonicalDocument,
  provisions: ProvisionView[],
  provisionKind: "article" | "other",
): TocNode[] {
  const byId = new Map(
    provisions.map((provision) => [provision.id, provision]),
  );
  const canonicalById = new Map(
    document.provisions.map((provision) => [provision.logicalId, provision]),
  );
  const structuralByParent = new Map<
    string,
    CanonicalDocument["structuralNodes"]
  >();
  for (const node of document.structuralNodes) {
    const parentId = node.parentLogicalId ?? document.logicalId;
    const siblings = structuralByParent.get(parentId) ?? [];
    siblings.push(node);
    structuralByParent.set(parentId, siblings);
  }

  const provisionsByParent = new Map<string, ProvisionView[]>();
  for (const provision of provisions.filter(
    (candidate) => candidate.kind === provisionKind,
  )) {
    const parentId =
      canonicalById.get(provision.id)?.parentLogicalId ?? document.logicalId;
    const siblings = provisionsByParent.get(parentId) ?? [];
    siblings.push(provision);
    provisionsByParent.set(parentId, siblings);
  }

  function childrenOf(parentId: string): TocNode[] {
    const groups = (structuralByParent.get(parentId) ?? []).map((node) => {
      const children = childrenOf(node.logicalId);
      return {
        id: node.logicalId,
        type: "group" as const,
        kind: node.kind,
        label: node.label,
        title: node.title,
        range: articleRange(children, byId),
        children,
        displayOrder: node.displayOrder,
      };
    });
    const directProvisions = (provisionsByParent.get(parentId) ?? []).map(
      (provision) => ({
        ...provisionTocNode(provision),
        displayOrder: canonicalById.get(provision.id)?.displayOrder ?? 0,
      }),
    );
    return [...groups, ...directProvisions]
      .filter(
        (node) =>
          document.schemaVersion === "1.5.0" ||
          node.type === "provision" ||
          node.children.length > 0,
      )
      .sort((left, right) => left.displayOrder - right.displayOrder)
      .map(({ displayOrder: _displayOrder, ...node }) => node);
  }

  return childrenOf(document.logicalId);
}

export function toDocumentView(
  document: CanonicalDocument,
  buildId: string,
): DocumentView {
  const slug = documentSlug(document.shortName);
  const children = childMap(document);
  const resources = new Map(
    (document.resources ?? []).map((resource) => [resource.id, resource]),
  );
  const structuralById = new Map(
    document.structuralNodes.map((node) => [node.logicalId, node]),
  );
  const structuralIds = new Set(structuralById.keys());
  const topLevel = document.provisions
    .filter(
      (provision) =>
        ["article", "recital", "annex"].includes(provision.kind) ||
        (["other", "paragraph"].includes(provision.kind) &&
          (!provision.parentLogicalId ||
            structuralIds.has(provision.parentLogicalId))),
    )
    .sort((left, right) => {
      const kindOrder = {
        article: 0,
        recital: 1,
        annex: 2,
        other: 3,
        paragraph: 3,
      } as const;
      const kindDifference =
        kindOrder[left.kind as keyof typeof kindOrder] -
        kindOrder[right.kind as keyof typeof kindOrder];
      return kindDifference || left.displayOrder - right.displayOrder;
    });
  const routeKeyCounts = new Map<string, number>();
  for (const provision of topLevel) {
    const kind = ["article", "recital", "annex"].includes(provision.kind)
      ? (provision.kind as "article" | "recital" | "annex")
      : "other";
    const collectionId = collectionForKind[kind];
    const number =
      provision.numberNormalized ?? provision.numberRaw ?? provision.label;
    const key = `${collectionId}:${number.toLowerCase()}`;
    routeKeyCounts.set(key, (routeKeyCounts.get(key) ?? 0) + 1);
  }
  const provisions: ProvisionView[] = topLevel.map((provision) => {
    const kind = ["article", "recital", "annex"].includes(provision.kind)
      ? (provision.kind as "article" | "recital" | "annex")
      : "other";
    const collectionId = collectionForKind[kind];
    const directChildren = children.get(provision.logicalId) ?? [];
    const blockSources =
      directChildren.length > 0 ? directChildren : [provision];
    const sourceNumber =
      provision.numberNormalized ?? provision.numberRaw ?? provision.label;
    const routeKey = `${collectionId}:${sourceNumber.toLowerCase()}`;
    const number =
      (routeKeyCounts.get(routeKey) ?? 0) > 1
        ? relativeProvisionAnchor(document.logicalId, provision.logicalId)
        : sourceNumber;
    return {
      ...("officialSourceUrl" in provision &&
      typeof provision.officialSourceUrl === "string"
        ? { officialSourceUrl: provision.officialSourceUrl }
        : {}),
      ...((provision as Provision).contentRole
        ? { contentRole: (provision as Provision).contentRole }
        : {}),
      id: provision.logicalId,
      kind,
      collectionId,
      number,
      label: provision.label,
      title: provision.title,
      path: provisionPath(slug, collectionId, number),
      explorerAnchor: relativeProvisionAnchor(
        document.logicalId,
        provision.logicalId,
      ),
      sourceLocator: provision.sourceLocator,
      breadcrumbs: provision.structuralPath.map((entry) => ({
        id: entry.logicalId,
        kind: entry.kind,
        label: entry.label,
        title: structuralById.get(entry.logicalId)?.title,
      })),
      blocks: blockSources.map((block) =>
        toBodyBlock(block, provision.logicalId, children, resources),
      ),
    };
  });

  for (const collectionId of [
    "articles",
    "recitals",
    "annexes",
    "provisions",
  ] as const) {
    const inCollection = provisions.filter(
      (provision) => provision.collectionId === collectionId,
    );
    inCollection.forEach((provision, index) => {
      provision.previousId = inCollection[index - 1]?.id;
      provision.nextId = inCollection[index + 1]?.id;
    });
  }

  const collectionDefinitions: Array<{
    id: CollectionId;
    label: string;
  }> = [
    { id: "articles", label: "Articles" },
    { id: "recitals", label: "Recitals" },
    { id: "annexes", label: "Annexes" },
    { id: "provisions", label: "Provisions" },
  ];
  const collections = collectionDefinitions
    .map(({ id, label }) => {
      const inCollection = provisions.filter(
        (provision) => provision.collectionId === id,
      );
      return {
        id,
        label,
        count: inCollection.length,
        roots:
          id === "articles"
            ? structuredToc(document, provisions, "article")
            : id === "provisions"
              ? structuredToc(document, provisions, "other")
              : inCollection.map(provisionTocNode),
      };
    })
    .filter((collection) => collection.count > 0);

  return {
    id: document.logicalId,
    jurisdiction: document.jurisdiction,
    ...(document.schemaVersion === "1.5.0"
      ? { language: "fr" as const }
      : document.language === "de"
        ? { language: "de" as const }
        : {}),
    slug,
    celex: document.identifiers.celex,
    localId: document.identifiers.localId,
    shortName: document.shortName,
    officialTitle: document.officialTitle,
    documentType: document.documentType,
    sourceUrl: document.source.canonicalUrl,
    sourceSnapshotId: document.sourceSnapshotId,
    asOf:
      document.schemaVersion === "1.5.0"
        ? document.source.sourceStatus.textAsOf
        : document.publicationDate,
    lastChecked:
      document.schemaVersion === "1.5.0"
        ? document.source.sourceStatus.checkedAt
        : document.source.retrievedAt,
    sourceVersion: document.source.sourceVersion,
    sourceStatus: document.source.sourceStatus,
    buildId,
    provenance: document.source.provenance,
    collections,
    provisions,
    ...(document.schemaVersion === "1.5.0"
      ? {
          publicationDate: document.publicationDate,
          publicationDateBasis: document.publicationDateBasis,
          sourceAcquisition: {
            retrievedAt: document.source.retrievedAt,
            importedAt: document.source.importedAt,
            capturedOn: document.source.capturedOn,
            captureDateBasis: document.source.captureDateBasis,
            retrievalTimestampBasis: document.source.retrievalTimestampBasis,
          },
          scopedSourceNotes: document.scopedSourceNotes.map((note, index) => {
            const projected = projectContentUnits(note.orderedUnits);
            return {
              scope: note.scope,
              ownerId: note.ownerId,
              ownerSourceUrl: note.ownerSourceUrl,
              ownerLabel:
                note.scope === "document"
                  ? document.officialTitle
                  : (structuralById.get(note.ownerId)?.label ?? ""),
              position: note.position,
              contentHash: note.contentHash,
              block: {
                id: `publisher-note:${note.ownerId}:${note.position}`,
                kind: "other" as const,
                contentRole: "source-note" as const,
                text: contentUnitsText(note.orderedUnits, "source-note"),
                anchor: `publisher-note-${index}`,
                sourceLocator: note.sourceLocator,
                orderedContent: projected.orderedContent,
                contentLayout: projected.contentLayout,
                children: [],
              },
            };
          }),
        }
      : {}),
  };
}
