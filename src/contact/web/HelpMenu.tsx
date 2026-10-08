import { CircleHelp, Send, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import type { ProductSurface } from "../../telemetry/web/product-analytics";
import "./help-menu.css";

type ContactTopic = "feedback" | "data_issue" | "question";

export function HelpMenu({
  surface,
  context,
  tone = "dark",
}: {
  surface: Exclude<ProductSurface, "search">;
  context?: string;
  tone?: "dark" | "light" | "space";
}) {
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [topic, setTopic] = useState<ContactTopic>("feedback");
  const [replyEmail, setReplyEmail] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!open || available !== null) return;
    const controller = new AbortController();
    void fetch("/api/contact/status", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return (await response.json()) as { available: boolean };
      })
      .then((result) => setAvailable(result.available))
      .catch((error: unknown) => {
        if ((error as DOMException).name !== "AbortError") setAvailable(false);
      });
    return () => controller.abort();
  }, [available, open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setStatus("");
    try {
      const response = await fetch("/api/contact/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topic,
          replyEmail,
          message,
          website,
          surface,
          context,
          pageUrl: globalThis.location.href,
        }),
      });
      const body = (await response.json()) as {
        delivered?: boolean;
        error?: string;
      };
      if (!response.ok || !body.delivered) {
        throw new Error(body.error ?? "The message could not be sent.");
      }
      setMessage("");
      setStatus("Message sent. Thank you.");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "The message could not be sent.",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={`product-help product-help-${tone}`}>
      <button
        aria-expanded={open}
        className="product-help-trigger"
        onClick={() => {
          setOpen((current) => !current);
          setStatus("");
        }}
        type="button"
      >
        <CircleHelp aria-hidden="true" size={15} /> Help
      </button>
      {open ? (
        <dialog
          aria-label="Contact and feedback"
          className="product-help-panel"
          open
        >
          <header>
            <div>
              <span>Contact</span>
              <h2>How can we help?</h2>
            </div>
            <button
              aria-label="Close contact form"
              onClick={() => setOpen(false)}
              type="button"
            >
              <X aria-hidden="true" size={17} />
            </button>
          </header>
          {available === false ? (
            <p className="product-help-state">
              Contact delivery is not configured for this deployment.
            </p>
          ) : (
            <form onSubmit={submit}>
              <label>
                Topic
                <select
                  onChange={(event) =>
                    setTopic(event.target.value as ContactTopic)
                  }
                  value={topic}
                >
                  <option value="feedback">Product feedback</option>
                  <option value="data_issue">Report a data issue</option>
                  <option value="question">Question</option>
                </select>
              </label>
              <label>
                Reply email <small>Optional</small>
                <input
                  autoComplete="email"
                  maxLength={254}
                  onChange={(event) => setReplyEmail(event.target.value)}
                  type="email"
                  value={replyEmail}
                />
              </label>
              <label>
                Message
                <textarea
                  maxLength={4_000}
                  minLength={10}
                  onChange={(event) => setMessage(event.target.value)}
                  required
                  rows={5}
                  value={message}
                />
              </label>
              <label className="product-help-honeypot" aria-hidden="true">
                Website
                <input
                  autoComplete="off"
                  onChange={(event) => setWebsite(event.target.value)}
                  tabIndex={-1}
                  value={website}
                />
              </label>
              <p className="product-help-note">
                The current page is attached automatically. The contact address
                is not published.
              </p>
              {status ? (
                <output className="product-help-state">{status}</output>
              ) : null}
              <button
                className="product-help-send"
                disabled={
                  sending || available !== true || message.trim().length < 10
                }
                type="submit"
              >
                <Send aria-hidden="true" size={15} />
                {sending ? "Sending…" : "Send message"}
              </button>
            </form>
          )}
        </dialog>
      ) : null}
    </div>
  );
}
