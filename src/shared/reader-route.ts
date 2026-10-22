import type { CollectionId } from "./legal";

export interface ReaderSelection {
  slug: string;
  collectionId: CollectionId;
  number: string;
}

export type RelationshipGraphSelection =
  | ({ scope: "provision" } & ReaderSelection)
  | { scope: "document"; slug: string }
  | { scope: "global" };

export const level2MandateQueryPath = () =>
  "/relationship-queries/level-2-mandates";

export function isLevel2MandateQueryPath(pathname: string): boolean {
  return /^\/relationship-queries\/level-2-mandates\/?$/u.test(pathname);
}

export function implementationTimelinePath(slug: string): string {
  return `/timelines/${encodeURIComponent(slug)}`;
}

export function parseImplementationTimelinePath(
  pathname: string,
): { slug: string } | null {
  const match = /^\/timelines\/([^/]+)\/?$/u.exec(pathname);
  return match ? { slug: decodeURIComponent(match[1]) } : null;
}

export function supervisoryDecisionsPath(slug: string): string {
  return `/decisions/${encodeURIComponent(slug)}`;
}

export function parseSupervisoryDecisionsPath(
  pathname: string,
): { slug: string } | null {
  const match = /^\/decisions\/([^/]+)\/?$/u.exec(pathname);
  return match ? { slug: decodeURIComponent(match[1]) } : null;
}

export function regulatoryDomainPath(domainSlug: string): string {
  return `/domains/${encodeURIComponent(domainSlug)}`;
}

export function parseRegulatoryDomainPath(
  pathname: string,
): { domainSlug: string } | null {
  const match = /^\/domains\/([^/]+)\/?$/u.exec(pathname);
  return match ? { domainSlug: decodeURIComponent(match[1]) } : null;
}

export function applicabilityPath(slug: string): string {
  return `/applicability/${encodeURIComponent(slug)}`;
}

export function parseApplicabilityPath(
  pathname: string,
): { slug: string } | null {
  const match = /^\/applicability\/([^/]+)\/?$/u.exec(pathname);
  return match ? { slug: decodeURIComponent(match[1]) } : null;
}

export function topicCatalogPath(): string {
  return "/topics";
}

export function ebaQaCatalogPath(): string {
  return "/qa";
}

export function ebaQaDetailPath(publicId: string): string {
  return `/qa/eba/${encodeURIComponent(publicId)}`;
}

export function dossierCatalogPath(): string {
  return "/dossiers";
}

export function dossierDetailPath(slug: string): string {
  return `/dossiers/${encodeURIComponent(slug)}`;
}

export function parseDossierPath(
  pathname: string,
): { scope: "catalog" } | { scope: "detail"; slug: string } | null {
  if (/^\/dossiers\/?$/u.test(pathname)) return { scope: "catalog" };
  const match = /^\/dossiers\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/u.exec(pathname);
  return match ? { scope: "detail", slug: match[1] } : null;
}

export function parseEbaQaPath(
  pathname: string,
): { scope: "catalog" } | { scope: "detail"; publicId: string } | null {
  if (/^\/qa\/?$/u.test(pathname)) return { scope: "catalog" };
  const match = /^\/qa\/eba\/(\d{4}_\d+)\/?$/u.exec(pathname);
  return match ? { scope: "detail", publicId: match[1] } : null;
}

export function regulatoryTopicPath(slug: string): string {
  return `/topics/${encodeURIComponent(slug)}`;
}

export function parseRegulatoryTopicPath(
  pathname: string,
): { scope: "catalog" } | { scope: "topic"; slug: string } | null {
  if (/^\/topics\/?$/u.test(pathname)) return { scope: "catalog" };
  const match = /^\/topics\/([^/]+)\/?$/u.exec(pathname);
  return match ? { scope: "topic", slug: decodeURIComponent(match[1]) } : null;
}

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

export function globalRelationshipGraphPath(): string {
  return "/relationships";
}

export function parseRelationshipGraphPath(
  pathname: string,
): RelationshipGraphSelection | null {
  if (/^\/relationships\/?$/u.test(pathname)) return { scope: "global" };
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

export function countryPath(code?: string): string {
  return code
    ? `/countries/${encodeURIComponent(code.toLowerCase())}`
    : "/countries";
}

export function parseCountryPath(pathname: string): { code?: string } | null {
  if (/^\/countries\/?$/u.test(pathname)) return {};
  const match = /^\/countries\/([a-z]{2})\/?$/iu.exec(pathname);
  return match ? { code: match[1].toLowerCase() } : null;
}
