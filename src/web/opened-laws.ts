import type { DocumentSummary } from "../shared/legal";

export const OPENED_LAWS_STORAGE_KEY = "regulatory-knowledge.opened-laws.v1";
export const OPENED_LAWS_CHANGED_EVENT = "regulatory-knowledge:opened-laws";
const OPENED_LAWS_SCHEMA_VERSION = 1;
const OPENED_LAWS_LIMIT = 10;

export type OpenedLaw = {
  documentId: string;
  openedAt: string;
  path: string;
};

type OpenedLawsEnvelope = {
  items: OpenedLaw[];
  version: number;
};

export type StorageLike = Pick<Storage, "getItem" | "removeItem" | "setItem">;

function isOpenedLaw(value: unknown): value is OpenedLaw {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.documentId === "string" &&
    candidate.documentId.length > 0 &&
    typeof candidate.openedAt === "string" &&
    !Number.isNaN(Date.parse(candidate.openedAt)) &&
    typeof candidate.path === "string" &&
    /^\/(?:read|explore)\//.test(candidate.path)
  );
}

function getBrowserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function notifyOpenedLawsChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(OPENED_LAWS_CHANGED_EVENT));
  }
}

export function readOpenedLaws(storage = getBrowserStorage()): OpenedLaw[] {
  if (!storage) return [];
  try {
    const raw: unknown = JSON.parse(
      storage.getItem(OPENED_LAWS_STORAGE_KEY) ?? "null",
    );
    if (!raw || typeof raw !== "object") return [];
    const envelope = raw as Partial<OpenedLawsEnvelope>;
    if (
      envelope.version !== OPENED_LAWS_SCHEMA_VERSION ||
      !Array.isArray(envelope.items)
    ) {
      return [];
    }
    return envelope.items.filter(isOpenedLaw).slice(0, OPENED_LAWS_LIMIT);
  } catch {
    return [];
  }
}

function saveOpenedLaws(items: OpenedLaw[], storage = getBrowserStorage()) {
  if (!storage) return;
  const envelope: OpenedLawsEnvelope = {
    items: items.slice(0, OPENED_LAWS_LIMIT),
    version: OPENED_LAWS_SCHEMA_VERSION,
  };
  try {
    storage.setItem(OPENED_LAWS_STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    // Recent-law convenience must never block the reader when storage is unavailable.
  }
}

export function recordOpenedLaw(
  input: Pick<OpenedLaw, "documentId" | "path">,
  storage = getBrowserStorage(),
  openedAt = new Date().toISOString(),
): OpenedLaw[] {
  if (!/^\/(?:read|explore)\//.test(input.path)) return readOpenedLaws(storage);
  const next = [
    { ...input, openedAt },
    ...readOpenedLaws(storage).filter(
      (item) => item.documentId !== input.documentId,
    ),
  ].slice(0, OPENED_LAWS_LIMIT);
  saveOpenedLaws(next, storage);
  if (!storage || storage === getBrowserStorage()) notifyOpenedLawsChanged();
  return next;
}

export function clearOpenedLaws(storage = getBrowserStorage()) {
  if (!storage) return;
  try {
    storage.removeItem(OPENED_LAWS_STORAGE_KEY);
  } catch {
    return;
  }
  if (storage === getBrowserStorage()) notifyOpenedLawsChanged();
}

export type ResolvedOpenedLaw = {
  document: DocumentSummary;
  opened: OpenedLaw;
};

export function resolveOpenedLaws(
  openedLaws: OpenedLaw[],
  catalog: DocumentSummary[],
): ResolvedOpenedLaw[] {
  const documents = new Map(catalog.map((document) => [document.id, document]));
  return openedLaws.flatMap((opened) => {
    const document = documents.get(opened.documentId);
    return document ? [{ document, opened }] : [];
  });
}

export function formatOpenedAt(openedAt: string, now = Date.now()): string {
  const elapsedMinutes = Math.max(
    0,
    Math.floor((now - Date.parse(openedAt)) / 60_000),
  );
  if (elapsedMinutes < 1) return "Just now";
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h ago`;
  return `${Math.floor(elapsedHours / 24)}d ago`;
}
