import type {
  CopilotRespondResponse,
  ReadingContextRef,
} from "../contract/copilot-contract";
import { copilotRespondResponseSchema } from "../contract/copilot-contract";

const DATABASE_NAME = "regulatory-copilot";
const DATABASE_VERSION = 1;
const THREAD_STORE = "threads";
const MAX_THREADS = 20;
export const COPILOT_MAX_THREAD_MESSAGES = 40;

export type StoredCopilotMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  context?: ReadingContextRef;
  response?: CopilotRespondResponse;
};

export type StoredCopilotThread = {
  schemaVersion: "0.1.0";
  threadId: string;
  documentId: string;
  title: string;
  messages: StoredCopilotMessage[];
  createdAt: string;
  updatedAt: string;
};

function threadId(documentId: string) {
  return `document:${documentId}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in globalThis)) {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(THREAD_STORE)) {
        request.result.createObjectStore(THREAD_STORE, { keyPath: "threadId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB failed"));
  });
}

function transact<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(THREAD_STORE, mode);
        const request = operation(transaction.objectStore(THREAD_STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
          reject(request.error ?? new Error("IndexedDB failed"));
        transaction.oncomplete = () => database.close();
        transaction.onerror = () => {
          database.close();
          reject(
            transaction.error ?? new Error("IndexedDB transaction failed"),
          );
        };
      }),
  );
}

function validMessage(value: unknown): value is StoredCopilotMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<StoredCopilotMessage>;
  if (
    typeof message.id !== "string" ||
    (message.role !== "user" && message.role !== "assistant") ||
    typeof message.content !== "string"
  ) {
    return false;
  }
  return (
    !message.response ||
    copilotRespondResponseSchema.safeParse(message.response).success
  );
}

function validThread(
  value: unknown,
  documentId: string,
): value is StoredCopilotThread {
  if (!value || typeof value !== "object") return false;
  const thread = value as Partial<StoredCopilotThread>;
  return (
    thread.schemaVersion === "0.1.0" &&
    thread.threadId === threadId(documentId) &&
    thread.documentId === documentId &&
    typeof thread.title === "string" &&
    typeof thread.createdAt === "string" &&
    typeof thread.updatedAt === "string" &&
    Array.isArray(thread.messages) &&
    thread.messages.length <= COPILOT_MAX_THREAD_MESSAGES &&
    thread.messages.every(validMessage)
  );
}

async function pruneOldThreads() {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(THREAD_STORE, "readwrite");
    const store = transaction.objectStore(THREAD_STORE);
    const request = store.getAll();
    request.onsuccess = () => {
      const threads = request.result
        .filter(
          (value): value is StoredCopilotThread =>
            Boolean(value) &&
            typeof value === "object" &&
            typeof (value as StoredCopilotThread).threadId === "string" &&
            typeof (value as StoredCopilotThread).updatedAt === "string",
        )
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      for (const thread of threads.slice(MAX_THREADS)) {
        store.delete(thread.threadId);
      }
    };
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB failed"));
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    };
  });
}

export async function loadCopilotThread(documentId: string) {
  try {
    const stored = await transact<unknown>("readonly", (store) =>
      store.get(threadId(documentId)),
    );
    return validThread(stored, documentId) ? stored : null;
  } catch {
    return null;
  }
}

export async function saveCopilotThread(
  documentId: string,
  title: string,
  messages: StoredCopilotMessage[],
  createdAt?: string,
) {
  const now = new Date().toISOString();
  const thread: StoredCopilotThread = {
    schemaVersion: "0.1.0",
    threadId: threadId(documentId),
    documentId,
    title,
    messages: messages.slice(-COPILOT_MAX_THREAD_MESSAGES),
    createdAt: createdAt ?? now,
    updatedAt: now,
  };
  try {
    await transact("readwrite", (store) => store.put(thread));
    await pruneOldThreads();
  } catch {
    // Conversation remains available in React state when browser storage is unavailable.
  }
}

export async function clearCopilotThread(documentId: string) {
  try {
    await transact("readwrite", (store) => store.delete(threadId(documentId)));
  } catch {
    // Clearing in-memory state remains useful even if IndexedDB is unavailable.
  }
}
