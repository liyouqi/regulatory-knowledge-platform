import { describe, expect, it } from "vitest";
import {
  contentUnitSchema,
  contentUnitV14Schema,
  legacyContentUnitSchema,
  projectContentUnits,
} from "../shared/content-unit";
import {
  legacySourceStatusSchema,
  sourceStatusSchema,
} from "../shared/source-status";
import {
  canonicalDocumentV12Schema,
  canonicalDocumentV13Schema,
  canonicalDocumentV14Schema,
} from "./schema";

const locator = { kind: "fixture" as const, value: "synthetic" };
const link = {
  type: "element" as const,
  name: "link" as const,
  href: "https://www.amf-france.org/",
  sourceAttributes: {},
  contentRole: "operative-text" as const,
  sourceLocator: locator,
  children: [],
};
describe("AMF versioned contract boundaries", () => {
  it("keeps link and list semantics outside historical Canonical unit schemas", () => {
    expect(contentUnitSchema.safeParse(link).success).toBe(true);
    expect(contentUnitV14Schema.safeParse(link).success).toBe(false);
    expect(legacyContentUnitSchema.safeParse(link).success).toBe(false);
    expect(
      contentUnitV14Schema.safeParse({ ...link, name: "group" }).success,
    ).toBe(false);
    expect(projectContentUnits([link]).contentLayout[0].href).toBe(link.href);
  });
  it("keeps publisher version status outside every old Canonical source branch", () => {
    const status = {
      basis: "consolidated",
      textAsOf: "2026-09-11",
      currentVersionUrl: "https://www.amf-france.org/fr/eli/fr/aai/amf/rg",
      corrections: [],
      textAuthorityStatus: "publisher-consolidation",
      textAsOfBasis: "publisher-version-date",
    };
    expect(sourceStatusSchema.safeParse(status).success).toBe(true);
    expect(legacySourceStatusSchema.safeParse(status).success).toBe(false);
    for (const schema of [
      canonicalDocumentV12Schema,
      canonicalDocumentV13Schema,
      canonicalDocumentV14Schema,
    ])
      expect(
        schema.shape.source.shape.sourceStatus.safeParse(status).success,
      ).toBe(false);
  });
  it("rejects semantic fields before a line-break projection could discard them", () => {
    expect(() =>
      projectContentUnits([{ ...link, name: "line-break" }]),
    ).toThrow();
    expect(() =>
      projectContentUnits([{ ...link, href: "javascript:alert(1)" }]),
    ).toThrow();
    expect(() =>
      projectContentUnits([
        { ...link, href: "https://user:secret@example.test/" },
      ]),
    ).toThrow();
  });
});
