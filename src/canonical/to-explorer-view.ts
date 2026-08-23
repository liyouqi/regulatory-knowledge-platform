import type {
  DocumentView,
  ExplorerDocument,
  ExplorerNode,
  TocNode,
} from "../shared/legal";
import { relativeProvisionAnchor } from "./ids";

export function toExplorerView(document: DocumentView): ExplorerDocument {
  const provisions = new Map(
    document.provisions.map((provision) => [provision.id, provision]),
  );
  const mapNode = (node: TocNode): ExplorerNode => {
    const provision = node.provisionId
      ? provisions.get(node.provisionId)
      : undefined;
    return {
      id: node.id,
      type: provision ? "article" : "group",
      kind: node.kind,
      label: node.label,
      title: node.title,
      range: node.range,
      anchor:
        provision?.explorerAnchor ??
        relativeProvisionAnchor(document.id, node.id),
      readerPath: provision?.path,
      children: node.children.map(mapNode),
    };
  };
  const count = (collectionId: "annexes" | "articles" | "recitals") =>
    document.collections.find((collection) => collection.id === collectionId)
      ?.count ?? 0;
  const articleCollection = document.collections.find(
    (collection) => collection.id === "articles",
  );

  return {
    id: document.id,
    slug: document.slug,
    celex: document.celex,
    shortName: document.shortName,
    officialTitle: document.officialTitle,
    documentType: document.documentType,
    sourceUrl: document.sourceUrl,
    asOf: document.asOf,
    lastChecked: document.lastChecked,
    buildId: document.buildId,
    articleCount: count("articles"),
    recitalCount: count("recitals"),
    annexCount: count("annexes"),
    roots: (articleCollection?.roots ?? []).map(mapNode),
  };
}
