import { refreshMonitor } from "./monitor-refresh";

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const month = option("--month") ?? new Date().toISOString().slice(0, 7);

void refreshMonitor({ month, outputDirectory: option("--output") }).then(
  (feed) => {
    console.log(
      `Monitor refresh complete: ${feed.events.length} events for ${feed.month} (${feed.sources.map((source) => `${source.source}: ${source.eventCount}`).join(", ")})`,
    );
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  },
);
