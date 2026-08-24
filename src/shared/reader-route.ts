import type { CollectionId } from "./legal";

export interface ReaderSelection {
  slug: string;
  collectionId: CollectionId;
  number: string;
}

export type RelationshipGraphSelection =
  | ({ scope: "provision" } & ReaderSelection)
  | { scope: "document"; slug: string };

export function explorerPath(slug: string): string {
  return `/explore/${encodeURIComponent(slug)}`;
}

export function parseExplorerPath(pathname: string): { slug: string } | null {
  const match = /^\/explore\/([^/]+)\/?$/u.exec(pathname);
  return match ? { slug: decodeURIComponent(match[1]) } : null;
}

export function level2LibraryPath(
  familySlug: string,
  measureType?: "rts" | "its",
): string {
  return measureType
    ? `/library/${encodeURIComponent(familySlug)}/${measureType}`
    : `/library/${encodeURIComponent(familySlug)}`;
}

export function parseLevel2LibraryPath(
  pathname: string,
): { familySlug: string; measureType?: "rts" | "its" } | null {
  const match = /^\/library\/([^/]+)(?:\/(rts|its))?\/?$/u.exec(pathname);
  if (!match) return null;
  return {
    familySlug: decodeURIComponent(match[1]),
    measureType: match[2] as "rts" | "its" | undefined,
  };
}

export function provisionPath(
  slug: string,
  collectionId: CollectionId,
  number: string,
): string {
  return `/read/${encodeURIComponent(slug)}/${collectionId}/${encodeURIComponent(number)}`;
}

export function relationshipGraphPath(
  slug: string,
  collectionId: CollectionId,
  number: string,
): string {
  return `/relationships/${encodeURIComponent(slug)}/${collectionId}/${encodeURIComponent(number)}`;
}

export function documentRelationshipGraphPath(slug: string): string {
  return `/relationships/${encodeURIComponent(slug)}`;
}

export function parseRelationshipGraphPath(
  pathname: string,
): RelationshipGraphSelection | null {
  const match =
    /^\/relationships\/([^/]+)\/(articles|recitals|annexes|provisions)\/([^/]+)\/?$/u.exec(
      pathname,
    );
  if (match) {
    return {
      scope: "provision",
      slug: decodeURIComponent(match[1]),
      collectionId: match[2] as CollectionId,
      number: decodeURIComponent(match[3]).toLowerCase(),
    };
  }
  const documentMatch = /^\/relationships\/([^/]+)\/?$/u.exec(pathname);
  return documentMatch
    ? { scope: "document", slug: decodeURIComponent(documentMatch[1]) }
    : null;
}

export function parseReaderPath(pathname: string): ReaderSelection | null {
  const match =
    /^\/read\/([^/]+)\/(articles|recitals|annexes|provisions)\/([^/]+)\/?$/u.exec(
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
