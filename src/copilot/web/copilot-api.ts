import {
  type CopilotRespondRequest,
  type CopilotRespondResponse,
  copilotErrorResponseSchema,
  copilotRespondResponseSchema,
} from "../contract/copilot-contract";

export async function requestCopilotAnswer(
  request: CopilotRespondRequest,
  signal?: AbortSignal,
): Promise<CopilotRespondResponse> {
  const response = await fetch("/api/copilot/respond", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = copilotErrorResponseSchema.safeParse(body);
    throw new Error(
      error.success ? error.data.error.message : "Copilot is unavailable",
    );
  }
  return copilotRespondResponseSchema.parse(body);
}
