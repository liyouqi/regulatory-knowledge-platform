import type {
  BodyBlock,
  CollectionId,
  DocumentView,
  ProvisionView,
  TocNode,
} from "../shared/legal";
import { provisionPath } from "../shared/reader-route";
import { relativeProvisionAnchor } from "./ids";
import type { CanonicalDocument, Provision } from "./schema";

const collectionForKind = {
  article: "articles",
  recital: "recitals",
  annex: "annexes",
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

function toBodyBlock(
  provision: Provision,
  rootId: string,
  children: Map<string, Provision[]>,
): BodyBlock {
  const nested = (children.get(provision.logicalId) ?? []).map((child) =>
    toBodyBlock(child, rootId, children),
  );
  const marker = ["annex-part", "paragraph", "point", "subpoint"].includes(
    provision.kind,
  )
    ? provision.kind === "paragraph"
      ? provision.numberRaw
      : provision.label
    : undefined;
  return {
    id: provision.logicalId,
    kind: bodyKind(provision),
    marker,
    text:
      nested.length > 0
        ? (provision.leadText ?? provision.text)
        : provision.text,
    anchor: relativeProvisionAnchor(rootId, provision.logicalId),
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

function articleToc(
  document: CanonicalDocument,
  provisions: ProvisionView[],
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

  const articlesByParent = new Map<string, ProvisionView[]>();
  for (const provision of provisions.filter(
    (candidate) => candidate.kind === "article",
  )) {
    const parentId =
      canonicalById.get(provision.id)?.parentLogicalId ?? document.logicalId;
    const siblings = articlesByParent.get(parentId) ?? [];
    siblings.push(provision);
    articlesByParent.set(parentId, siblings);
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
    const articles = (articlesByParent.get(parentId) ?? []).map(
      (provision) => ({
        ...provisionTocNode(provision),
        displayOrder: canonicalById.get(provision.id)?.displayOrder ?? 0,
      }),
    );
    return [...groups, ...articles]
      .filter((node) => node.type === "provision" || node.children.length > 0)
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
  const structuralById = new Map(
    document.structuralNodes.map((node) => [node.logicalId, node]),
  );
  const topLevel = document.provisions
    .filter((provision) =>
      ["article", "recital", "annex"].includes(provision.kind),
    )
    .sort((left, right) => {
      const kindOrder = { article: 0, recital: 1, annex: 2 } as const;
      const kindDifference =
        kindOrder[left.kind as keyof typeof kindOrder] -
        kindOrder[right.kind as keyof typeof kindOrder];
      return kindDifference || left.displayOrder - right.displayOrder;
    });
  const provisions: ProvisionView[] = topLevel.map((provision) => {
    const kind =
      provision.kind === "recital" || provision.kind === "annex"
        ? provision.kind
        : "article";
    const collectionId = collectionForKind[kind];
    const directChildren = children.get(provision.logicalId) ?? [];
    const blockSources =
      directChildren.length > 0 ? directChildren : [provision];
    return {
      id: provision.logicalId,
      kind,
      collectionId,
      number:
        provision.numberNormalized ?? provision.numberRaw ?? provision.label,
      label: provision.label,
      title: provision.title,
      path: provisionPath(
        slug,
        collectionId,
        provision.numberNormalized ?? provision.numberRaw ?? provision.label,
      ),
      breadcrumbs: provision.structuralPath.map((entry) => ({
        id: entry.logicalId,
        kind: entry.kind,
        label: entry.label,
        title: structuralById.get(entry.logicalId)?.title,
      })),
      blocks: blockSources.map((block) =>
        toBodyBlock(block, provision.logicalId, children),
      ),
    };
  });

  for (const collectionId of ["articles", "recitals", "annexes"] as const) {
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
            ? articleToc(document, provisions)
            : inCollection.map(provisionTocNode),
      };
    })
    .filter((collection) => collection.count > 0);

  return {
    id: document.logicalId,
    slug,
    celex: document.identifiers.celex ?? "Not applicable",
    shortName: document.shortName,
    officialTitle: document.officialTitle,
    documentType: document.documentType,
    sourceUrl: document.source.canonicalUrl,
    asOf: document.publicationDate,
    lastChecked: document.source.retrievedAt,
    sourceVersion: document.source.sourceVersion,
    buildId,
    provenance: document.source.provenance,
    collections,
    provisions,
  };
}
