import {
  Component,
  type ErrorInfo,
  type ReactNode,
  Suspense,
  lazy,
} from "react";
import type { EarthRenderModel } from "./render-model";

const EarthReagraphRenderer = lazy(async () => {
  const module = await import("./renderers/reagraph/EarthReagraphRenderer");
  return { default: module.EarthReagraphRenderer };
});

interface EarthGraphViewProps {
  model: EarthRenderModel;
  selectedNodeId?: string;
  onSelectNode(id: string): void;
  onSelectEdge(id: string): void;
}

class EarthRendererBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    console.error("Earth WebGL renderer failed", error);
  }

  render() {
    return this.state.failed ? (
      <output className="earth-renderer-fallback">
        <strong>Graph view is unavailable.</strong>
        <span>Use Structured view for the same laws and relationships.</span>
      </output>
    ) : (
      this.props.children
    );
  }
}

function supportsWebGl(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export function EarthGraphView(props: EarthGraphViewProps) {
  if (!supportsWebGl()) {
    return (
      <output className="earth-renderer-fallback">
        <strong>WebGL is unavailable.</strong>
        <span>Use Structured view for the same laws and relationships.</span>
      </output>
    );
  }
  return (
    <EarthRendererBoundary>
      <Suspense fallback={<p className="earth-loading">Opening graph…</p>}>
        <EarthReagraphRenderer {...props} />
      </Suspense>
    </EarthRendererBoundary>
  );
}
