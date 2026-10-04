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

    expect(selected).toHaveLength(59);
    expect(new Set(selected.map((record) => record.documentId))).toEqual(
      registered,
    );
    expect(selected.every((record) => record.issuers.length > 0)).toBe(true);
    for (const documentId of [
      "eu:32013R1024",
      "eu:32015R0751",
      "eu:32025R0454",
      "eu:32026R1755",
    ]) {
      expect(
        selected.find((record) => record.documentId === documentId),
      ).toMatchObject({
        textKind: "original_oj",
        currencyStatus: "not_assessed",
        fallbackReason: "no_reviewed_consolidated_expression_loaded",
      });
    }
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
    for (const celex of [
      "32009L0110",
      "32017R2402",
      "32019L2162",
      "32002L0047",
      "31998L0026",
      "32010R1093",
      "32001L0024",
      "32014L0065",
      "32014R0600",
      "32012R0648",
      "32014R0909",
    ]) {
      expect(records.get(`eu:${celex}`)).toMatchObject({
        textKind: "consolidated",
        currencyStatus: "current",
        fallbackReason: null,
      });
    }
    expect(records.get("eu:32019R2160")).toMatchObject({
      textKind: "original_oj",
      currencyStatus: "historical",
      fallbackReason: "no_reviewed_consolidated_expression_loaded",
    });
    expect(records.get("lu:cssf:circular-12-552")).toMatchObject({
      textKind: "consolidated",
      fallbackReason: null,
    });
  });
});
