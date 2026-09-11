import {
  ArrowUpRight,
  MessageSquareText,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import {
  type FormEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  CopilotRespondRequest,
  CopilotRespondResponse,
  ReadingContextRef,
} from "../contract/copilot-contract";
import { COPILOT_SCHEMA_VERSION } from "../contract/copilot-contract";
import { requestCopilotAnswer } from "./copilot-api";
import "./copilot.css";
import {
  COPILOT_MAX_THREAD_MESSAGES,
  type StoredCopilotMessage,
  clearCopilotThread,
  loadCopilotThread,
  saveCopilotThread,
} from "./copilot-memory";
import {
  type CapturedReadingSelection,
  useReadingSelection,
} from "./reading-selection";

type CopilotDocument = {
  id: string;
  shortName: string;
};

type CopilotProvision = {
  id: string;
  label: string;
  title?: string;
};

type ConversationMessage = StoredCopilotMessage;

type QuickExplainState =
  | { status: "loading"; selection: CapturedReadingSelection }
  | {
      status: "answered";
      selection: CapturedReadingSelection;
      response: CopilotRespondResponse;
    }
  | { status: "error"; selection: CapturedReadingSelection; message: string };

const SELECTION_QUESTION =
  "Explain the selected text in its current legal context.";

function requestId() {
  return globalThis.crypto.randomUUID();
}

function contextReference(
  document: CopilotDocument,
  provision: CopilotProvision,
  selection?: CapturedReadingSelection,
): ReadingContextRef {
  return {
    documentId: document.id,
    provisionId: provision.id,
    entityId: selection?.entityId,
    selection: selection
      ? {
          entityId: selection.entityId,
          textRun: selection.textRun,
          start: selection.start,
          end: selection.end,
          text: selection.text,
        }
      : undefined,
  };
}

function recentMessages(messages: ConversationMessage[]) {
  return messages.slice(-8).map(({ role, content }) => ({ role, content }));
}

function retainedMessages(messages: ConversationMessage[]) {
  return messages.slice(-COPILOT_MAX_THREAD_MESSAGES);
}

function scopeLabel(response: CopilotRespondResponse) {
  if (response.status === "insufficient_context") {
    return "Insufficient current context";
  }
  if (response.evidenceScope === "current_document") {
    return "Searched this regulation";
  }
  if (response.evidenceScope === "corpus") return "Searched permitted sources";
  return "Based on current context";
}

export function ReaderCopilot({
  document,
  provision,
  legalTextRef,
  open,
  onOpen,
  onClose,
}: {
  document: CopilotDocument;
  provision: CopilotProvision;
  legalTextRef: RefObject<HTMLElement | null>;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const { captured, clear } = useReadingSelection(legalTextRef);
  const [activeSelection, setActiveSelection] =
    useState<CapturedReadingSelection | null>(null);
  const [quickExplain, setQuickExplain] = useState<QuickExplainState | null>(
    null,
  );
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [loadedDocumentId, setLoadedDocumentId] = useState<string | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const previousProvisionId = useRef(provision.id);
  const threadCreatedAt = useRef<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setLoadedDocumentId(null);
    setMessages([]);
    threadCreatedAt.current = undefined;
    void loadCopilotThread(document.id).then((thread) => {
      if (cancelled) return;
      if (thread) {
        setMessages(thread.messages);
        threadCreatedAt.current = thread.createdAt;
      }
      setLoadedDocumentId(document.id);
    });
    return () => {
      cancelled = true;
    };
  }, [document.id]);

  useEffect(() => {
    if (loadedDocumentId !== document.id) return;
    threadCreatedAt.current ??= new Date().toISOString();
    void saveCopilotThread(
      document.id,
      `${document.shortName} Copilot`,
      messages,
      threadCreatedAt.current,
    );
  }, [document.id, document.shortName, loadedDocumentId, messages]);

  useEffect(() => {
    if (previousProvisionId.current === provision.id) return;
    previousProvisionId.current = provision.id;
    clear();
    setQuickExplain(null);
    setActiveSelection(null);
    activeRequest.current?.abort();
  }, [clear, provision.id]);

  useEffect(() => {
    if (open) composerRef.current?.focus();
  }, [open]);

  useEffect(
    () => () => {
      activeRequest.current?.abort();
    },
    [],
  );

  async function answer(
    mode: CopilotRespondRequest["mode"],
    prompt: string,
    selection: CapturedReadingSelection | undefined,
    history: ConversationMessage[],
  ) {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    return requestCopilotAnswer(
      {
        schemaVersion: COPILOT_SCHEMA_VERSION,
        requestId: requestId(),
        mode,
        context: contextReference(document, provision, selection),
        messages: recentMessages(history),
        question: prompt,
      },
      controller.signal,
    );
  }

  async function explain(selection: CapturedReadingSelection) {
    clear();
    setQuickExplain({ status: "loading", selection });
    try {
      const response = await answer(
        "explain",
        SELECTION_QUESTION,
        selection,
        [],
      );
      setQuickExplain({ status: "answered", selection, response });
    } catch (caught) {
      if ((caught as DOMException).name === "AbortError") return;
      setQuickExplain({
        status: "error",
        selection,
        message: caught instanceof Error ? caught.message : "Unable to explain",
      });
    }
  }

  async function askFromSelection(selection: CapturedReadingSelection) {
    clear();
    setQuickExplain(null);
    setActiveSelection(selection);
    onOpen();
    setError("");
    const user: ConversationMessage = {
      id: requestId(),
      role: "user",
      content: SELECTION_QUESTION,
      context: contextReference(document, provision, selection),
    };
    const history = [...messages, user];
    setMessages(retainedMessages(history));
    setPending(true);
    try {
      const response = await answer(
        "chat",
        SELECTION_QUESTION,
        selection,
        messages,
      );
      setMessages((current) =>
        retainedMessages([
          ...current,
          {
            id: response.requestId,
            role: "assistant",
            content: response.answer,
            response,
          },
        ]),
      );
    } catch (caught) {
      if ((caught as DOMException).name !== "AbortError") {
        setError(caught instanceof Error ? caught.message : "Unable to answer");
      }
    } finally {
      setPending(false);
    }
  }

  function continueInCopilot(
    state: Extract<QuickExplainState, { status: "answered" }>,
  ) {
    setActiveSelection(state.selection);
    setMessages((current) =>
      retainedMessages([
        ...current,
        {
          id: requestId(),
          role: "user",
          content: SELECTION_QUESTION,
          context: contextReference(document, provision, state.selection),
        },
        {
          id: state.response.requestId,
          role: "assistant",
          content: state.response.answer,
          response: state.response,
        },
      ]),
    );
    setQuickExplain(null);
    onOpen();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const prompt = question.trim();
    if (!prompt || pending) return;
    setQuestion("");
    setError("");
    const user: ConversationMessage = {
      id: requestId(),
      role: "user",
      content: prompt,
      context: contextReference(
        document,
        provision,
        activeSelection ?? undefined,
      ),
    };
    const prior = messages;
    setMessages(retainedMessages([...prior, user]));
    setPending(true);
    try {
      const response = await answer(
        "chat",
        prompt,
        activeSelection ?? undefined,
        prior,
      );
      setMessages((current) =>
        retainedMessages([
          ...current,
          {
            id: response.requestId,
            role: "assistant",
            content: response.answer,
            response,
          },
        ]),
      );
    } catch (caught) {
      if ((caught as DOMException).name !== "AbortError") {
        setError(caught instanceof Error ? caught.message : "Unable to answer");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {captured ? (
        <div
          aria-label="Ask about selected legal text"
          className="copilot-selection-bubble"
          onMouseDown={(event) => event.preventDefault()}
          role="toolbar"
          style={{ left: captured.position.left, top: captured.position.top }}
        >
          <button onClick={() => void explain(captured)} type="button">
            <Sparkles aria-hidden="true" size={14} /> Explain
          </button>
          <button onClick={() => void askFromSelection(captured)} type="button">
            <MessageSquareText aria-hidden="true" size={14} /> Ask Copilot
          </button>
        </div>
      ) : null}

      {quickExplain ? (
        <section
          aria-live="polite"
          className="copilot-explain-popover"
          style={{
            left: quickExplain.selection.position.left,
            top: quickExplain.selection.position.top,
          }}
        >
          <header>
            <span>
              <Sparkles aria-hidden="true" size={14} /> Explain in context
            </span>
            <button
              aria-label="Close explanation"
              onClick={() => setQuickExplain(null)}
              type="button"
            >
              <X aria-hidden="true" size={15} />
            </button>
          </header>
          <blockquote>“{quickExplain.selection.text}”</blockquote>
          {quickExplain.status === "loading" ? (
            <p className="copilot-thinking">Understanding current context…</p>
          ) : null}
          {quickExplain.status === "error" ? (
            <p className="copilot-error" role="alert">
              {quickExplain.message}
            </p>
          ) : null}
          {quickExplain.status === "answered" ? (
            <>
              <p>{quickExplain.response.answer}</p>
              <small>{scopeLabel(quickExplain.response)}</small>
              <button
                className="copilot-continue"
                onClick={() => continueInCopilot(quickExplain)}
                type="button"
              >
                Continue in Copilot
                <ArrowUpRight aria-hidden="true" size={14} />
              </button>
            </>
          ) : null}
        </section>
      ) : null}

      {open ? (
        <aside aria-label="Regulatory Copilot" className="copilot-panel">
          <header className="copilot-panel-header">
            <div>
              <span className="copilot-mark">
                <Sparkles aria-hidden="true" size={14} />
              </span>
              <span>
                <strong>Copilot</strong>
                <small>Contextual regulatory help</small>
              </span>
            </div>
            <div className="copilot-panel-actions">
              {messages.length > 0 ? (
                <button
                  className="copilot-clear"
                  onClick={() => {
                    activeRequest.current?.abort();
                    setMessages([]);
                    setError("");
                    setActiveSelection(null);
                    threadCreatedAt.current = new Date().toISOString();
                    void clearCopilotThread(document.id);
                  }}
                  type="button"
                >
                  Clear
                </button>
              ) : null}
              <button
                aria-label="Close Copilot"
                onClick={onClose}
                type="button"
              >
                <X aria-hidden="true" size={17} />
              </button>
            </div>
          </header>

          <div className="copilot-context-card">
            <span>Current context</span>
            <strong>
              {document.shortName} · {provision.label}
            </strong>
            {activeSelection ? (
              <blockquote>“{activeSelection.text}”</blockquote>
            ) : provision.title ? (
              <small>{provision.title}</small>
            ) : null}
          </div>

          <div aria-live="polite" className="copilot-messages">
            {messages.length === 0 ? (
              <div className="copilot-empty">
                <Sparkles aria-hidden="true" size={19} />
                <p>Ask about the provision you are reading.</p>
                <small>
                  This first version answers only from the current context.
                </small>
              </div>
            ) : null}
            {messages.map((message) => (
              <article
                className={`copilot-message ${message.role}`}
                key={message.id}
              >
                <small>{message.role === "user" ? "You" : "Copilot"}</small>
                <p>{message.content}</p>
                {message.response ? (
                  <footer>
                    <span>{scopeLabel(message.response)}</span>
                    {message.response.citations.map((citation) => (
                      <a href={citation.path} key={citation.entityId}>
                        {citation.label}
                      </a>
                    ))}
                  </footer>
                ) : null}
              </article>
            ))}
            {pending ? (
              <p className="copilot-thinking">Understanding current context…</p>
            ) : null}
            {error ? (
              <p className="copilot-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <form className="copilot-composer" onSubmit={submit}>
            <textarea
              aria-label="Ask Copilot"
              maxLength={4_000}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask about this provision…"
              ref={composerRef}
              rows={3}
              value={question}
            />
            <button
              aria-label="Send question"
              disabled={pending || !question.trim()}
              type="submit"
            >
              <Send aria-hidden="true" size={15} />
            </button>
            <small>AI explanation · verify against cited text</small>
          </form>
        </aside>
      ) : null}
    </>
  );
}
