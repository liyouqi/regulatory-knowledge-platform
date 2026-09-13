import { z } from "zod";
import type { PrivateAiConfig } from "../copilot/providers/private-ai-config";
import { requestMonitorAi } from "./monitor-ai";
import type { MonitorEvent } from "./monitor-contract";

const enrichmentSchema = z.object({
  summary: z.string().trim().min(1),
  key_points: z.array(z.string().trim().min(1)),
  business_takeaways: z.array(z.string().trim().min(1)),
  suggested_actions: z.array(z.string().trim().min(1)),
  topic: z.string().trim().min(1),
  status: z.string().trim().min(1).nullable(),
  affected_entities: z.array(z.string().trim().min(1)),
  potentially_affected_functions: z.array(z.string().trim().min(1)),
  important_dates: z.array(
    z.object({
      label: z.string().trim().min(1),
      date: z.string().trim(),
    }),
  ),
});

export const MONITOR_ENRICHMENT_PROMPT = [
  "You are preparing a regulatory change brief for compliance, legal, risk, operations, finance, reporting, technology, product, and governance teams in European financial services.",
  "Use only SOURCE_MATERIAL. It may contain website navigation or promotional text; ignore those parts.",
  "The reader needs to know what the publication is, whether it changes an existing requirement or merely communicates guidance/reporting findings, who may be affected, dates that drive action, operational implications, and the next sensible internal checks.",
  "Distinguish binding legislation, delegated or implementing acts, consultations, supervisory guidance, reports, speeches, and procedure updates. Do not describe a report, consultation, or guidance item as a new binding obligation.",
  "Say that something changed only when the material supports a before/after comparison. Otherwise describe key points without inventing a previous position.",
  "Keep publication date, effective date, application date, response deadline, and transitional deadline distinct. Include an important date only when explicitly supported.",
  "Affected entities must be concrete business populations, not vague phrases such as everyone. Potentially affected functions must be recognizable internal teams.",
  "Business takeaways should explain practical relevance: governance, reporting, data, controls, disclosures, capital, AML/CFT, customer journeys, technology, outsourcing, or third-party arrangements.",
  "Suggested actions are conservative review steps, not invented legal duties. Never make a final applicability determination or provide legal advice.",
  "Choose exactly one topic from: Prudential & capital; Supervisory reporting; ICT & operational resilience; Resolution & MREL; AML & financial crime; Consumer protection; Sustainable finance; Market infrastructure; Governance; Regulatory update.",
  "Write concise English. The summary should directly identify the publication and its main significance in the first sentence.",
  'Return only JSON: {"summary":"...","key_points":["..."],"business_takeaways":["..."],"suggested_actions":["..."],"topic":"...","status":null,"affected_entities":["..."],"potentially_affected_functions":["..."],"important_dates":[{"label":"...","date":"YYYY-MM-DD"}]}. Use a concise status string instead of null only when the source supports it.',
].join("\n");

function normaliseTopic(value: string): string {
  const topic = value.toLowerCase();
  if (/reporting|finrep|corep|data point|validation rule/.test(topic))
    return "Supervisory reporting";
  if (/dora|ict|cyber|digital|operational resilience|third.party/.test(topic))
    return "ICT & operational resilience";
  if (/resolution|mrel|bail.in/.test(topic)) return "Resolution & MREL";
  if (/money laundering|aml|financial crime|sanction/.test(topic))
    return "AML & financial crime";
  if (/consumer|deposit guarantee|customer/.test(topic))
    return "Consumer protection";
  if (/sustainab|climate|environment|esg/.test(topic))
    return "Sustainable finance";
  if (/market|emir|margin|clearing|securiti/.test(topic))
    return "Market infrastructure";
  if (/governance|fit and proper|remuneration/.test(topic)) return "Governance";
  if (/capital|prudential|crr|crd|liquidity/.test(topic))
    return "Prudential & capital";
  return "Regulatory update";
}

function extractJson(content: string): unknown {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/u, "")
    .replace(/\s*```$/u, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  return JSON.parse(
    start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned,
  );
}

export class MonitorEnrichmentService {
  constructor(private readonly config: PrivateAiConfig) {}

  async enrich(event: MonitorEvent, sourceText: string): Promise<MonitorEvent> {
    const answer = await requestMonitorAi(
      this.config,
      MONITOR_ENRICHMENT_PROMPT,
      JSON.stringify({
        source: event.source,
        listing_summary: event.analysis.summary,
        source_material: sourceText.slice(0, 24_000),
      }),
    );
    const enriched = enrichmentSchema.parse(extractJson(answer));
    const importantDates = enriched.important_dates
      .filter((item) => /^20\d{2}-\d{2}-\d{2}$/.test(item.date))
      .slice(0, 5)
      .map((item) => ({
        label: item.label.slice(0, 160),
        date: item.date,
      }));
    return {
      ...event,
      classification: {
        ...event.classification,
        topic: normaliseTopic(enriched.topic),
        ...(enriched.status ? { status: enriched.status.slice(0, 100) } : {}),
        affectedEntities: enriched.affected_entities
          .slice(0, 6)
          .map((item) => item.slice(0, 120)),
      },
      analysis: {
        summary: enriched.summary.slice(0, 900),
        keyPoints: enriched.key_points
          .slice(0, 4)
          .map((item) => item.slice(0, 700)),
        businessTakeaways: enriched.business_takeaways
          .slice(0, 3)
          .map((item) => item.slice(0, 700)),
        suggestedActions: enriched.suggested_actions
          .slice(0, 3)
          .map((item) => item.slice(0, 700)),
        ...(importantDates.length > 0 ? { importantDates } : {}),
        potentiallyAffectedFunctions: enriched.potentially_affected_functions
          .slice(0, 6)
          .map((item) => item.slice(0, 120)),
      },
    };
  }
}
