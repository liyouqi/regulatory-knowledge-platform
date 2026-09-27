import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { EarthNode } from "../../../contract/earth-contract";
import { type EarthDisplay, earthNodeDisplay } from "../../display-tags";
import type { EarthRenderModel, EarthRenderNode } from "../../render-model";
import { motionProgress } from "./motion";
import { layoutNebula } from "./nebula-layout";

export interface NebulaSnapshot {
  model: EarthRenderModel;
  nodes: EarthRenderNode[];
  branch?: { parent: EarthNode; children: EarthNode[] };
  selectedNodeId?: string;
  selectedEdgeId?: string;
  hoveredId: string;
  display?: EarthDisplay;
}
interface SceneBindings {
  snapshot(): NebulaSnapshot;
  labels(): Map<string, HTMLButtonElement>;
  selectNode(id: string): void;
  selectEdge(id: string): void;
  hover(id: string): void;
  unavailable(): void;
}
const GOLD = new THREE.Color("#ebc78c");
const GREY = new THREE.Color("#73808c");
function glowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.15, "rgba(255,255,255,0.55)");
    gradient.addColorStop(0.4, "rgba(255,255,255,0.12)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
  }
  return new THREE.CanvasTexture(canvas);
}

/** One context per mounted view; bounded, batched graphics render only on change. */
export function createNebulaScene(
  host: HTMLDivElement,
  bindings: SceneBindings,
) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute(
    "aria-label",
    "Regulatory nebula. Use arrow keys to rotate. Zoom controls follow the starfield.",
  );
  host.prepend(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 300);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.rotateSpeed = 0.5;
  controls.zoomSpeed = 0.7;
  controls.minDistance = 3;
  controls.maxDistance = 180;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const texture = glowTexture();
  const dotGeometry = new THREE.SphereGeometry(1, 12, 10);
  const glowGeometry = new THREE.PlaneGeometry(1, 1);
  const dotMaterial = new THREE.MeshBasicMaterial();
  const glowMaterial = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const lineMaterial = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const stemMaterial = new THREE.LineDashedMaterial({
    color: GOLD,
    transparent: true,
    opacity: 0.22,
    dashSize: 0.055,
    gapSize: 0.06,
  });
  const starPositions: number[] = [];
  for (let index = 0; index < 280; index++) {
    const angle = index * 2.399963;
    const y = 1 - (2 * (index + 0.5)) / 280;
    const ring = Math.sqrt(1 - y * y);
    starPositions.push(
      Math.cos(angle) * ring * 90,
      y * 90,
      Math.sin(angle) * ring * 90,
    );
  }
  const stars = new THREE.Points(
    new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute(starPositions, 3),
    ),
    new THREE.PointsMaterial({
      color: "#90a4b5",
      size: 0.055,
      transparent: true,
      opacity: 0.4,
    }),
  );
  scene.add(stars);
  let dots: THREE.InstancedMesh | undefined;
  let glows: THREE.InstancedMesh | undefined;
  let lines: THREE.LineSegments | undefined;
  let stems: THREE.LineSegments | undefined;
  let nodes: EarthRenderNode[] = [];
  let positions = new Map<string, THREE.Vector3>();
  const hierarchyPositions = new Map<string, THREE.Vector3>();
  const appearances = new Map<
    string,
    { from: THREE.Vector3; to: THREE.Vector3; started: number }
  >();
  let segments: { edgeId: string; source: string; target: string }[] = [];
  let glowEntries: {
    id: string;
    scale: THREE.Vector3;
    cloud: boolean;
    boundary: boolean;
  }[] = [];
  const brightness = new Map<string, number>();
  const centre = new THREE.Vector3();
  const extent = new THREE.Vector3(8, 5, 3);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();
  let focusAnimation:
    | {
        fromPosition: THREE.Vector3;
        toPosition: THREE.Vector3;
        fromTarget: THREE.Vector3;
        toTarget: THREE.Vector3;
        fromOffset: THREE.Vector2;
        toOffset: THREE.Vector2;
        started: number;
      }
    | undefined;
  const compositionOffset = new THREE.Vector2();
  let viewportWidth = 1;
  let viewportHeight = 1;
  let lastSelected: string | undefined;
  let initialized = false;
  let stopped = false;
  let frame = 0;
  let previousAspect = 0;
  const cameraRoll = () => (host.clientWidth < 620 ? Math.PI * 0.42 : 0);
  const overviewDistance = () =>
    Math.max(
      11,
      ((extent.y * Math.cos(cameraRoll()) + extent.x * Math.sin(cameraRoll())) *
        0.72) /
        Math.tan(THREE.MathUtils.degToRad(21)),
      ((extent.x * Math.cos(cameraRoll()) + extent.y * Math.sin(cameraRoll())) *
        0.65) /
        (Math.tan(THREE.MathUtils.degToRad(21)) * camera.aspect),
    );
  const interruptFocus = () => {
    focusAnimation = undefined;
  };
  const desiredOffset = () =>
    bindings.snapshot().selectedNodeId
      ? new THREE.Vector2(
          viewportWidth > 900 ? 175 : 0,
          viewportWidth <= 900 ? Math.min(160, viewportHeight * 0.22) : 0,
        )
      : new THREE.Vector2(0, viewportWidth < 620 ? -95 : 0);
  const applyComposition = () =>
    camera.setViewOffset(
      viewportWidth,
      viewportHeight,
      compositionOffset.x,
      compositionOffset.y,
      viewportWidth,
      viewportHeight,
    );
  function beginFocus(toPosition: THREE.Vector3, toTarget: THREE.Vector3) {
    const toOffset = desiredOffset();
    if (reducedMotion.matches || !initialized) {
      camera.position.copy(toPosition);
      controls.target.copy(toTarget);
      compositionOffset.copy(toOffset);
      applyComposition();
      interruptFocus();
      controls.update();
    } else {
      focusAnimation = {
        fromPosition: camera.position.clone(),
        toPosition,
        fromTarget: controls.target.clone(),
        toTarget,
        fromOffset: compositionOffset.clone(),
        toOffset,
        started: performance.now(),
      };
    }
    requestRender();
  }
  const reset = () => {
    interruptFocus();
    beginFocus(
      centre
        .clone()
        .add(
          new THREE.Vector3(0, overviewDistance() * 0.12, overviewDistance()),
        ),
      centre.clone(),
    );
  };
  const requestRender = () => {
    if (!stopped && !frame && !document.hidden)
      frame = requestAnimationFrame(render);
  };
  const labelSizes = new WeakMap<
    HTMLButtonElement,
    { width: number; height: number }
  >();
  const observedLabels = new Set<HTMLButtonElement>();
  const labelObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const box = entry.borderBoxSize[0];
      if (box)
        labelSizes.set(entry.target as HTMLButtonElement, {
          width: box.inlineSize,
          height: box.blockSize,
        });
    }
    requestRender();
  });
  const projected = new THREE.Vector3();
  function updateLabels() {
    const labels = bindings.labels();
    const active = new Set(labels.values());
    for (const label of observedLabels) {
      if (!active.has(label)) {
        labelObserver.unobserve(label);
        observedLabels.delete(label);
      }
    }
    // All measurements precede style writes. ResizeObserver refreshes cached sizes.
    for (const label of active) {
      if (!observedLabels.has(label)) {
        labelObserver.observe(label, { box: "border-box" });
        observedLabels.add(label);
      }
      if (!labelSizes.has(label))
        labelSizes.set(label, {
          width: label.offsetWidth,
          height: label.offsetHeight,
        });
    }
    const { selectedNodeId, hoveredId, model } = bindings.snapshot();
    const details = new Set(
      model.nodes.filter((node) => node.detail).map((node) => node.id),
    );
    const ordered = [...labels].sort(
      ([a], [b]) =>
        Number(b === selectedNodeId || b === hoveredId) -
          Number(a === selectedNodeId || a === hoveredId) ||
        Number(details.has(b)) - Number(details.has(a)),
    );
    const width = host.clientWidth;
    const height = host.clientHeight;
    const occupied: {
      left: number;
      top: number;
      right: number;
      bottom: number;
    }[] = [];
    for (const [id, label] of ordered) {
      const position = positions.get(id);
      const size = labelSizes.get(label);
      if (!position || !size) {
        label.style.visibility = "hidden";
        label.tabIndex = -1;
        continue;
      }
      projected.copy(position).project(camera);
      const x = ((projected.x + 1) * width) / 2;
      const y = ((1 - projected.y) * height) / 2;
      const birth = appearances.get(id);
      const birthProgress = birth
        ? motionProgress(performance.now() - birth.started, 650)
        : 1;
      label.style.opacity = `${birthProgress}`;
      const inView =
        projected.z < 1 &&
        projected.z > -1 &&
        Math.abs(projected.x) < 0.9 &&
        Math.abs(projected.y) < 0.85 &&
        (brightness.get(id) ?? 1) >= 0.5 &&
        birthProgress > 0.35;
      const offsets = [
        [13, -size.height / 2],
        [-size.width - 13, -size.height / 2],
        [-size.width / 2, -size.height - 12],
        [-size.width / 2, 12],
      ];
      const placement = inView
        ? offsets.find(([dx, dy]) => {
            const left = x + dx;
            const top = y + dy;
            return (
              left >= 6 &&
              left + size.width <= width - 6 &&
              top >= 6 &&
              top + size.height <= height - 6 &&
              !occupied.some(
                (box) =>
                  left < box.right + 5 &&
                  left + size.width > box.left - 5 &&
                  top < box.bottom + 5 &&
                  top + size.height > box.top - 5,
              )
            );
          })
        : undefined;
      if (placement) {
        const left = x + placement[0];
        const top = y + placement[1];
        label.style.transform = `translate(${left}px, ${top}px)`;
        occupied.push({
          left,
          top,
          right: left + size.width,
          bottom: top + size.height,
        });
      }
      const visibility = placement ? "visible" : "hidden";
      if (label.style.visibility !== visibility)
        label.style.visibility = visibility;
      label.tabIndex = placement ? 0 : -1;
    }
  }
  function updateBillboards() {
    if (!glows) return;
    camera.getWorldQuaternion(quaternion);
    glowEntries.forEach((entry, index) => {
      const position = positions.get(entry.id);
      if (position)
        glows?.setMatrixAt(
          index,
          matrix.compose(position, quaternion, entry.scale),
        );
    });
    glows.instanceMatrix.needsUpdate = true;
  }
  function render(time: number) {
    frame = 0;
    if (stopped || document.hidden) return;
    if (focusAnimation) {
      const progress = motionProgress(time - focusAnimation.started, 900);
      camera.position.lerpVectors(
        focusAnimation.fromPosition,
        focusAnimation.toPosition,
        progress,
      );
      controls.target.lerpVectors(
        focusAnimation.fromTarget,
        focusAnimation.toTarget,
        progress,
      );
      compositionOffset.lerpVectors(
        focusAnimation.fromOffset,
        focusAnimation.toOffset,
        progress,
      );
      applyComposition();
      if (progress === 1) interruptFocus();
      else requestRender();
    }
    if (appearances.size) {
      nodes.forEach((node, index) => {
        const appearance = appearances.get(node.id);
        if (!appearance) return;
        const progress = motionProgress(time - appearance.started, 650);
        const position = positions.get(node.id);
        if (!position) return;
        position.lerpVectors(appearance.from, appearance.to, progress);
        const radius =
          node.membership === "boundary"
            ? 0.025
            : node.source.entityKind === "document"
              ? 0.065
              : 0.034;
        dots?.setMatrixAt(
          index,
          matrix.compose(
            position,
            new THREE.Quaternion(),
            scale.setScalar(radius * Math.max(0.05, progress)),
          ),
        );
        if (progress === 1) appearances.delete(node.id);
      });
      if (dots) dots.instanceMatrix.needsUpdate = true;
      if (stems) {
        const branch = bindings.snapshot().branch;
        const parentPosition = branch
          ? positions.get(branch.parent.id)
          : undefined;
        const attribute = stems.geometry.getAttribute("position");
        if (parentPosition)
          branch?.children.forEach((child, index) => {
            const position = positions.get(child.id);
            if (!position) return;
            attribute.setXYZ(
              index * 2,
              parentPosition.x,
              parentPosition.y,
              parentPosition.z,
            );
            attribute.setXYZ(index * 2 + 1, position.x, position.y, position.z);
          });
        attribute.needsUpdate = true;
        stems.computeLineDistances();
      }
      if (appearances.size) requestRender();
    }
    controls.update();
    updateBillboards();
    renderer.render(scene, camera);
    updateLabels();
    // Damping/focus alone request more frames; a settled view has no render loop.
  }
  function highlight(
    selected = bindings.snapshot().selectedNodeId,
    selectedEdgeId = bindings.snapshot().selectedEdgeId,
    display = bindings.snapshot().display,
  ) {
    const { branch, model } = bindings.snapshot();
    const hasFocus = Boolean(selected) && !display?.filtered;
    const styles = new Map(
      nodes.map((node) => [
        node.id,
        display
          ? earthNodeDisplay(display, node.source)
          : {
              color: node.membership === "included" ? "#ebc78c" : "#83afc8",
              matched: true,
            },
      ]),
    );
    const connected = new Set<string>();
    if (branch && branch.parent.id === selected)
      for (const child of branch.children) connected.add(child.id);
    for (const edge of model.edges) {
      if (edge.source === selected) connected.add(edge.target);
      if (edge.target === selected) connected.add(edge.source);
    }
    nodes.forEach((node, index) => {
      const value =
        !hasFocus ||
        node.id === selected ||
        connected.has(node.id) ||
        node.detail
          ? 1
          : 0.13;
      const style = styles.get(node.id);
      brightness.set(node.id, value);
      dots?.setColorAt(
        index,
        color
          .set(style?.matched ? style.color : GREY)
          .multiplyScalar(style?.matched ? value : Math.min(value, 0.3)),
      );
    });
    glowEntries.forEach((entry, index) => {
      const style = styles.get(entry.id);
      const opacity = entry.cloud
        ? !hasFocus || entry.id === selected
          ? 0.16
          : 0.03
        : entry.id === selected
          ? 0.9
          : hasFocus && !connected.has(entry.id)
            ? 0.05
            : 0.45;
      glows?.setColorAt(
        index,
        color
          .set(style?.matched ? style.color : GREY)
          .multiplyScalar(style?.matched ? opacity : opacity * 0.12),
      );
    });
    if (dots?.instanceColor) dots.instanceColor.needsUpdate = true;
    if (glows?.instanceColor) glows.instanceColor.needsUpdate = true;
    const colors = lines?.geometry.getAttribute("color");
    segments.forEach((segment, index) => {
      const active = segment.source === selected || segment.target === selected;
      const inspected = segment.edgeId === selectedEdgeId;
      const matched =
        styles.get(segment.source)?.matched &&
        styles.get(segment.target)?.matched;
      color
        .set(matched ? (styles.get(segment.source)?.color ?? "#83afc8") : GREY)
        .multiplyScalar(
          matched
            ? inspected
              ? 1
              : active
                ? 0.7
                : hasFocus
                  ? 0.045
                  : model.nodes.length > 500
                    ? 0.075
                    : 0.27
            : 0.035,
        );
      colors?.setXYZ(index * 2, color.r, color.g, color.b);
      colors?.setXYZ(index * 2 + 1, color.r, color.g, color.b);
    });
    if (colors) colors.needsUpdate = true;
    const parentStyle = branch ? styles.get(branch.parent.id) : undefined;
    stemMaterial.color.set(
      parentStyle?.matched === false ? GREY : (parentStyle?.color ?? "#ebc78c"),
    );
    stemMaterial.opacity = parentStyle?.matched === false ? 0.035 : 0.22;
    if (selected && selected !== lastSelected) {
      const position = positions.get(selected);
      if (position) {
        const node = nodes.find((item) => item.id === selected);
        const worldScale = model.nodes.some((item) => item.group)
          ? Math.max(
              1,
              Math.sqrt(
                model.nodes.filter((item) => item.membership === "included")
                  .length / 10,
              ) * 0.55,
            )
          : 1;
        const distance =
          node?.source.entityKind === "article" ? 4.8 : 6.5 * worldScale;
        const destination = camera.position
          .clone()
          .sub(controls.target)
          .normalize()
          .multiplyScalar(viewportWidth < 620 ? distance * 1.3 : distance)
          .add(position);
        beginFocus(destination, position.clone());
      }
    } else if (!selected && lastSelected) reset();
    lastSelected = selected;
    requestRender();
  }
  function clearGraph() {
    for (const mesh of [dots, glows])
      if (mesh) {
        scene.remove(mesh);
        mesh.dispose();
      }
    for (const line of [lines, stems])
      if (line) {
        scene.remove(line);
        line.geometry.dispose();
      }
    dots = glows = undefined;
    lines = stems = undefined;
  }
  function updateGraph(
    next: Pick<NebulaSnapshot, "model" | "branch" | "nodes">,
  ) {
    const { model, branch, nodes: displayedNodes } = next;
    const previousPositions = positions;
    clearGraph();
    appearances.clear();
    positions = new Map(
      [...layoutNebula(model)].map(([id, position]) => [
        id,
        new THREE.Vector3(...position),
      ]),
    );
    if (branch) {
      const parent = branch.parent;
      const anchor =
        positions.get(parent.id) ??
        previousPositions.get(parent.id) ??
        hierarchyPositions.get(parent.id) ??
        positions.get(
          parent.membership === "included" ? parent.workId : parent.id,
        ) ??
        new THREE.Vector3();
      if (!positions.has(parent.id))
        positions.set(
          parent.id,
          previousPositions.has(parent.id) || hierarchyPositions.has(parent.id)
            ? anchor.clone()
            : anchor.clone().add(new THREE.Vector3(0.35, 0.25, 0.6)),
        );
      const parentPosition = positions.get(parent.id) ?? anchor;
      branch.children.forEach((child, index) => {
        if (positions.has(child.id)) return;
        const known = hierarchyPositions.get(child.id);
        if (known) {
          positions.set(child.id, known.clone());
          return;
        }
        const angle = index * 2.399963;
        const radius =
          0.65 + Math.sqrt((index + 0.5) / branch.children.length) * 2;
        positions.set(
          child.id,
          parentPosition
            .clone()
            .add(
              new THREE.Vector3(
                Math.cos(angle) * radius,
                Math.sin(angle) * radius * 0.8,
                0.6 + Math.sin(index * 1.7) * 0.3,
              ),
            ),
        );
      });
      for (const node of [parent, ...branch.children]) {
        const position = positions.get(node.id);
        if (!position) continue;
        hierarchyPositions.set(node.id, position.clone());
        if (
          initialized &&
          node.id !== parent.id &&
          !previousPositions.has(node.id) &&
          !reducedMotion.matches
        ) {
          appearances.set(node.id, {
            from: parentPosition.clone(),
            to: position.clone(),
            started: performance.now(),
          });
          position.copy(parentPosition);
        }
      }
    }
    const bounds = new THREE.Box3().setFromPoints([...positions.values()]);
    if (bounds.isEmpty()) {
      centre.set(0, 0, 0);
      extent.set(8, 5, 3);
    } else {
      bounds.getCenter(centre);
      bounds.getSize(extent);
    }
    nodes = displayedNodes.filter((node) => positions.has(node.id));
    brightness.clear();
    glowEntries = [];
    if (nodes.length) {
      dots = new THREE.InstancedMesh(dotGeometry, dotMaterial, nodes.length);
      dots.frustumCulled = false;
      nodes.forEach((node, index) => {
        const law =
          node.membership === "included" &&
          node.source.entityKind === "document";
        const boundary = node.membership === "boundary";
        const radius =
          node.source.entityKind === "institution"
            ? 0.12
            : law
              ? 0.065
              : boundary
                ? node.satelliteOf
                  ? 0.045
                  : 0.025
                : 0.034;
        dots?.setMatrixAt(
          index,
          matrix.compose(
            positions.get(node.id) as THREE.Vector3,
            new THREE.Quaternion(),
            scale.setScalar(radius),
          ),
        );
        glowEntries.push({
          id: node.id,
          scale: new THREE.Vector3(
            node.source.entityKind === "institution"
              ? 1.6
              : law
                ? 0.8
                : node.satelliteOf
                  ? 0.65
                  : 0.25,
            node.source.entityKind === "institution"
              ? 1.6
              : law
                ? 0.8
                : node.satelliteOf
                  ? 0.65
                  : 0.25,
            1,
          ),
          cloud: false,
          boundary,
        });
        if (law && (nodes.length < 200 || node.anchor))
          glowEntries.push({
            id: node.id,
            scale: new THREE.Vector3(6.8, 4.8, 1),
            cloud: true,
            boundary: false,
          });
      });
      glows = new THREE.InstancedMesh(
        glowGeometry,
        glowMaterial,
        glowEntries.length,
      );
      glows.frustumCulled = false;
      scene.add(dots, glows);
    }
    const linePositions: number[] = [];
    segments = [];
    for (const edge of model.edges) {
      const from = positions.get(edge.source);
      const to = positions.get(edge.target);
      if (!from || !to) continue;
      const middle = from.clone().lerp(to, 0.5);
      middle.z += Math.min(from.distanceTo(to) * 0.14, 1.2);
      const points = new THREE.QuadraticBezierCurve3(
        from,
        middle,
        to,
      ).getPoints(32);
      for (let index = 1; index < points.length; index++) {
        linePositions.push(
          ...points[index - 1].toArray(),
          ...points[index].toArray(),
        );
        segments.push({
          edgeId: edge.id,
          source: edge.source,
          target: edge.target,
        });
      }
    }
    if (segments.length) {
      const geometry = new THREE.BufferGeometry()
        .setAttribute(
          "position",
          new THREE.Float32BufferAttribute(linePositions, 3),
        )
        .setAttribute(
          "color",
          new THREE.Float32BufferAttribute(
            new Float32Array(linePositions.length),
            3,
          ),
        );
      lines = new THREE.LineSegments(geometry, lineMaterial);
      scene.add(lines);
    }
    // Actual loaded parent/children stems, never published relationship edges.
    const stemPositions: number[] = [];
    if (branch) {
      const parentPosition = positions.get(branch.parent.id);
      if (parentPosition)
        for (const child of branch.children) {
          const position = positions.get(child.id);
          if (position)
            stemPositions.push(
              ...parentPosition.toArray(),
              ...position.toArray(),
            );
        }
    }
    if (stemPositions.length) {
      stems = new THREE.LineSegments(
        new THREE.BufferGeometry().setAttribute(
          "position",
          new THREE.Float32BufferAttribute(stemPositions, 3),
        ),
        stemMaterial,
      );
      stems.computeLineDistances();
      stems.frustumCulled = false;
      scene.add(stems);
    }
    if (!initialized) {
      resize();
      reset();
      initialized = true;
    }
    highlight();
  }
  function resize() {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    // Cap physical pixels; labels remain full-resolution DOM text.
    const ratio = Math.min(
      window.devicePixelRatio,
      1.25,
      Math.sqrt(2_000_000 / (width * height)),
    );
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height);
    camera.aspect = width / height;
    viewportWidth = width;
    viewportHeight = height;
    camera.up.set(Math.sin(cameraRoll()), Math.cos(cameraRoll()), 0);
    camera.updateProjectionMatrix();
    if (!initialized) compositionOffset.copy(desiredOffset());
    applyComposition();
    if (
      previousAspect &&
      Math.abs(camera.aspect - previousAspect) > 0.015 &&
      initialized
    ) {
      if (!bindings.snapshot().selectedNodeId) reset();
      else {
        beginFocus(camera.position.clone(), controls.target.clone());
      }
    }
    previousAspect = camera.aspect;
    controls.update();
    requestRender();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  controls.addEventListener("change", requestRender);
  controls.addEventListener("start", interruptFocus);
  const visibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else requestRender();
  };
  document.addEventListener("visibilitychange", visibility);
  const raycaster = new THREE.Raycaster();
  raycaster.params.Line = { threshold: 0.035 };
  const pointer = new THREE.Vector2();
  function hitAt(event: PointerEvent) {
    const bounds = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const objects: THREE.Object3D[] = [];
    if (dots) objects.push(dots);
    if (lines) objects.push(lines);
    const hit = raycaster.intersectObjects(objects)[0];
    if (hit?.object === dots && hit.instanceId !== undefined)
      return { nodeId: nodes[hit.instanceId]?.id };
    if (hit?.object === lines && hit.index !== undefined)
      return { edgeId: segments[Math.floor(hit.index / 2)]?.edgeId };
    return {};
  }
  const pointerDown = new THREE.Vector2();
  const down = (event: PointerEvent) => {
    pointerDown.set(event.clientX, event.clientY);
  };
  const pick = (event: PointerEvent) => {
    if (
      pointerDown.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) >
      6
    )
      return;
    const hit = hitAt(event);
    if (hit.nodeId) bindings.selectNode(hit.nodeId);
    else if (hit.edgeId) bindings.selectEdge(hit.edgeId);
  };
  let hoverFrame = 0;
  let hoverEvent: PointerEvent | undefined;
  const hover = (event: PointerEvent) => {
    hoverEvent = event;
    if (hoverFrame) return;
    hoverFrame = requestAnimationFrame(() => {
      hoverFrame = 0;
      if (!hoverEvent || stopped) return;
      const hit = hitAt(hoverEvent);
      bindings.hover(hit.nodeId ?? "");
      canvas.style.cursor = hit.nodeId || hit.edgeId ? "pointer" : "grab";
    });
  };
  const leave = () => bindings.hover("");
  const loseContext = (event: Event) => {
    event.preventDefault();
    bindings.unavailable();
  };
  const keyboard = (event: KeyboardEvent) => {
    const direction: Record<string, [number, number]> = {
      ArrowLeft: [0.16, 0],
      ArrowRight: [-0.16, 0],
      ArrowUp: [0, 0.16],
      ArrowDown: [0, -0.16],
    };
    if (event.target !== canvas || !direction[event.key]) return;
    event.preventDefault();
    interruptFocus();
    controls.rotateLeft(direction[event.key][0]);
    controls.rotateUp(direction[event.key][1]);
    controls.update();
    requestRender();
  };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointerup", pick);
  canvas.addEventListener("pointermove", hover);
  canvas.addEventListener("pointerleave", leave);
  canvas.addEventListener("keydown", keyboard);
  canvas.addEventListener("webglcontextlost", loseContext);
  return {
    updateGraph,
    highlight,
    invalidate: requestRender,
    reset,
    zoom(factor: number) {
      interruptFocus();
      const offset = camera.position
        .clone()
        .sub(controls.target)
        .setLength(
          THREE.MathUtils.clamp(
            camera.position.distanceTo(controls.target) * factor,
            controls.minDistance,
            controls.maxDistance,
          ),
        );
      camera.position.copy(controls.target).add(offset);
      controls.update();
      requestRender();
    },
    dispose() {
      stopped = true;
      cancelAnimationFrame(frame);
      cancelAnimationFrame(hoverFrame);
      resizeObserver.disconnect();
      labelObserver.disconnect();
      observedLabels.clear();
      document.removeEventListener("visibilitychange", visibility);
      controls.removeEventListener("change", requestRender);
      controls.removeEventListener("start", interruptFocus);
      controls.dispose();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointerup", pick);
      canvas.removeEventListener("pointermove", hover);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("keydown", keyboard);
      canvas.removeEventListener("webglcontextlost", loseContext);
      clearGraph();
      stars.geometry.dispose();
      stars.material.dispose();
      dotGeometry.dispose();
      glowGeometry.dispose();
      for (const material of [
        dotMaterial,
        glowMaterial,
        lineMaterial,
        stemMaterial,
      ])
        material.dispose();
      texture.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
