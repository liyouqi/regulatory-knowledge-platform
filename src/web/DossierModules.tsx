import { ArrowDown, ArrowRight, CircleAlert, Network } from "lucide-react";
import { useMemo } from "react";
import type {
  DossierPresentation,
  RegulatoryDossier,
} from "../shared/regulatory-dossier";

interface DossierModuleProps {
  dossier: RegulatoryDossier;
  activeSectionId: string;
  onSelect: (sectionId: string) => void;
}

function sectionTitle(dossier: RegulatoryDossier, sectionId: string): string {
  return (
    dossier.sections.find((section) => section.id === sectionId)?.title ??
    sectionId
  );
}

function IncidentFlowModule({
  dossier,
  activeSectionId,
  onSelect,
}: DossierModuleProps) {
  if (dossier.presentation.kind !== "incident-flow") return null;
  const labels: Record<
    DossierPresentation & { kind: "incident-flow" } extends {
      items: Array<infer Item>;
    }
      ? Item extends { stage: infer Stage }
        ? Stage & string
        : never
      : never,
    string
  > = {
    boundary: "Event boundary",
    thresholds: "Major thresholds",
    impact: "Economic impact",
    reporting: "Reporting route",
  };
  return (
    <section className="dossier-module incident-flow-module">
      <header>
        <span>GUIDED EVIDENCE PATH</span>
        <p>Navigation only — not an incident-classification decision.</p>
      </header>
      <div className="incident-flow-track">
        {dossier.presentation.items.map((item, index) => (
          <div className="incident-flow-step" key={item.sectionId}>
            <button
              aria-pressed={activeSectionId === item.sectionId}
              className={activeSectionId === item.sectionId ? "active" : ""}
              onClick={() => onSelect(item.sectionId)}
              type="button"
            >
              <small>0{index + 1}</small>
              <strong>{labels[item.stage]}</strong>
              <span>{sectionTitle(dossier, item.sectionId)}</span>
            </button>
            {index < dossier.presentation.items.length - 1 ? (
              <ArrowRight aria-hidden="true" size={17} />
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function ServiceChainModule({
  dossier,
  activeSectionId,
  onSelect,
}: DossierModuleProps) {
  if (dossier.presentation.kind !== "service-chain") return null;
  const activeItem =
    dossier.presentation.items.find(
      (item) => item.sectionId === activeSectionId,
    ) ?? dossier.presentation.items[0];
  const stateLabels = {
    "direct-ict": "Direct ICT service",
    "non-ict-subcontractor": "Non-ICT chain default",
    reassessment: "Critical-function reassessment",
  } as const;
  const lastNode = {
    "direct-ict": "Service tested against Article 3(21)",
    "non-ict-subcontractor": "ICT subcontractor · normally outside",
    reassessment: "Equivalent ICT support · reassess boundary",
  } as const;
  return (
    <section className="dossier-module service-chain-module">
      <header>
        <span>
          <Network aria-hidden="true" size={15} /> SERVICE-CHAIN MAP
        </span>
        <p>Switch the factual pattern to inspect its source-backed boundary.</p>
      </header>
      <div className="service-chain-scenarios" role="tablist">
        {dossier.presentation.items.map((item, index) => (
          <button
            aria-pressed={activeSectionId === item.sectionId}
            className={activeSectionId === item.sectionId ? "active" : ""}
            key={item.sectionId}
            onClick={() => onSelect(item.sectionId)}
            role="tab"
            type="button"
          >
            <small>Scenario {index + 1}</small>
            <strong>{stateLabels[item.state]}</strong>
          </button>
        ))}
      </div>
      <div className={`service-chain-visual state-${activeItem.state}`}>
        <div>
          <small>01</small>
          <strong>Financial entity</strong>
        </div>
        <ArrowDown aria-hidden="true" size={18} />
        <div>
          <small>02</small>
          <strong>
            {activeItem.state === "direct-ict"
              ? "Direct service / provider"
              : "Direct non-ICT service / provider"}
          </strong>
        </div>
        <ArrowDown aria-hidden="true" size={18} />
        <div className="chain-boundary-node">
          <small>BOUNDARY</small>
          <strong>{lastNode[activeItem.state]}</strong>
        </div>
      </div>
    </section>
  );
}

function RegisterDutyBoardModule({
  dossier,
  activeSectionId,
  onSelect,
}: DossierModuleProps) {
  if (dossier.presentation.kind !== "register-duty-board") return null;
  const items = dossier.presentation.items;
  const activeItem =
    items.find((item) => item.sectionId === activeSectionId) ?? items[0];
  const activeView = activeItem.view;
  const views = ["duties", "perimeter", "package"] as const;
  const viewLabels = {
    duties: "Duty board",
    perimeter: "Who and perimeter",
    package: "Submission package",
  } as const;
  const cadenceLabels = {
    continuous: "Continuous",
    annual: "Annual",
    "on-request": "On request",
    "event-driven": "Event-driven",
    "source-dated": "Source-dated",
  } as const;
  const visibleItems = items.filter((item) => item.view === activeView);
  return (
    <section className="dossier-module register-duty-module">
      <header>
        <span>OPERATING DUTY BOARD</span>
        <p>Separate recurring, requested and event-triggered obligations.</p>
      </header>
      <nav aria-label="Register views" className="register-duty-tabs">
        {views.map((view) => {
          const first = items.find((item) => item.view === view);
          return first ? (
            <button
              aria-pressed={activeView === view}
              className={activeView === view ? "active" : ""}
              key={view}
              onClick={() => onSelect(first.sectionId)}
              type="button"
            >
              {viewLabels[view]}
            </button>
          ) : null;
        })}
      </nav>
      <div className="register-duty-grid">
        {visibleItems.map((item) => (
          <button
            aria-pressed={activeSectionId === item.sectionId}
            className={activeSectionId === item.sectionId ? "active" : ""}
            key={item.sectionId}
            onClick={() => onSelect(item.sectionId)}
            type="button"
          >
            <small>{cadenceLabels[item.cadence]}</small>
            <strong>{sectionTitle(dossier, item.sectionId)}</strong>
            {item.cadence === "source-dated" ? (
              <CircleAlert aria-hidden="true" size={16} />
            ) : (
              <ArrowRight aria-hidden="true" size={16} />
            )}
          </button>
        ))}
      </div>
    </section>
  );
}

export function DossierModuleRenderer(props: DossierModuleProps) {
  const component = useMemo(() => {
    switch (props.dossier.presentation.kind) {
      case "incident-flow":
        return <IncidentFlowModule {...props} />;
      case "service-chain":
        return <ServiceChainModule {...props} />;
      case "register-duty-board":
        return <RegisterDutyBoardModule {...props} />;
    }
  }, [props]);
  return component;
}
