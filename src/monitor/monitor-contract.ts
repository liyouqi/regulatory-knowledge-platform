export type MonitorSource = "EUR-Lex" | "CSSF" | "EBA";

export type MonitorEvent = {
  id: string;
  source: {
    authority: MonitorSource;
    title: string;
    url: string;
    publishedAt: string;
    reference?: string;
  };
  classification: {
    topic: string;
    eventType: "Publication";
    status?: string;
    affectedEntities: string[];
  };
  analysis: {
    summary?: string;
    keyPoints: string[];
    businessTakeaways?: string[];
    suggestedActions?: string[];
    importantDates?: Array<{
      label: string;
      date: string;
    }>;
    potentiallyAffectedFunctions: string[];
  };
};

export type MonitorAiMessage = {
  role: "user" | "assistant";
  text: string;
};

export type MonitorExplainResponse = {
  answer: string;
  eventId: string;
  sourceUrl: string;
};

export type MonitorSourceStatus = {
  source: MonitorSource;
  url: string;
  eventCount: number;
  error?: string;
};

export type MonitorFeed = {
  schemaVersion: "monitor-feed@1.0.0";
  month: string;
  generatedAt: string;
  sources: MonitorSourceStatus[];
  events: MonitorEvent[];
};
