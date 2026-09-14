import { describe, expect, it } from "vitest";
import type { MonitorEvent, MonitorTimeline } from "./monitor-contract";
import { createMonthlyMonitorReport } from "./monitor-report";

function event(
  id: string,
  date: string,
  topic: string,
  authority: MonitorEvent["source"]["authority"],
): MonitorEvent {
  return {
    id,
    source: {
      authority,
      title: id,
      url: `https://example.test/${id}`,
      publishedAt: date,
    },
    classification: {
      topic,
      eventType: "Publication",
      affectedEntities: ["Financial entities"],
    },
    analysis: {
      summary: `${id} summary`,
      keyPoints: [],
      importantDates: [{ label: "Applies", date }],
      potentiallyAffectedFunctions: ["Compliance"],
    },
  };
}

describe("Monthly Monitor report", () => {
  it("groups one month by topic and computes a compact snapshot", () => {
    const timeline: MonitorTimeline = {
      schemaVersion: "monitor-timeline@1.0.0",
      year: "2026",
      generatedAt: "2026-09-14T08:00:00.000Z",
      sources: [],
      events: [
        event("older", "2026-09-01", "Governance", "CSSF"),
        event("newer", "2026-09-10", "Governance", "EBA"),
        event("other", "2026-08-31", "Regulatory update", "ESMA"),
      ],
    };
    const report = createMonthlyMonitorReport(timeline, "2026-09");
    expect(report.events.map((item) => item.id)).toEqual(["newer", "older"]);
    expect(report).toMatchObject({
      authorityCount: 2,
      topicCount: 1,
      importantDateCount: 2,
    });
    expect(report.sections[0]?.events).toHaveLength(2);
  });

  it("rejects ambiguous report periods", () => {
    expect(() =>
      createMonthlyMonitorReport(
        {
          schemaVersion: "monitor-timeline@1.0.0",
          year: "2026",
          generatedAt: "2026-09-14T08:00:00.000Z",
          sources: [],
          events: [],
        },
        "all",
      ),
    ).toThrow("YYYY-MM");
  });
});
