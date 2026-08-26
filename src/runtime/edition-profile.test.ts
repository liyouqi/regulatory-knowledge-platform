import { describe, expect, it } from "vitest";
import { loadDocumentViews } from "../data/document-repository";
import { loadCssfSourceRegistrySync } from "../ingestion/cssf-source-registry";
import { loadEbaSourceRegistrySync } from "../ingestion/eba-source-registry";
import { loadSourceRegistrySync } from "../ingestion/source-registry";
import {
  compileEditionProfile,
  editionProfileRegistrySchema,
  findEditionProfile,
  loadEditionProfileRegistrySync,
} from "./edition-profile";

const documents = loadDocumentViews();
const sources = [
  ...loadSourceRegistrySync(),
  ...loadCssfSourceRegistrySync(),
  ...loadEbaSourceRegistrySync(),
];
const registry = loadEditionProfileRegistrySync();

describe("Edition/Profile compilation", () => {
  it("loads one explicit default and unique reviewed profiles", () => {
    expect(registry.defaultProfileId).toBe("full-corpus");
    expect(registry.profiles.map((profile) => profile.id)).toEqual([
      "full-corpus",
      "banking-default",
    ]);
    expect(
      editionProfileRegistrySchema.safeParse({
        ...registry,
        defaultProfileId: "missing",
      }).success,
    ).toBe(false);
  });

  it("keeps stable IDs while excluding the complete MiCA family", () => {
    const full = compileEditionProfile(
      findEditionProfile("full-corpus", registry),
      documents,
      sources,
    );
    const banking = compileEditionProfile(
      findEditionProfile("banking-default", registry),
      documents,
      sources,
    );

    expect(full.documents).toHaveLength(documents.length);
    expect(banking.documents.map((document) => document.id)).toContain(
      "eu:32022R2554",
    );
    expect(banking.documents.map((document) => document.id)).toContain(
      "eu:32013L0036",
    );
    expect(banking.documents.map((document) => document.id)).toContain(
      "eu:eba:gl:2021:05",
    );
    expect(banking.documents.map((document) => document.id)).not.toContain(
      "eu:32023R1114",
    );
    expect(banking.documents.map((document) => document.id)).not.toContain(
      "eu:32025R0305",
    );
    expect(
      banking.sources.some((source) => source.familyId === "family:mica"),
    ).toBe(false);
    expect(banking.excludedCelexes).toEqual(
      new Set(["32023R1114", "32025R0305"]),
    );
    expect(
      banking.documents.find((document) => document.id === "eu:32022R2554")?.id,
    ).toBe(
      full.documents.find((document) => document.id === "eu:32022R2554")?.id,
    );
    expect(banking.profileHash).not.toBe(full.profileHash);
  });

  it("fails closed for unknown family or profile identifiers", () => {
    expect(() => findEditionProfile("unknown", registry)).toThrow(
      "Unknown Edition/Profile unknown",
    );
    expect(() =>
      compileEditionProfile(
        {
          id: "invalid-family",
          version: "1.0.0",
          displayName: "Invalid family",
          description: "Fixture for fail-closed validation.",
          selection: {
            mode: "allowlist",
            familyIds: ["family:unknown"],
            documentIds: [],
          },
        },
        documents,
        sources,
      ),
    ).toThrow("references unknown family family:unknown");
  });
});
