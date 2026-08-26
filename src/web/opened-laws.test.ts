import { describe, expect, it } from "vitest";
import type { DocumentSummary } from "../shared/legal";
import {
  OPENED_LAWS_STORAGE_KEY,
  type StorageLike,
  readOpenedLaws,
  recordOpenedLaw,
  resolveOpenedLaws,
} from "./opened-laws";

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const dora: DocumentSummary = {
  defaultPath: "/read/dora/articles/1",
  hasImplementationTimeline: false,
  hasSupervisoryDecisions: false,
  id: "eu:32022R2554",
  familyId: "family:dora",
  regulatoryLevel: "level-1",
  measureType: "primary-act",
  officialTitle: "DORA title",
  provenance: "official",
  shortName: "DORA",
  slug: "dora",
};

describe("opened laws", () => {
  it("keeps one latest entry per stable document ID", () => {
    const storage = new MemoryStorage();
    recordOpenedLaw(
      { documentId: dora.id, path: "/read/dora/articles/3" },
      storage,
      "2026-08-01T12:00:00.000Z",
    );
    recordOpenedLaw(
      { documentId: dora.id, path: "/explore/dora#article-3" },
      storage,
      "2026-08-02T12:00:00.000Z",
    );

    expect(readOpenedLaws(storage)).toEqual([
      {
        documentId: dora.id,
        openedAt: "2026-08-02T12:00:00.000Z",
        path: "/explore/dora#article-3",
      },
    ]);
  });

  it("bounds history and ignores malformed persisted values", () => {
    const storage = new MemoryStorage();
    storage.setItem(OPENED_LAWS_STORAGE_KEY, "not json");
    expect(readOpenedLaws(storage)).toEqual([]);

    for (let index = 0; index < 12; index += 1) {
      recordOpenedLaw(
        { documentId: `eu:${index}`, path: `/explore/law-${index}` },
        storage,
        `2026-08-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`,
      );
    }
    const items = readOpenedLaws(storage);
    expect(items).toHaveLength(10);
    expect(items[0]?.documentId).toBe("eu:11");
    expect(items.at(-1)?.documentId).toBe("eu:2");
  });

  it("hydrates only currently available documents from the catalog", () => {
    const resolved = resolveOpenedLaws(
      [
        {
          documentId: "missing",
          openedAt: "2026-08-01T00:00:00.000Z",
          path: "/explore/missing",
        },
        {
          documentId: dora.id,
          openedAt: "2026-08-02T00:00:00.000Z",
          path: "/read/dora/articles/3",
        },
      ],
      [dora],
    );
    expect(resolved).toEqual([
      {
        document: dora,
        opened: {
          documentId: dora.id,
          openedAt: "2026-08-02T00:00:00.000Z",
          path: "/read/dora/articles/3",
        },
      },
    ]);
  });
});
