import type { CollectionId } from "./legal";

export interface ReaderSelection {
  slug: string;
  collectionId: CollectionId;
  number: string;
}

export function provisionPath(
  slug: string,
  collectionId: CollectionId,
  number: string,
): string {
  return `/read/${encodeURIComponent(slug)}/${collectionId}/${encodeURIComponent(number)}`;
}

export function parseReaderPath(pathname: string): ReaderSelection | null {
  const match =
    /^\/read\/([^/]+)\/(articles|recitals|annexes)\/([^/]+)\/?$/u.exec(
      pathname,
    );
  if (!match) return null;
  return {
    slug: decodeURIComponent(match[1]),
    collectionId: match[2] as CollectionId,
    number: decodeURIComponent(match[3]).toLowerCase(),
  };
}

export function parseQuickGo(value: string): {
  collectionId: CollectionId;
  number: string;
} | null {
  const normalized = value.trim().toLowerCase();
  const explicit =
    /^(art(?:icle)?|rec(?:ital)?|annex)\s*\.?\s*([0-9]+[a-z]?|[ivxlcdm]+)$/u.exec(
      normalized,
    );
  if (explicit) {
    const collectionId = explicit[1].startsWith("art")
      ? "articles"
      : explicit[1].startsWith("rec")
        ? "recitals"
        : "annexes";
    return { collectionId, number: explicit[2] };
  }
  if (/^[0-9]+[a-z]?$/u.test(normalized)) {
    return { collectionId: "articles", number: normalized };
  }
  return null;
}
