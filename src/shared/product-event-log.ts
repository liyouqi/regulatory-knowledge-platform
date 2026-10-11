export type ProductEventLogEntry = {
  event: string;
  message: string;
  surface: string;
  severity?: "INFO" | "WARNING" | "ERROR";
  metadata?: Record<string, string | number | boolean | undefined>;
};

export function logProductEvent(entry: ProductEventLogEntry): void {
  console.info(
    JSON.stringify({
      ...entry.metadata,
      severity: entry.severity ?? "INFO",
      message: entry.message,
      event: entry.event,
      surface: entry.surface,
      timestamp: new Date().toISOString(),
    }),
  );
}
