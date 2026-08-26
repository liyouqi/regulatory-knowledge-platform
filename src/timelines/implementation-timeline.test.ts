import { describe, expect, it } from "vitest";
import { loadDocumentViews } from "../data/document-repository";
import {
  buildImplementationTimelineEvents,
  loadImplementationTimelineDataset,
} from "./implementation-timeline";

describe("reviewed implementation timeline", () => {
  it("builds the six evidence-checked AI Act milestones", () => {
    const events = buildImplementationTimelineEvents(
      loadDocumentViews(),
      loadImplementationTimelineDataset(),
    );

    expect(events).toHaveLength(6);
    expect(events.map((event) => event.date)).toEqual([
      "2024-07-12",
      "2024-08-01",
      "2025-02-02",
      "2025-08-02",
      "2026-08-02",
      "2027-08-02",
    ]);
    expect(events[1]).toMatchObject({
      eventType: "entry-into-force",
      dateBasis: "calculated-from-publication",
      provenance: "DERIVED",
      derivation: {
        method: "calendar-days-after-publication",
        baseDate: "2024-07-12",
        days: 20,
      },
    });
    expect(events[2]).toMatchObject({
      sourceEntityId: "eu:32024R1689:article:113:subparagraph:3:point:a",
      sourceLocatorKind: "xpath",
      provenance: "LEGAL_TEXT",
    });
  });

  it("fails closed when an explicit legal date no longer matches its evidence", () => {
    const dataset = structuredClone(loadImplementationTimelineDataset());
    const event = dataset.timelines[0]?.events[2];
    if (!event) throw new Error("Timeline fixture is incomplete");
    event.date = "2025-02-03";

    expect(() =>
      buildImplementationTimelineEvents(loadDocumentViews(), dataset),
    ).toThrow("Timeline explicit date drift");
  });

  it("fails closed when a derived offset contradicts the legal-text rule", () => {
    const dataset = structuredClone(loadImplementationTimelineDataset());
    const event = dataset.timelines[0]?.events[1];
    if (!event?.derivation) throw new Error("Timeline fixture is incomplete");
    event.derivation.days = 19;
    event.date = "2024-07-31";

    expect(() =>
      buildImplementationTimelineEvents(loadDocumentViews(), dataset),
    ).toThrow("Timeline derived date drift");
  });
});
