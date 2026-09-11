import type { ResolvedCopilotContext } from "../context/copilot-context-resolver";
import type { CopilotRespondRequest } from "../contract/copilot-contract";

export type CopilotAnswerInput = {
  mode: CopilotRespondRequest["mode"];
  question: string;
  messages: CopilotRespondRequest["messages"];
  context: ResolvedCopilotContext;
};

export type CopilotAnswerResult = {
  status: "answered" | "insufficient_context";
  answer: string;
  citedEntityIds: string[];
};

export interface CopilotAnswerProvider {
  answer(
    input: CopilotAnswerInput,
    signal?: AbortSignal,
  ): Promise<CopilotAnswerResult>;
}

export class CopilotProviderUnavailableError extends Error {}
export class CopilotProviderTimeoutError extends Error {}
export class CopilotProviderResponseError extends Error {}
