import express from "express";
import { z } from "zod";
import { logProductEvent } from "../shared/product-event-log";
import type { ContactService, ContactSubmission } from "./contact-service";

const submissionSchema = z.object({
  topic: z.enum(["feedback", "data_issue", "question"]),
  message: z.string().trim().min(10).max(4_000),
  replyEmail: z.union([z.string().trim().email().max(254), z.literal("")]),
  surface: z.enum(["reader", "monitor", "galaxy", "other"]),
  pageUrl: z.string().trim().max(600),
  context: z.string().trim().max(500).optional(),
  website: z.string().max(0),
});

type ContactRouterOptions = {
  service: Pick<ContactService, "send"> | null;
  now?: () => number;
};

export function createContactRouter(options: ContactRouterOptions) {
  const router = express.Router();
  const now = options.now ?? Date.now;
  const attempts = new Map<string, number[]>();
  router.use(express.json({ limit: "12kb", strict: true }));

  router.get("/status", (_request, response) => {
    response.json({ available: options.service !== null });
  });

  router.post("/submit", async (request, response) => {
    if (!options.service) {
      response.status(503).json({ error: "Contact is not configured." });
      return;
    }
    const parsed = submissionSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Please check the feedback form." });
      return;
    }

    const forwarded = request.get("x-forwarded-for")?.split(",")[0]?.trim();
    const client = forwarded || request.ip || "unknown";
    const cutoff = now() - 10 * 60 * 1_000;
    const recent = (attempts.get(client) ?? []).filter((time) => time > cutoff);
    if (recent.length >= 3) {
      response
        .status(429)
        .json({ error: "Please wait before sending another message." });
      return;
    }
    recent.push(now());
    attempts.set(client, recent);

    const submission: ContactSubmission = {
      ...parsed.data,
      replyEmail: parsed.data.replyEmail || undefined,
    };
    try {
      await options.service.send(submission);
      logProductEvent({
        event: "contact_submission",
        message: "Contact message delivered",
        surface: submission.surface,
        metadata: {
          topic: submission.topic,
          path: submission.pageUrl,
          hasReplyEmail: Boolean(submission.replyEmail),
        },
      });
      response.status(202).json({ delivered: true });
    } catch {
      logProductEvent({
        event: "contact_submission",
        message: "Contact message delivery failed",
        severity: "ERROR",
        surface: submission.surface,
        metadata: { topic: submission.topic, delivered: false },
      });
      response.status(502).json({ error: "The message could not be sent." });
    }
  });

  return router;
}
