import { normalizeCelex } from "../canonical/ids";
import type { SourceDefinition } from "../ingestion/source-registry";

export const CONSOLIDATED_EXPRESSION_AUDIT_VERSION =
  "consolidated-expression-audit@1.0.0";

export interface ConsolidatedExpressionCandidate {
  celex: string;
  expressionCelex: string;
  effectiveDate: string;
}

export interface ConsolidatedExpressionAuditEntry {
  celex: string;
  selectedExpressionCelex: string;
  latestEffectiveExpressionCelex: string | null;
  latestEffectiveDate: string | null;
  status: "current" | "review-required" | "no-consolidated-expression";
  futureExpressionCount: number;
}

export function parseConsolidatedExpressionCandidatesFromTreeNotice(
  treeNoticeXml: string,
  baseCelex: string,
): ConsolidatedExpressionCandidate[] {
  const celex = normalizeCelex(baseCelex);
  const candidates = new Map<string, ConsolidatedExpressionCandidate>();
  for (const candidate of treeNoticeXml.matchAll(/0\d{4}[A-Z]\d{4}-\d{8}/gu)) {
    const expressionCelex = normalizeCelex(candidate[0]);
    const match = /^0(.+)-(\d{4})(\d{2})(\d{2})$/u.exec(expressionCelex);
    if (!match) continue;
    if (normalizeCelex(`3${match[1]}`) !== celex) continue;
    const effectiveDate = `${match[2]}-${match[3]}-${match[4]}`;
    if (Number.isNaN(Date.parse(`${effectiveDate}T00:00:00Z`))) continue;
    candidates.set(expressionCelex, {
      celex,
      expressionCelex,
      effectiveDate,
    });
  }
  return [...candidates.values()].sort((left, right) =>
    left.expressionCelex.localeCompare(right.expressionCelex),
  );
}

export function auditConsolidatedExpressions(
  sources: SourceDefinition[],
  candidates: ConsolidatedExpressionCandidate[],
  asOf: string,
): ConsolidatedExpressionAuditEntry[] {
  const candidatesByCelex = new Map<
    string,
    ConsolidatedExpressionCandidate[]
  >();
  for (const candidate of candidates) {
    const current = candidatesByCelex.get(candidate.celex) ?? [];
    current.push(candidate);
    candidatesByCelex.set(candidate.celex, current);
  }

  return sources
    .map((source): ConsolidatedExpressionAuditEntry => {
      const sourceCandidates = candidatesByCelex.get(source.celex) ?? [];
      const effective = sourceCandidates
        .filter((candidate) => candidate.effectiveDate <= asOf)
        .sort((left, right) =>
          right.effectiveDate.localeCompare(left.effectiveDate),
        );
      const latest = effective[0];
      const selectedExpressionCelex = source.expressionCelex ?? source.celex;
      return {
        celex: source.celex,
        selectedExpressionCelex,
        latestEffectiveExpressionCelex: latest?.expressionCelex ?? null,
        latestEffectiveDate: latest?.effectiveDate ?? null,
        status: latest
          ? latest.expressionCelex === selectedExpressionCelex
            ? "current"
            : "review-required"
          : "no-consolidated-expression",
        futureExpressionCount: sourceCandidates.filter(
          (candidate) => candidate.effectiveDate > asOf,
        ).length,
      };
    })
    .sort((left, right) => left.celex.localeCompare(right.celex));
}
