export type ProductSurface =
  | "reader"
  | "monitor"
  | "galaxy"
  | "search"
  | "other";

export function surfaceForPath(path: string): ProductSurface {
  if (path.startsWith("/monitor")) return "monitor";
  if (path.startsWith("/earth")) return "galaxy";
  if (
    path.startsWith("/read") ||
    path.startsWith("/law") ||
    path.startsWith("/explore")
  )
    return "reader";
  return "other";
}

export function trackProductEvent(event: {
  event: "page_view" | "search_result_opened" | "feature_action";
  surface: ProductSurface;
  path: string;
  action?: string;
  query?: string;
  resultCount?: number;
}): void {
  void fetch("/api/telemetry/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
    keepalive: true,
  }).catch(() => undefined);
}
