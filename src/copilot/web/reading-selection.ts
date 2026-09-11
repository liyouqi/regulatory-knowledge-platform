import type { RefObject } from "react";
import { useCallback, useEffect, useState } from "react";

export type CapturedReadingSelection = {
  entityId: string;
  textRun: number;
  start: number;
  end: number;
  text: string;
  position: { left: number; top: number };
};

function parentElement(node: Node | null): Element | null {
  if (!node) return null;
  return node instanceof Element ? node : node.parentElement;
}

function legalTextNodes(container: Element): Text[] {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    const parent = current.parentElement;
    if (!parent?.closest("[data-copilot-ignore-selection='true']")) {
      nodes.push(current as Text);
    }
    current = walker.nextNode();
  }
  return nodes;
}

function textBoundaryOffset(
  nodes: Text[],
  boundaryNode: Node,
  boundaryOffset: number,
): number | null {
  let offset = 0;
  for (const node of nodes) {
    if (node === boundaryNode) return offset + boundaryOffset;
    offset += node.data.length;
  }
  return null;
}

function captureSelection(root: HTMLElement): CapturedReadingSelection | null {
  const selection = globalThis.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) {
    return null;
  }
  const range = selection.getRangeAt(0);
  const startElement = parentElement(range.startContainer);
  const endElement = parentElement(range.endContainer);
  if (
    !startElement ||
    !endElement ||
    startElement.closest("[data-copilot-ignore-selection='true']") ||
    endElement.closest("[data-copilot-ignore-selection='true']")
  ) {
    return null;
  }
  const startRun = startElement.closest<HTMLElement>(
    "[data-copilot-entity-id][data-copilot-text-run]",
  );
  const endRun = endElement.closest<HTMLElement>(
    "[data-copilot-entity-id][data-copilot-text-run]",
  );
  if (!startRun || startRun !== endRun || !root.contains(startRun)) return null;

  const nodes = legalTextNodes(startRun);
  const start = textBoundaryOffset(
    nodes,
    range.startContainer,
    range.startOffset,
  );
  const end = textBoundaryOffset(nodes, range.endContainer, range.endOffset);
  if (start === null || end === null || end <= start) return null;
  const completeText = nodes.map((node) => node.data).join("");
  const text = completeText.slice(start, end);
  if (!text.trim() || text.length > 4_000) return null;

  const rectangle = range.getBoundingClientRect();
  const left = Math.min(
    Math.max(rectangle.left + rectangle.width / 2, 90),
    globalThis.innerWidth - 90,
  );
  const top = Math.max(rectangle.top - 10, 12);
  const textRun = Number(startRun.dataset.copilotTextRun);
  const entityId = startRun.dataset.copilotEntityId;
  if (!entityId || !Number.isInteger(textRun) || textRun < 0) return null;
  return { entityId, textRun, start, end, text, position: { left, top } };
}

export function useReadingSelection(rootRef: RefObject<HTMLElement | null>) {
  const [captured, setCaptured] = useState<CapturedReadingSelection | null>(
    null,
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setCaptured(captureSelection(root));
      });
    };
    root.addEventListener("pointerup", update);
    root.addEventListener("keyup", update);
    document.addEventListener("selectionchange", update);
    return () => {
      cancelAnimationFrame(frame);
      root.removeEventListener("pointerup", update);
      root.removeEventListener("keyup", update);
      document.removeEventListener("selectionchange", update);
    };
  }, [rootRef]);

  const clear = useCallback(() => setCaptured(null), []);
  return { captured, clear };
}
