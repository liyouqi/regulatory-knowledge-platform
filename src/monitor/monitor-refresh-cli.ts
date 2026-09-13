import { refreshMonitor, refreshMonitorYear } from "./monitor-refresh";

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const requestedYear = option("--year");
const requestedMonth = option("--month");
const currentYear = new Date().toISOString().slice(0, 4);
const outputDirectory = option("--output");
const onProgress = (message: string) => console.log(message);

if (requestedYear && requestedMonth) {
  console.error("Use either --year or --month, not both");
  process.exitCode = 1;
} else if (requestedYear && requestedYear !== currentYear) {
  console.error(
    `Monitor refresh is limited to the current year (${currentYear})`,
  );
  process.exitCode = 1;
} else if (requestedMonth && !requestedMonth.startsWith(`${currentYear}-`)) {
  console.error(
    `Monitor refresh is limited to the current year (${currentYear})`,
  );
  process.exitCode = 1;
} else if (!requestedMonth) {
  const year = requestedYear ?? currentYear;
  void refreshMonitorYear({
    year,
    outputDirectory,
    onProgress,
  }).then((feeds) => {
    const events = feeds.reduce((total, feed) => total + feed.events.length, 0);
    const enriched = feeds.reduce(
      (total, feed) => total + (feed.enrichment?.completed ?? 0),
      0,
    );
    const failed = feeds.reduce(
      (total, feed) => total + (feed.enrichment?.failed ?? 0),
      0,
    );
    console.log(
      `Monitor year refresh complete: ${events} events across ${feeds.length} months for ${year}`,
    );
    console.log(
      `AI enrichment: ${enriched} completed, ${failed} kept as basic entries`,
    );
  }, reportFailure);
} else {
  const month = requestedMonth;
  void refreshMonitor({ month, outputDirectory, onProgress }).then((feed) => {
    console.log(
      `Monitor refresh complete: ${feed.events.length} events for ${feed.month} (${feed.sources.map((source) => `${source.source}: ${source.eventCount}`).join(", ")})`,
    );
    console.log(
      feed.enrichment?.mode === "configured-ai"
        ? `AI enrichment: ${feed.enrichment.completed} completed, ${feed.enrichment.failed} kept as basic entries`
        : "AI enrichment: skipped because PRIVATE_AI_* is not configured",
    );
  }, reportFailure);
}

function reportFailure(error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
