import type { ProvisionRelationship } from "../shared/legal";

export interface InlineReferenceRange {
  relationship: ProvisionRelationship;
  start: number;
  end: number;
}

const LOCATOR_PATTERN = /^(.*):text:(\d+)-(\d+)$/u;

export function inlineReferenceRanges(
  text: string,
  sourceEntityId: string,
  relationships: ProvisionRelationship[],
): InlineReferenceRange[] {
  const candidates = relationships
    .flatMap((relationship) => {
      if (relationship.source.entityId !== sourceEntityId) return [];
      const match = relationship.evidence.locator.match(LOCATOR_PATTERN);
      if (match?.[1] !== sourceEntityId) return [];
      const start = Number.parseInt(match[2] ?? "", 10);
      const end = Number.parseInt(match[3] ?? "", 10);
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 0 ||
        end <= start ||
        end > text.length ||
        text.slice(start, end) !== relationship.evidence.text
      ) {
        return [];
      }
      return [{ relationship, start, end }];
    })
    .sort((left, right) => left.start - right.start || left.end - right.end);

  const ranges: InlineReferenceRange[] = [];
  for (const candidate of candidates) {
    const previous = ranges.at(-1);
    if (previous && candidate.start < previous.end) continue;
    ranges.push(candidate);
  }
  return ranges;
}
