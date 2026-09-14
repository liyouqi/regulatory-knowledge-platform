export type UserQueryLogEntry = {
  surface: string;
  interaction: "automatic_explain" | "user_question";
  query: string;
  requestId?: string;
  metadata?: Record<string, string | number | boolean | undefined>;
};

export function logUserQuery(entry: UserQueryLogEntry): void {
  console.info(
    JSON.stringify({
      ...entry.metadata,
      severity: "INFO",
      message: "Copilot query received",
      event: "copilot_query",
      surface: entry.surface,
      interaction: entry.interaction,
      query: entry.query,
      ...(entry.requestId ? { requestId: entry.requestId } : {}),
    }),
  );
}
