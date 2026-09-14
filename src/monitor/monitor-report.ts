import type { MonitorEvent, MonitorTimeline } from "./monitor-contract";

export type MonthlyMonitorReport = {
  month: string;
  generatedAt: string;
  events: MonitorEvent[];
  authorityCount: number;
  topicCount: number;
  importantDateCount: number;
  sections: Array<{
    topic: string;
    events: MonitorEvent[];
  }>;
};

export function createMonthlyMonitorReport(
  timeline: MonitorTimeline,
  month: string,
): MonthlyMonitorReport {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error("Monthly Monitor report requires YYYY-MM");
  }
  const events = timeline.events
    .filter((event) => event.source.publishedAt.startsWith(month))
    .sort((left, right) =>
      right.source.publishedAt.localeCompare(left.source.publishedAt),
    );
  const sectionMap = new Map<string, MonitorEvent[]>();
  for (const event of events) {
    const section = sectionMap.get(event.classification.topic) ?? [];
    section.push(event);
    sectionMap.set(event.classification.topic, section);
  }
  const sections = [...sectionMap.entries()]
    .map(([topic, sectionEvents]) => ({ topic, events: sectionEvents }))
    .sort(
      (left, right) =>
        right.events.length - left.events.length ||
        left.topic.localeCompare(right.topic),
    );
  return {
    month,
    generatedAt: timeline.generatedAt,
    events,
    authorityCount: new Set(events.map((event) => event.source.authority)).size,
    topicCount: sections.length,
    importantDateCount: events.reduce(
      (count, event) => count + (event.analysis.importantDates?.length ?? 0),
      0,
    ),
    sections,
  };
}
