import {
  Component,
  type ErrorInfo,
  type ReactNode,
  Suspense,
  lazy,
  useEffect,
} from "react";
import type { EarthNebulaRendererProps } from "./renderers/nebula/EarthNebulaRenderer";

const EarthNebulaRenderer = lazy(async () => {
  const module = await import("./renderers/nebula/EarthNebulaRenderer");
  return { default: module.EarthNebulaRenderer };
});

type EarthGraphViewProps = EarthNebulaRendererProps;

class EarthRendererBoundary extends Component<
  { children: ReactNode; onUnavailable(): void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    console.error("Earth WebGL renderer failed", error);
    this.props.onUnavailable();
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
    const context = canvas.getContext("webgl2");
    context?.getExtension("WEBGL_lose_context")?.loseContext();
    return Boolean(context);
  } catch {
    return false;
  }
}

export function EarthGraphView(props: EarthGraphViewProps) {
  useEffect(() => {
    if (!supportsWebGl()) props.onUnavailable();
  }, [props.onUnavailable]);
  return (
    <EarthRendererBoundary onUnavailable={props.onUnavailable}>
      <Suspense
        fallback={<p className="earth-loading">Opening your universe…</p>}
      >
        <EarthNebulaRenderer {...props} />
      </Suspense>
    </EarthRendererBoundary>
  );
}
