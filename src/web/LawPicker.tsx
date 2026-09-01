import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { DocumentSummary } from "../shared/legal";

export interface LawPickerGroup {
  familyId: string;
  label: string;
  documents: DocumentSummary[];
}

const FAMILY_LABELS: Record<string, string> = {
  "family:ai-act": "AI Act",
  "family:aml": "AML / CFT",
  "family:crd": "Banking governance",
  "family:data-act": "Data Act",
  "family:dora": "DORA",
  "family:gdpr": "GDPR",
  "family:mica": "MiCA",
  "family:nis2": "NIS2",
  "family:cssf": "CSSF",
};

const LEVEL_ORDER: Record<DocumentSummary["regulatoryLevel"], number> = {
  "level-1": 0,
  "level-2": 1,
  "level-3": 2,
};

const MEASURE_LABELS: Record<DocumentSummary["measureType"], string> = {
  "primary-act": "Primary act",
  rts: "RTS",
  its: "ITS",
  guideline: "Guideline",
  qa: "Q&A",
  other: "Other measure",
};

function familyLabel(familyId: string): string {
  return (
    FAMILY_LABELS[familyId] ??
    familyId
      .replace(/^family:/u, "")
      .split("-")
      .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
      .join(" ")
  );
}

function matchesDocument(document: DocumentSummary, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return true;
  return [
    document.shortName,
    document.officialTitle,
    familyLabel(document.familyId),
    document.measureType,
  ].some((value) => value.toLocaleLowerCase().includes(normalized));
}

export function groupLawPickerCatalog(
  catalog: DocumentSummary[],
  query = "",
): LawPickerGroup[] {
  const groups = new Map<string, DocumentSummary[]>();
  for (const document of catalog) {
    if (!matchesDocument(document, query)) continue;
    const current = groups.get(document.familyId) ?? [];
    current.push(document);
    groups.set(document.familyId, current);
  }
  return [...groups.entries()].map(([familyId, documents]) => ({
    familyId,
    label: familyLabel(familyId),
    documents: [...documents].sort(
      (left, right) =>
        LEVEL_ORDER[left.regulatoryLevel] -
          LEVEL_ORDER[right.regulatoryLevel] ||
        left.shortName.localeCompare(right.shortName),
    ),
  }));
}

function LawPickerFamilyGroup({
  group,
  currentSlug,
  query,
  onChoose,
}: {
  group: LawPickerGroup;
  currentSlug: string;
  query: string;
  onChoose: (document: DocumentSummary) => void;
}) {
  const containsCurrent = group.documents.some(
    (document) => document.slug === currentSlug,
  );
  const [open, setOpen] = useState(containsCurrent);

  useEffect(() => {
    if (query) setOpen(true);
  }, [query]);

  return (
    <details
      className="law-picker-group"
      onToggle={(event) => setOpen(event.currentTarget.open)}
      open={open}
    >
      <summary>
        <span>Family · {group.label}</span>
        <small>{group.documents.length}</small>
      </summary>
      <div>
        {group.documents.map((document) => (
          <button
            aria-current={document.slug === currentSlug ? "page" : undefined}
            className={
              document.slug === currentSlug
                ? "law-picker-option active"
                : "law-picker-option"
            }
            key={document.id}
            onClick={() => onChoose(document)}
            type="button"
          >
            <span>
              <strong>{document.shortName}</strong>
              <small>{MEASURE_LABELS[document.measureType]}</small>
            </span>
            {document.slug === currentSlug ? (
              <Check aria-hidden="true" size={15} />
            ) : null}
          </button>
        ))}
      </div>
    </details>
  );
}

export function LawPicker({
  catalog,
  currentSlug,
  onChoose,
  variant = "reader",
}: {
  catalog: DocumentSummary[];
  currentSlug: string;
  onChoose: (document: DocumentSummary) => void;
  variant?: "reader" | "explorer";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const panelId = useId();
  const current = catalog.find((document) => document.slug === currentSlug);
  const currentFamily = current ? familyLabel(current.familyId) : undefined;
  const groups = useMemo(
    () => groupLawPickerCatalog(catalog, query),
    [catalog, query],
  );

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  function close(): void {
    setOpen(false);
    setQuery("");
  }

  return (
    <div className={`law-picker ${variant}`}>
      <button
        aria-controls={panelId}
        aria-expanded={open}
        className="law-picker-trigger"
        onClick={() => setOpen((currentOpen) => !currentOpen)}
        type="button"
      >
        <span>
          <small>
            {variant === "explorer" ? "ACT EXPLORER" : "REGULATION"}
            {currentFamily ? ` · ${currentFamily}` : ""}
          </small>
          <strong>{current?.shortName ?? "Choose regulation"}</strong>
        </span>
        <ChevronDown aria-hidden="true" size={16} />
      </button>
      {open ? (
        <section
          className="law-picker-panel"
          id={panelId}
          onKeyDown={(event) => {
            if (event.key === "Escape") close();
          }}
        >
          <label className="law-picker-search">
            <Search aria-hidden="true" size={15} />
            <span className="sr-only">Filter regulations</span>
            <input
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Search laws, families, RTS or ITS"
              ref={inputRef}
              type="search"
              value={query}
            />
            {query ? (
              <button
                aria-label="Clear regulation filter"
                onClick={() => setQuery("")}
                type="button"
              >
                <X aria-hidden="true" size={14} />
              </button>
            ) : null}
          </label>
          <div className="law-picker-groups">
            {groups.length > 0 ? (
              groups.map((group) => (
                <LawPickerFamilyGroup
                  currentSlug={currentSlug}
                  key={group.familyId}
                  group={group}
                  onChoose={(document) => {
                    onChoose(document);
                    close();
                  }}
                  query={query}
                />
              ))
            ) : (
              <p className="law-picker-empty">No matching regulation.</p>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
