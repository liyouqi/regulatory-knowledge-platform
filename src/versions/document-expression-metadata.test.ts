import { describe, expect, it } from "vitest";
import { loadCssfSourceRegistrySync } from "../ingestion/cssf-source-registry";
import { loadEbaSourceRegistrySync } from "../ingestion/eba-source-registry";
import { loadSourceRegistrySync } from "../ingestion/source-registry";
import {
  loadDocumentExpressionMetadataDataset,
  selectDocumentExpressionMetadata,
} from "./document-expression-metadata";

function registeredDocumentIds(): Set<string> {
  return new Set([
    ...loadSourceRegistrySync().map((source) => `eu:${source.celex}`),
    ...loadCssfSourceRegistrySync().map(
      (source) => `lu:cssf:${source.localId}`,
    ),
    ...loadEbaSourceRegistrySync().map((source) => source.documentId),
  ]);
}

describe("reviewed document Expression metadata", () => {
  it("covers every registered source without an unspecified text kind", () => {
    const dataset = loadDocumentExpressionMetadataDataset();
    const registered = registeredDocumentIds();
    const selected = selectDocumentExpressionMetadata(registered, dataset);

    expect(selected).toHaveLength(57);
    expect(new Set(selected.map((record) => record.documentId))).toEqual(
      registered,
    );
    expect(selected.every((record) => record.issuers.length > 0)).toBe(true);
  });

  it("distinguishes reviewed consolidated AML text from historical original-OJ text", () => {
    const records = new Map(
      loadDocumentExpressionMetadataDataset().records.map((record) => [
        record.documentId,
        record,
      ]),
    );

    expect(records.get("eu:32015L0849")).toMatchObject({
      textKind: "consolidated",
      currencyStatus: "current",
      fallbackReason: null,
    });
    expect(records.get("eu:32016R1675")).toMatchObject({
      textKind: "consolidated",
      currencyStatus: "current",
      fallbackReason: null,
    });
    expect(records.get("eu:32013R0575")).toMatchObject({
      textKind: "consolidated",
      currencyStatus: "current",
      fallbackReason: null,
    });
    expect(records.get("eu:32024R1623")).toMatchObject({
      textKind: "original_oj",
      currencyStatus: "historical",
      fallbackReason: "no_reviewed_consolidated_expression_loaded",
    });
    expect(records.get("eu:32024L1619")).toMatchObject({
      textKind: "original_oj",
      currencyStatus: "not_assessed",
      fallbackReason: "no_reviewed_consolidated_expression_loaded",
    });
    expect(records.get("lu:cssf:circular-12-552")).toMatchObject({
      textKind: "consolidated",
      fallbackReason: null,
    });
  });
});
