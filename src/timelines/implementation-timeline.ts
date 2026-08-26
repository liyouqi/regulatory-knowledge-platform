import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import {
  implementationTimelineEventTypeSchema,
  timelineDateBasisSchema,
} from "../shared/implementation-timeline";
import type { BodyBlock, DocumentView, ProvisionView } from "../shared/legal";

export const IMPLEMENTATION_TIMELINE_BUILDER = "implementation-timeline";
export const IMPLEMENTATION_TIMELINE_BUILDER_VERSION = "1.0.0";
export const DEFAULT_IMPLEMENTATION_TIMELINES_PATH = resolve(
  process.cwd(),
  "data/official-metadata/implementation-timelines.json",
);

const derivationSchema = z
  .object({
    method: z.literal("calendar-days-after-publication"),
    baseDate: z.string().date(),
    days: z.number().int().positive(),
  })
  .strict();

const eventInputSchema = z
  .object({
    id: z.string().startsWith("timeline-event:"),
    eventType: implementationTimelineEventTypeSchema,
    date: z.string().date(),
    label: z.string().min(1),
    scopeLabel: z.string().min(1),
    dateBasis: timelineDateBasisSchema,
    sourceEntityId: z.string().min(1),
    evidenceText: z.string().min(1),
    evidenceLocator: z.string().min(1).optional(),
    sourceUrl: z.string().url(),
    derivation: derivationSchema.optional(),
  })
  .strict();

const timelineDatasetSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    id: z.literal("implementation-timelines"),
    version: z.string().min(1),
    reviewedAt: z.string().datetime(),
    timelines: z.array(
      z
        .object({
          id: z.string().startsWith("timeline:"),
          documentId: z.string().min(1),
          events: z.array(eventInputSchema).min(1),
        })
        .strict(),
    ),
  })
  .strict();

export type ImplementationTimelineDataset = z.infer<
  typeof timelineDatasetSchema
>;

export interface BuiltTimelineEvent {
  timelineId: string;
  timelineVersion: string;
  id: string;
  documentId: string;
  eventType: z.infer<typeof implementationTimelineEventTypeSchema>;
  date: string;
  label: string;
  scopeLabel: string;
  dateBasis: z.infer<typeof timelineDateBasisSchema>;
  sourceEntityId: string;
  sourceLabel: string;
  sourcePath: string;
  sourceLocatorKind: string | null;
  sourceLocatorValue: string | null;
  evidenceText: string;
  evidenceLocator: string;
  sourceUrl: string;
  derivation: z.infer<typeof derivationSchema> | null;
  provenance: "LEGAL_TEXT" | "OFFICIAL_METADATA" | "DERIVED";
  reviewStatus: "reviewed";
  reviewedAt: string;
  builderMethod: typeof IMPLEMENTATION_TIMELINE_BUILDER;
  builderVersion: typeof IMPLEMENTATION_TIMELINE_BUILDER_VERSION;
}

type ResolvedSource = {
  text?: string;
  label: string;
  path: string;
  locator?: { kind: string; value: string };
};

const MONTHS = new Map([
  ["january", 1],
  ["february", 2],
  ["march", 3],
  ["april", 4],
  ["may", 5],
  ["june", 6],
  ["july", 7],
  ["august", 8],
  ["september", 9],
  ["october", 10],
  ["november", 11],
  ["december", 12],
]);

function resolveBlock(
  provision: ProvisionView,
  blocks: BodyBlock[],
  entityId: string,
): ResolvedSource | null {
  for (const block of blocks) {
    if (block.id === entityId) {
      return {
        text: block.text,
        label: [provision.label, block.marker].filter(Boolean).join(" · "),
        path: `${provision.path}#${block.anchor}`,
        locator: block.sourceLocator,
      };
    }
    const nested = resolveBlock(provision, block.children, entityId);
    if (nested) return nested;
  }
  return null;
}

function resolveSource(
  document: DocumentView,
  entityId: string,
): ResolvedSource | null {
  if (entityId === document.id) {
    return {
      label: document.shortName,
      path: `/explore/${document.slug}`,
    };
  }
  for (const provision of document.provisions) {
    if (provision.id === entityId) {
      return {
        label: provision.label,
        path: provision.path,
        locator: provision.sourceLocator,
      };
    }
    const block = resolveBlock(provision, provision.blocks, entityId);
    if (block) return block;
  }
  return null;
}

function addUtcDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function calendarDayOffset(text: string): number | null {
  const numeric = /\b(\d+)(?:st|nd|rd|th) day\b/iu.exec(text);
  if (numeric?.[1]) return Number.parseInt(numeric[1], 10);
  const wordOffsets = new Map([
    ["tenth", 10],
    ["twentieth", 20],
    ["thirtieth", 30],
  ]);
  const word = /\b([A-Za-z]+) day\b/iu.exec(text)?.[1]?.toLowerCase();
  return word ? (wordOffsets.get(word) ?? null) : null;
}

function explicitEnglishDates(text: string): string[] {
  return [...text.matchAll(/\b(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b/gu)].flatMap(
    (match) => {
      const month = MONTHS.get(match[2]?.toLowerCase() ?? "");
      if (!month) return [];
      return [
        `${match[3]}-${String(month).padStart(2, "0")}-${String(match[1]).padStart(2, "0")}`,
      ];
    },
  );
}

export function loadImplementationTimelineDataset(
  path = DEFAULT_IMPLEMENTATION_TIMELINES_PATH,
): ImplementationTimelineDataset {
  return timelineDatasetSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

export function buildImplementationTimelineEvents(
  documents: DocumentView[],
  dataset = loadImplementationTimelineDataset(),
): BuiltTimelineEvent[] {
  const documentById = new Map(
    documents.map((document) => [document.id, document]),
  );
  const events: BuiltTimelineEvent[] = [];
  const ids = new Set<string>();
  const timelineIds = new Set<string>();
  const timelineDocumentIds = new Set<string>();

  for (const timeline of dataset.timelines) {
    if (timelineIds.has(timeline.id)) {
      throw new Error(`Duplicate implementation timeline ${timeline.id}`);
    }
    if (timelineDocumentIds.has(timeline.documentId)) {
      throw new Error(
        `Multiple implementation timelines for ${timeline.documentId}`,
      );
    }
    timelineIds.add(timeline.id);
    timelineDocumentIds.add(timeline.documentId);
    const document = documentById.get(timeline.documentId);
    if (!document) continue;
    for (const event of timeline.events) {
      if (ids.has(event.id))
        throw new Error(`Duplicate timeline event ${event.id}`);
      ids.add(event.id);
      if (event.sourceUrl !== document.sourceUrl) {
        throw new Error(`Timeline source URL drift for ${event.id}`);
      }
      const source = resolveSource(document, event.sourceEntityId);
      if (!source)
        throw new Error(
          `Timeline source entity not found: ${event.sourceEntityId}`,
        );

      if (event.dateBasis === "official-metadata") {
        if (
          event.sourceEntityId !== document.id ||
          event.date !== document.asOf ||
          event.evidenceText !== document.asOf ||
          !event.evidenceLocator ||
          event.derivation
        ) {
          throw new Error(
            `Timeline publication metadata drift for ${event.id}`,
          );
        }
      } else {
        if (source.text !== event.evidenceText) {
          throw new Error(`Timeline legal-text evidence drift for ${event.id}`);
        }
        if (event.dateBasis === "explicit-legal-text") {
          if (
            !explicitEnglishDates(event.evidenceText).includes(event.date) ||
            event.derivation
          ) {
            throw new Error(`Timeline explicit date drift for ${event.id}`);
          }
        } else {
          if (
            !event.derivation ||
            event.derivation.baseDate !== document.asOf ||
            calendarDayOffset(event.evidenceText) !== event.derivation.days ||
            addUtcDays(event.derivation.baseDate, event.derivation.days) !==
              event.date
          ) {
            throw new Error(`Timeline derived date drift for ${event.id}`);
          }
        }
      }

      events.push({
        timelineId: timeline.id,
        timelineVersion: dataset.version,
        id: event.id,
        documentId: document.id,
        eventType: event.eventType,
        date: event.date,
        label: event.label,
        scopeLabel: event.scopeLabel,
        dateBasis: event.dateBasis,
        sourceEntityId: event.sourceEntityId,
        sourceLabel: source.label,
        sourcePath: source.path,
        sourceLocatorKind: source.locator?.kind ?? null,
        sourceLocatorValue: source.locator?.value ?? null,
        evidenceText: event.evidenceText,
        evidenceLocator:
          event.evidenceLocator ?? `${event.sourceEntityId}:text`,
        sourceUrl: event.sourceUrl,
        derivation: event.derivation ?? null,
        provenance:
          event.dateBasis === "official-metadata"
            ? "OFFICIAL_METADATA"
            : event.dateBasis === "calculated-from-publication"
              ? "DERIVED"
              : "LEGAL_TEXT",
        reviewStatus: "reviewed",
        reviewedAt: dataset.reviewedAt,
        builderMethod: IMPLEMENTATION_TIMELINE_BUILDER,
        builderVersion: IMPLEMENTATION_TIMELINE_BUILDER_VERSION,
      });
    }
  }
  return events.sort(
    (left, right) =>
      left.date.localeCompare(right.date) || left.id.localeCompare(right.id),
  );
}
