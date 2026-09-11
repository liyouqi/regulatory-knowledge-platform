import { describe, expect, it } from "vitest";
import { loadDoraDocumentView } from "../../data/document-repository";
import {
  type CopilotContextRepository,
  CopilotContextResolver,
} from "../context/copilot-context-resolver";
import type { CopilotRespondRequest } from "../contract/copilot-contract";
import type { CopilotAnswerProvider } from "../providers/copilot-answer-provider";
import { CopilotProviderResponseError } from "../providers/copilot-answer-provider";
import { CopilotService } from "./copilot-service";

const document = loadDoraDocumentView("/path/that/does/not/exist");
const provision = document.provisions[0];
const block = provision?.blocks[0];

function resolver() {
  const repository: CopilotContextRepository = {
    buildId: "runtime-test",
    profileId: "profile-test",
    profileHash: `sha256:${"a".repeat(64)}`,
    findDocument: (id) => (id === document.id ? document : null),
  };
  return new CopilotContextResolver(repository);
}

function request(): CopilotRespondRequest {
  if (!provision || !block) throw new Error("Fixture is incomplete");
  return {
    schemaVersion: "0.1.0",
    requestId: "request-1",
    mode: "explain",
    context: {
      documentId: document.id,
      provisionId: provision.id,
      entityId: block.id,
    },
    messages: [],
    question: "What does this mean?",
  };
}

describe("CopilotService", () => {
  it("copies citation metadata from resolved Runtime evidence", async () => {
    if (!block || !provision) throw new Error("Fixture is incomplete");
    const provider: CopilotAnswerProvider = {
      answer: async () => ({
        status: "answered",
        answer: "A contextual explanation.",
        citedEntityIds: [block.id],
      }),
    };
    const response = await new CopilotService(resolver(), provider).respond(
      request(),
    );

    expect(response).toMatchObject({
      requestId: "request-1",
      status: "answered",
      evidenceScope: "current_context",
      citations: [
        {
          entityId: block.id,
          path: `${provision.path}#${block.anchor}`,
          sourceUrl: document.sourceUrl,
        },
      ],
    });
  });

  it("rejects model citations outside the supplied context", async () => {
    const provider: CopilotAnswerProvider = {
      answer: async () => ({
        status: "answered",
        answer: "Unsupported.",
        citedEntityIds: ["invented-entity"],
      }),
    };
    await expect(
      new CopilotService(resolver(), provider).respond(request()),
    ).rejects.toBeInstanceOf(CopilotProviderResponseError);
  });
});
