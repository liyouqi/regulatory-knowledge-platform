import type { CanonicalDocument } from "../canonical/schema";

export interface QualityDrift {
  kind: "count" | "warning-limit" | "text-hash";
  field: string;
  logicalId?: string;
  expected: number | string;
  actual: number | string | null;
}

interface QualityBaseline {
  maximumWarnings: number;
  textHashes: Record<string, string>;
}

interface QualityReport {
  warningCount: number;
}

export function compareQualityBaseline<
  Quality extends QualityBaseline,
  Report extends QualityReport,
>(
  document: CanonicalDocument,
  report: Report,
  quality: Quality | undefined,
): QualityDrift[] {
  if (!quality) return [];
  const drift: QualityDrift[] = [];

  for (const [field, expected] of Object.entries(quality)) {
    if (field === "maximumWarnings" || field === "textHashes") continue;
    if (typeof expected !== "number") continue;
    const value = (report as unknown as Record<string, unknown>)[field];
    const actual = typeof value === "number" ? value : null;
    if (actual !== expected) {
      drift.push({ kind: "count", field, expected, actual });
    }
  }

  if (report.warningCount > quality.maximumWarnings) {
    drift.push({
      kind: "warning-limit",
      field: "warningCount",
      expected: quality.maximumWarnings,
      actual: report.warningCount,
    });
  }

  const hashes = new Map(
    document.provisions.map((provision) => [
      provision.logicalId,
      provision.contentHash,
    ]),
  );
  for (const [logicalId, expected] of Object.entries(quality.textHashes)) {
    const actual = hashes.get(logicalId) ?? null;
    if (actual !== expected) {
      drift.push({
        kind: "text-hash",
        field: "textHashes",
        logicalId,
        expected,
        actual,
      });
    }
  }

  return drift;
}
