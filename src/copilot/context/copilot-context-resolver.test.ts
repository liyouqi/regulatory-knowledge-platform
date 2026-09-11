import { describe, expect, it } from "vitest";
import { loadDoraDocumentView } from "../../data/document-repository";
import {
  CopilotContextMismatchError,
  CopilotContextNotFoundError,
  type CopilotContextRepository,
  CopilotContextResolver,
} from "./copilot-context-resolver";

const document = loadDoraDocumentView("/path/that/does/not/exist");
const provision = document.provisions[0];
const block = provision?.blocks[0];
const run = block?.orderedContent.find((item) => item.type === "text");

function repository(): CopilotContextRepository {
  return {
    buildId: "runtime-test",
    profileId: "profile-test",
    profileHash: `sha256:${"a".repeat(64)}`,
    findDocument: (id) => (id === document.id ? document : null),
  };
}

describe("CopilotContextResolver", () => {
  it("exact-resolves and verifies a selection against Runtime text", () => {
    expect(provision && block && run?.type === "text").toBe(true);
    if (!provision || !block || run?.type !== "text") return;
    const selected = "temporary fixture";
    const start = run.text.indexOf(selected);
    const result = new CopilotContextResolver(repository()).resolve({
      documentId: document.id,
      provisionId: provision.id,
      entityId: block.id,
      selection: {
        entityId: block.id,
        textRun: 0,
        start,
        end: start + selected.length,
        text: selected,
      },
    });

    expect(result.selection?.text).toBe(selected);
    expect(result.target.entityId).toBe(block.id);
    expect(result.evidence[0]).toMatchObject({
      entityId: block.id,
      text: run.text,
      path: `${provision.path}#${block.anchor}`,
    });
    expect(result.runtime.buildId).toBe("runtime-test");
  });

  it("fails closed when browser text differs from Runtime text", () => {
    expect(provision && block && run?.type === "text").toBe(true);
    if (!provision || !block || run?.type !== "text") return;
    expect(() =>
      new CopilotContextResolver(repository()).resolve({
        documentId: document.id,
        provisionId: provision.id,
        entityId: block.id,
        selection: {
          entityId: block.id,
          textRun: 0,
          start: 0,
          end: 4,
          text: "fake",
        },
      }),
    ).toThrow(CopilotContextMismatchError);
  });

  it("does not resolve unknown or cross-provision entities", () => {
    expect(provision).toBeDefined();
    if (!provision) return;
    const otherBlock = document.provisions[1]?.blocks[0];
    expect(otherBlock).toBeDefined();
    if (!otherBlock) return;
    const resolver = new CopilotContextResolver(repository());
    expect(() =>
      resolver.resolve({
        documentId: "unknown",
        provisionId: provision.id,
      }),
    ).toThrow(CopilotContextNotFoundError);
    expect(() =>
      resolver.resolve({
        documentId: document.id,
        provisionId: provision.id,
        entityId: otherBlock.id,
      }),
    ).toThrow(CopilotContextMismatchError);
  });
});
