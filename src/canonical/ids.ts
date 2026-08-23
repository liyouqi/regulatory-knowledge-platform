const CELEX_PATTERN = /^[0-9][0-9A-Z()_-]{4,39}$/;
const SAFE_SEGMENT_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

export type ProvisionIdKind =
  | "annex"
  | "annex-part"
  | "article"
  | "paragraph"
  | "point"
  | "recital"
  | "subparagraph"
  | "subpoint"
  | "table";

export type StructuralIdKind =
  | "chapter"
  | "division"
  | "part"
  | "section"
  | "subsection"
  | "title";

export function normalizeCelex(value: string): string {
  const normalized = value.trim().toUpperCase();

  if (!CELEX_PATTERN.test(normalized)) {
    throw new Error(`Invalid CELEX identifier: ${value}`);
  }

  return normalized;
}

export function normalizeLegalNumber(value: string): string {
  const normalized = value
    .normalize("NFKC")
    .trim()
    .replace(/^\((.*)\)$/u, "$1")
    .replace(/^\(/u, "")
    .replace(/[.)]+$/u, "")
    .replace(/\s+/gu, "-")
    .toLowerCase();
  const arabicWithSuffix = /^(\d+)([a-z]*)$/u.exec(normalized);

  if (arabicWithSuffix) {
    const number = String(Number.parseInt(arabicWithSuffix[1], 10));
    return `${number}${arabicWithSuffix[2]}`;
  }

  if (!SAFE_SEGMENT_PATTERN.test(normalized)) {
    throw new Error(`Invalid legal number: ${value}`);
  }

  return normalized;
}

export function documentLogicalId(celex: string): string {
  return `eu:${normalizeCelex(celex)}`;
}

export function provisionLogicalId(
  parentId: string,
  kind: ProvisionIdKind,
  number: string,
  occurrence = 1,
): string {
  if (!Number.isSafeInteger(occurrence) || occurrence < 1) {
    throw new Error("Occurrence must be a positive integer");
  }

  const base = `${parentId}:${kind}:${normalizeLegalNumber(number)}`;
  return occurrence === 1 ? base : `${base}:occurrence:${occurrence}`;
}

export function structuralLogicalId(
  parentId: string,
  kind: StructuralIdKind,
  number: string,
  occurrence = 1,
): string {
  if (!Number.isSafeInteger(occurrence) || occurrence < 1) {
    throw new Error("Occurrence must be a positive integer");
  }
  const base = `${parentId}:${kind}:${normalizeLegalNumber(number)}`;
  return occurrence === 1 ? base : `${base}:occurrence:${occurrence}`;
}

export function sourceVersionId(
  logicalId: string,
  sourceVersion: string,
): string {
  const normalizedVersion = sourceVersion.normalize("NFKC").trim();

  if (!normalizedVersion || /[\s@]/u.test(normalizedVersion)) {
    throw new Error(`Invalid source version: ${sourceVersion}`);
  }

  return `${logicalId}@${normalizedVersion}`;
}

export function domAnchor(logicalId: string): string {
  return `legal-${encodeURIComponent(logicalId).replaceAll("%", "-")}`;
}

export function relativeProvisionAnchor(
  rootProvisionId: string,
  targetProvisionId: string,
): string {
  const prefix = `${rootProvisionId}:`;
  if (!targetProvisionId.startsWith(prefix))
    return domAnchor(targetProvisionId);
  return targetProvisionId.slice(prefix.length).replaceAll(":", "-");
}
