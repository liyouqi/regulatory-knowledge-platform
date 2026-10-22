import addFormats from "ajv-formats";
import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { publicDocumentReferenceSchema } from "../shared/public-api";
import { publicApiOpenApiDocument } from "./public-api-openapi";

const document = {
  id: "fr:amf:rg",
  jurisdiction: "FR",
  slug: "fr-amf-rg",
  shortName: "AMF RG",
  officialTitle: "AMF RG",
  documentType: "regulation",
  sourceUrl: "https://www.amf-france.org/",
  asOf: "2026-09-11",
  provenance: "official",
  publicationDate: null,
  publicationDateBasis: "aggregate-with-multiple-component-publications",
};

describe("Public API French publication date", () => {
  it("matches both Zod and OpenAPI for FR and non-FR cases", () => {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    for (const schemaName of [
      "DocumentReference",
      "StructureDocumentReference",
    ]) {
      const validate = ajv.compile({
        $schema: publicApiOpenApiDocument.jsonSchemaDialect,
        components: publicApiOpenApiDocument.components,
        $ref: `#/components/schemas/${schemaName}`,
      });
      const extra =
        schemaName === "StructureDocumentReference"
          ? {
              sourceSnapshotId: "snapshot",
              sourceVersion: "version",
              lastChecked: "2026-10-20T00:00:00.000Z",
              canonicalBuildId: "build",
            }
          : {};
      const {
        publicationDate: _date,
        publicationDateBasis: _basis,
        ...withoutDate
      } = document;
      const cases: Array<[Record<string, unknown>, boolean]> = [
        [document, true],
        [withoutDate, false],
        [{ ...document, publicationDate: "2026-09-11" }, false],
        [{ ...document, publicationDateBasis: undefined }, false],
        [{ ...withoutDate, jurisdiction: "EU" }, true],
        [
          { ...withoutDate, jurisdiction: "EU", publicationDate: "2026-09-11" },
          true,
        ],
        [{ ...document, jurisdiction: "EU" }, false],
        [{ ...withoutDate, jurisdiction: "EU", publicationDate: null }, false],
      ];
      for (const [item, valid] of cases) {
        const clean = JSON.parse(JSON.stringify(item));
        expect(publicDocumentReferenceSchema.safeParse(clean).success).toBe(
          valid,
        );
        expect(
          validate({ ...clean, ...extra }),
          JSON.stringify(validate.errors),
        ).toBe(valid);
      }
    }
  });
});
