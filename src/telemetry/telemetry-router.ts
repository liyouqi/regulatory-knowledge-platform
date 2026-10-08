import express from "express";
import { z } from "zod";
import { logProductEvent } from "../shared/product-event-log";

const eventSchema = z.object({
  event: z.enum(["page_view", "search_result_opened", "feature_action"]),
  surface: z
    .enum(["reader", "monitor", "galaxy", "search", "other"])
    .default("other"),
  path: z.string().max(600),
  action: z.string().max(100).optional(),
  query: z.string().max(200).optional(),
  resultCount: z.number().int().nonnegative().max(10_000).optional(),
});

export function createTelemetryRouter() {
  const router = express.Router();
  router.use(express.json({ limit: "8kb", strict: true }));

  router.post("/events", (request, response) => {
    const parsed = eventSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid product event." });
      return;
    }
    const event = parsed.data;
    logProductEvent({
      event: event.event,
      message: "Product event received",
      surface: event.surface,
      metadata: {
        path: event.path,
        action: event.action,
        query: event.query,
        resultCount: event.resultCount,
      },
    });
    response.status(204).end();
  });

  return router;
}
