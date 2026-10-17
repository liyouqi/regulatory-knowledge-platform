import type {
  CitationContext,
  CitationTextSegment,
} from "../shared/citation-context";
import type { BodyBlock } from "../shared/legal";

/** Text-only projection of Reader order; no parsing, fallback text, or invented IDs. */
export function projectCitationText(
  blocks: BodyBlock[],
): Pick<CitationContext, "textSegments" | "textProjection"> {
  const textSegments: CitationTextSegment[] = [];
  let omittedResourceCount = 0;
  const seen = new Set<string>();
  const visit = (block: BodyBlock): void => {
    if (seen.has(block.id))
      throw new Error(`Duplicate or cyclic citation block: ${block.id}`);
    seen.add(block.id);
    const children = new Map(block.children.map((child) => [child.id, child]));
    if (children.size !== block.children.length)
      throw new Error(`Duplicate citation child: ${block.id}`);
    const consumed = new Set<string>();
    const referenced = block.orderedContent.flatMap((item) =>
      item.type === "child" ? [item.childId] : [],
    );
    if (
      referenced.length !== block.children.length ||
      referenced.some((id, index) => id !== block.children[index].id)
    ) {
      throw new Error(`Citation child coverage/order mismatch in ${block.id}`);
    }
    for (const [contentIndex, item] of block.orderedContent.entries()) {
      if (item.type === "text") {
        textSegments.push({
          entityId: block.id,
          contentIndex,
          kind: block.kind,
          marker: block.marker,
          text: item.text,
          anchor: block.anchor,
          sourceLocator: block.sourceLocator,
        });
      } else if (item.type === "resource") {
        omittedResourceCount += 1;
      } else {
        const child = children.get(item.childId);
        if (!child)
          throw new Error(
            `Missing citation child ${item.childId} in ${block.id}`,
          );
        if (consumed.has(item.childId))
          throw new Error(
            `Duplicate citation child reference: ${item.childId}`,
          );
        consumed.add(item.childId);
        visit(child);
      }
    }
    if (consumed.size !== children.size)
      throw new Error(`Unconsumed citation child in ${block.id}`);
  };
  blocks.forEach(visit);
  return {
    textSegments,
    textProjection: {
      scope: "text-only",
      order: "reader-ordered-content",
      markerInsertion: "none",
      omittedResourceCount,
    },
  };
}
