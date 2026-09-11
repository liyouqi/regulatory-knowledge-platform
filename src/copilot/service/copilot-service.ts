import type { CopilotContextResolver } from "../context/copilot-context-resolver";
import {
  COPILOT_SCHEMA_VERSION,
  type CopilotCitation,
  type CopilotRespondRequest,
  type CopilotRespondResponse,
  copilotRespondResponseSchema,
} from "../contract/copilot-contract";
import type { CopilotAnswerProvider } from "../providers/copilot-answer-provider";
import { CopilotProviderResponseError } from "../providers/copilot-answer-provider";

export class CopilotService {
  constructor(
    private readonly contextResolver: CopilotContextResolver,
    private readonly provider: CopilotAnswerProvider,
  ) {}

  async respond(
    request: CopilotRespondRequest,
    signal?: AbortSignal,
  ): Promise<CopilotRespondResponse> {
    const context = this.contextResolver.resolve(request.context);
    const result = await this.provider.answer(
      {
        mode: request.mode,
        question: request.question,
        messages: request.messages,
        context,
      },
      signal,
    );

    const evidenceById = new Map(
      context.evidence.map((item) => [item.entityId, item]),
    );
    const citations: CopilotCitation[] = [];
    const seen = new Set<string>();
    for (const entityId of result.citedEntityIds) {
      if (seen.has(entityId)) continue;
      const evidence = evidenceById.get(entityId);
      if (!evidence) {
        throw new CopilotProviderResponseError(
          "Private AI cited evidence outside the supplied context",
        );
      }
      seen.add(entityId);
      citations.push({
        entityId,
        label: evidence.label,
        path: evidence.path,
        sourceUrl: evidence.sourceUrl,
      });
    }
    if (result.status === "answered" && citations.length === 0) {
      throw new CopilotProviderResponseError(
        "Private AI answer did not cite supplied context",
      );
    }

    return copilotRespondResponseSchema.parse({
      schemaVersion: COPILOT_SCHEMA_VERSION,
      requestId: request.requestId,
      status: result.status,
      answer: result.answer,
      citations,
      evidenceScope: "current_context",
      runtime: context.runtime,
    });
  }
}
