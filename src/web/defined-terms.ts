import type { DefinitionSearchResult } from "../shared/legal";

export interface DefinedTermRange {
  definition: DefinitionSearchResult;
  start: number;
  end: number;
}

interface ExcludedRange {
  start: number;
  end: number;
}

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function overlaps(
  left: { start: number; end: number },
  right: { start: number; end: number },
): boolean {
  return left.start < right.end && right.start < left.end;
}

export function definedTermRanges(
  text: string,
  definitions: DefinitionSearchResult[],
  excludedRanges: ExcludedRange[] = [],
): DefinedTermRange[] {
  const definitionsByTerm = new Map<string, DefinitionSearchResult[]>();
  for (const definition of definitions) {
    const current = definitionsByTerm.get(definition.normalizedTerm) ?? [];
    current.push(definition);
    definitionsByTerm.set(definition.normalizedTerm, current);
  }

  const candidates = [...definitionsByTerm.values()]
    .filter((matches) => matches.length === 1)
    .flatMap((matches) => {
      const definition = matches[0];
      if (!definition || !/[\p{L}\p{N}]/u.test(definition.term)) return [];
      const pattern = new RegExp(
        `(?<![\\p{L}\\p{M}\\p{N}_'’])${escapePattern(definition.term)}(?![\\p{L}\\p{M}\\p{N}_'’])`,
        "giu",
      );
      return [...text.matchAll(pattern)].map((match) => ({
        definition,
        start: match.index,
        end: match.index + match[0].length,
      }));
    })
    .filter(
      (candidate) =>
        !excludedRanges.some((excluded) => overlaps(candidate, excluded)),
    )
    .sort(
      (left, right) =>
        left.start - right.start ||
        right.end - right.start - (left.end - left.start) ||
        left.definition.id.localeCompare(right.definition.id),
    );

  const accepted: DefinedTermRange[] = [];
  for (const candidate of candidates) {
    if (accepted.some((range) => overlaps(candidate, range))) continue;
    accepted.push(candidate);
  }
  return accepted.sort((left, right) => left.start - right.start);
}
