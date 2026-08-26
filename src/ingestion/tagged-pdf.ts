import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

interface PdfStructContent {
  type: string;
  id: string;
}

interface PdfStructNode {
  role: string;
  children: Array<PdfStructNode | PdfStructContent>;
}

export interface TaggedPdfSemanticEvent {
  page: number;
  role: "heading" | "paragraph" | "note" | "list-item" | "table";
  text: string;
  depth: number;
}

function isStructNode(
  value: PdfStructNode | PdfStructContent,
): value is PdfStructNode {
  return "role" in value;
}

function normalizePdfText(value: string): string {
  return value
    .replace(/-\s*\n\s*/gu, "-")
    .replace(/\s*\n\s*/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function textByMarkedContent(items: readonly unknown[]): Map<string, string> {
  const values = new Map<string, string[]>();
  const stack: Array<string | null> = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    if ("type" in item) {
      const type = (item as { type?: unknown }).type;
      if (type === "beginMarkedContentProps") {
        const id = (item as { id?: unknown }).id;
        stack.push(typeof id === "string" ? id : null);
      } else if (type === "beginMarkedContent") {
        stack.push(null);
      } else if (type === "endMarkedContent") {
        stack.pop();
      }
      continue;
    }
    if (!("str" in item)) continue;
    const id = [...stack].reverse().find((candidate) => candidate !== null);
    if (!id) continue;
    const textItem = item as { str: unknown; hasEOL?: unknown };
    if (typeof textItem.str !== "string") continue;
    const parts = values.get(id) ?? [];
    parts.push(textItem.str);
    if (textItem.hasEOL === true && !textItem.str.endsWith("-")) {
      parts.push("\n");
    }
    values.set(id, parts);
  }
  return new Map(
    [...values].map(([id, parts]) => [id, normalizePdfText(parts.join(""))]),
  );
}

function nodeText(
  node: PdfStructNode,
  content: Map<string, string>,
  excludeNestedLists = false,
): string {
  const parts: string[] = [];
  const collect = (value: PdfStructNode | PdfStructContent) => {
    if (!isStructNode(value)) {
      if (value.type === "content") parts.push(content.get(value.id) ?? "");
      return;
    }
    if (excludeNestedLists && value !== node && value.role === "L") return;
    for (const child of value.children) collect(child);
  };
  collect(node);
  return normalizePdfText(parts.join(" "));
}

function listEvents(
  node: PdfStructNode,
  content: Map<string, string>,
  page: number,
  depth: number,
): TaggedPdfSemanticEvent[] {
  const events: TaggedPdfSemanticEvent[] = [];
  for (const child of node.children) {
    if (!isStructNode(child)) continue;
    if (child.role === "LI") {
      const body = child.children.find(
        (candidate) => isStructNode(candidate) && candidate.role === "LBody",
      );
      if (body && isStructNode(body)) {
        const text = nodeText(body, content, true);
        if (text) events.push({ page, role: "list-item", text, depth });
        for (const nested of body.children) {
          if (isStructNode(nested) && nested.role === "L") {
            events.push(...listEvents(nested, content, page, depth + 1));
          }
        }
      }
      continue;
    }
    if (child.role === "L") {
      events.push(...listEvents(child, content, page, depth));
    }
  }
  return events;
}

function semanticEvents(
  root: PdfStructNode,
  content: Map<string, string>,
  page: number,
): TaggedPdfSemanticEvent[] {
  const events: TaggedPdfSemanticEvent[] = [];
  const visit = (node: PdfStructNode) => {
    if (/^H[1-6]$/u.test(node.role)) {
      const text = nodeText(node, content);
      if (text) events.push({ page, role: "heading", text, depth: 0 });
      return;
    }
    if (node.role === "P") {
      const text = nodeText(node, content);
      if (text) events.push({ page, role: "paragraph", text, depth: 0 });
      return;
    }
    if (node.role === "Note") {
      const text = nodeText(node, content);
      if (text) events.push({ page, role: "note", text, depth: 0 });
      return;
    }
    if (node.role === "L") {
      events.push(...listEvents(node, content, page, 0));
      return;
    }
    if (node.role === "TOC") return;
    if (node.role === "Table") {
      const text = nodeText(node, content);
      if (text) events.push({ page, role: "table", text, depth: 0 });
      return;
    }
    for (const child of node.children) {
      if (isStructNode(child)) visit(child);
    }
  };
  visit(root);
  return events;
}

export async function extractTaggedPdfSemanticEvents(
  bytes: Uint8Array,
): Promise<{ pageCount: number; events: TaggedPdfSemanticEvent[] }> {
  const loadingTask = getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
  });
  try {
    const pdf = await loadingTask.promise;
    const events: TaggedPdfSemanticEvent[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const [tree, text] = await Promise.all([
        page.getStructTree(),
        page.getTextContent({ includeMarkedContent: true }),
      ]);
      if (!tree) {
        throw new Error(`Tagged PDF page ${pageNumber} has no structure tree`);
      }
      events.push(
        ...semanticEvents(
          tree as PdfStructNode,
          textByMarkedContent(text.items),
          pageNumber,
        ),
      );
    }
    return { pageCount: pdf.numPages, events };
  } finally {
    await loadingTask.destroy();
  }
}
