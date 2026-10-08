import { keyPos, posKey, registryEntry, toEditionBlocks } from "@dustwright/core";
import type { Block, Model, Pos, StateValue } from "@dustwright/core";
import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  Color,
  DirectionalLight,
  EdgesGeometry,
  Float32BufferAttribute,
  HemisphereLight,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  MeshLambertMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildBlock, type Part } from "./geometry.js";
import { sceneColor, THEMES, type ThemeName } from "./palette.js";

/** What the inspector shows for a block, and what the `select` event carries. */
export interface BlockInfo {
  pos: Pos;
  type: string;
  states: Record<string, StateValue>;
  bedrock: { id: string; states: Record<string, StateValue>; offset: readonly [number, number, number] }[];
}

/** The camera views the toolbar and keyboard can snap to. */
export type SnapView = "north" | "east" | "south" | "west" | "top" | "iso";

/** Viewer modes: free exploration, or stepping through build instructions. */
export type ViewerMode = "explore" | "instructions";

/** Callbacks from the scene to its host element. */
export interface SceneCallbacks {
  onSelect?: (info: BlockInfo | null) => void;
  onHover?: (info: BlockInfo | null) => void;
  onRender?: () => void;
}

const BOX = new BoxGeometry(1, 1, 1);
const EDGES = new EdgesGeometry(BOX);
const tmpMatrix = new Matrix4();
const tmpColor = new Color();

/** Information about one block: its abstract states and what the Bedrock exporters will place. */
export function blockInfo(block: Block, pos: Pos): BlockInfo {
  let bedrock: BlockInfo["bedrock"];
  try {
    bedrock = toEditionBlocks(block, "bedrock").map((b) => ({
      id: b.id,
      states: b.states,
      offset: b.offset,
    }));
  } catch {
    bedrock = [];
  }
  return { pos, type: block.type, states: { ...block.states }, bedrock };
}

/**
 * The Three.js side of the viewer: instanced boxes for every block part, picking, layers, explode, the direction
 * overlay and instruction steps. Renders on demand. It never touches design text; labels are the host's job.
 */
export class ViewerScene {
  readonly renderer: WebGLRenderer;
  readonly camera: PerspectiveCamera;
  readonly controls: OrbitControls;
  private readonly scene = new Scene();
  private solid: InstancedMesh;
  private ghost: InstancedMesh;
  private arrows: InstancedMesh;
  private readonly edges = new LineSegments(
    new BufferGeometry(),
    new LineBasicMaterial({ transparent: true, opacity: 0.35 }),
  );
  private readonly hoverBox = new LineSegments(EDGES, new LineBasicMaterial({ color: 0xffffff }));
  private readonly selectBox = new LineSegments(EDGES, new LineBasicMaterial({ color: 0xffb000 }));
  private readonly raycaster = new Raycaster();
  private model: Model | null = null;
  /** The blocks drawn: the model's, or a simulated tick's (power view). */
  private blocks: ReadonlyMap<string, Block> = new Map();
  private parts = new Map<string, Part[]>();
  private solidKeys: string[] = [];
  private stepOf = new Map<string, number>();
  private frame = 0;
  private theme: ThemeName = "light";
  private explodeTarget = 0;
  private explodeNow = 0;

  /** Highest visible layer (inclusive); layers above are ghosted. */
  layer = 0;
  /** Show only `layer` solid. */
  isolate = false;
  /** Show the direction arrows. */
  overlay = true;
  mode: ViewerMode = "explore";
  step = 0;
  reducedMotion = false;
  selected: string | null = null;
  hovered: string | null = null;

  constructor(
    private readonly canvasHost: HTMLElement,
    private readonly callbacks: SceneCallbacks = {},
  ) {
    this.renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    canvasHost.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.touchAction = "none";
    this.camera = new PerspectiveCamera(40, 1, 0.05, 2000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.addEventListener("change", () => this.requestRender());

    const material = new MeshLambertMaterial();
    this.solid = new InstancedMesh(BOX, material, 1);
    this.ghost = new InstancedMesh(
      BOX,
      new MeshLambertMaterial({ transparent: true, opacity: 0.15, depthWrite: false }),
      1,
    );
    this.arrows = new InstancedMesh(BOX, new MeshLambertMaterial(), 1);
    for (const mesh of [this.solid, this.ghost, this.arrows]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
    }
    this.hoverBox.visible = false;
    this.selectBox.visible = false;
    this.scene.add(this.edges, this.hoverBox, this.selectBox);
    this.scene.add(new HemisphereLight(0xffffff, 0x8899aa, 1.6));
    this.scene.add(new AmbientLight(0xffffff, 0.6));
    const sun = new DirectionalLight(0xffffff, 1.4);
    sun.position.set(0.6, 1, 0.35);
    this.scene.add(sun);
    this.setTheme("light");
  }

  /** Applies a theme to the scene background and outlines. */
  setTheme(theme: ThemeName): void {
    this.theme = theme;
    this.scene.background = new Color(THEMES[theme].bg);
    const colors = THEMES[theme].scene;
    (this.edges.material as LineBasicMaterial).color.set(colors.edges);
    (this.hoverBox.material as LineBasicMaterial).color.set(colors.hover);
    (this.selectBox.material as LineBasicMaterial).color.set(colors.select);
    this.requestRender();
  }

  /** Loads a model: builds every block's parts once and frames the camera. */
  load(model: Model): void {
    this.model = model;
    this.buildParts(model.blocks);
    this.stepOf.clear();
    model.steps.forEach((s, i) => {
      for (const p of s.positions) if (!this.stepOf.has(posKey(p))) this.stepOf.set(posKey(p), i);
    });
    this.layer = model.size[1] - 1;
    this.step = 0;
    this.selected = null;
    this.hovered = null;
    this.snap("iso");
    this.rebuild();
  }

  /**
   * Draws a different set of blocks over the same design, such as one simulated tick (pistons may have moved
   * blocks); null goes back to the model's blocks. The camera, layer and selection stay.
   */
  setBlocks(blocks: ReadonlyMap<string, Block> | null): void {
    if (!this.model) return;
    this.buildParts(blocks ?? this.model.blocks);
    this.rebuild();
  }

  private buildParts(blocks: ReadonlyMap<string, Block>): void {
    this.blocks = blocks;
    this.parts.clear();
    const at = (p: Pos) => blocks.get(posKey(p));
    for (const [key, block] of blocks) this.parts.set(key, buildBlock(block, keyPos(key), at));
    const capacity = (role: (p: Part) => boolean) =>
      Math.max(
        1,
        [...this.parts.values()].reduce((n, ps) => n + ps.filter(role).length, 0),
      );
    this.resize(
      this.solid,
      capacity((p) => p.role !== "arrow"),
    );
    this.resize(
      this.ghost,
      capacity((p) => p.role !== "arrow"),
    );
    this.resize(
      this.arrows,
      capacity((p) => p.role === "arrow"),
    );
  }

  private resize(mesh: InstancedMesh, capacity: number): void {
    if (mesh.instanceMatrix.count >= capacity && mesh.instanceColor) return;
    const replacement = new InstancedMesh(BOX, mesh.material, capacity);
    replacement.frustumCulled = false;
    replacement.count = 0;
    replacement.setColorAt(0, tmpColor.set(0xffffff));
    this.scene.remove(mesh);
    this.scene.add(replacement);
    if (mesh === this.solid) this.solid = replacement;
    else if (mesh === this.ghost) this.ghost = replacement;
    else this.arrows = replacement;
    mesh.dispose();
  }

  /** The visual height of a layer, with the explode offset. */
  private layerY(y: number): number {
    return y * (1 + this.explodeNow * 1.5);
  }

  /** How a block shows now: solid, dimmed (earlier steps), ghosted (above the layer cut) or hidden. */
  private visibility(key: string, y: number): "solid" | "dim" | "ghost" | "hidden" {
    if (this.mode === "instructions") {
      const s = this.stepOf.get(key);
      if (s === undefined) return "dim";
      if (s === this.step) return "solid";
      return s < this.step ? "dim" : "hidden";
    }
    if (y > this.layer) return "ghost";
    if (this.isolate && y !== this.layer) return y < this.layer ? "hidden" : "ghost";
    return "solid";
  }

  /** Rebuilds the instance buffers from the current view state. */
  rebuild(): void {
    const model = this.model;
    if (!model) return;
    let s = 0;
    let g = 0;
    let a = 0;
    const keys: string[] = [];
    const edgePositions: number[] = [];
    const bg = new Color(THEMES[this.theme].bg);
    const sorted = [...this.parts.entries()].map(([key, parts]) => ({ key, y: keyPos(key)[1], parts }));
    for (const { key, y, parts } of sorted) {
      const vis = this.visibility(key, y);
      if (vis === "hidden") continue;
      for (const part of parts) {
        this.partMatrix(part, keyPos(key));
        tmpColor.set(sceneColor(part.color));
        if (part.role === "arrow") {
          if (!this.overlay || vis === "ghost") continue;
          this.arrows.setMatrixAt(a, tmpMatrix);
          this.arrows.setColorAt(a, tmpColor);
          a++;
        } else if (vis === "ghost") {
          this.ghost.setMatrixAt(g, tmpMatrix);
          this.ghost.setColorAt(g, tmpColor);
          g++;
        } else {
          if (vis === "dim") tmpColor.lerp(bg, 0.6);
          this.solid.setMatrixAt(s, tmpMatrix);
          this.solid.setColorAt(s, tmpColor);
          keys[s] = key;
          s++;
          if (part.role === "body") this.pushEdges(edgePositions, part, keyPos(key));
        }
      }
    }
    this.solidKeys = keys;
    this.finish(this.solid, s);
    this.finish(this.ghost, g);
    this.finish(this.arrows, a);
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(edgePositions, 3));
    this.edges.geometry.dispose();
    this.edges.geometry = geometry;
    this.updateMarker(this.selectBox, this.selected);
    this.updateMarker(this.hoverBox, this.hovered);
    this.requestRender();
  }

  private finish(mesh: InstancedMesh, count: number): void {
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.computeBoundingBox();
  }

  private partMatrix(part: Part, pos: Pos): void {
    const sx = Math.max(part.max[0] - part.min[0], 0.001);
    const sy = Math.max(part.max[1] - part.min[1], 0.001);
    const sz = Math.max(part.max[2] - part.min[2], 0.001);
    tmpMatrix.makeScale(sx, sy, sz);
    tmpMatrix.setPosition(
      pos[0] + (part.min[0] + part.max[0]) / 2,
      this.layerY(pos[1]) + (part.min[1] + part.max[1]) / 2,
      pos[2] + (part.min[2] + part.max[2]) / 2,
    );
  }

  private pushEdges(out: number[], part: Part, pos: Pos): void {
    const x0 = pos[0] + part.min[0];
    const x1 = pos[0] + part.max[0];
    const y0 = this.layerY(pos[1]) + part.min[1];
    const y1 = this.layerY(pos[1]) + part.max[1];
    const z0 = pos[2] + part.min[2];
    const z1 = pos[2] + part.max[2];
    const c: [number, number, number][] = [
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y0, z1],
      [x0, y0, z1],
      [x0, y1, z0],
      [x1, y1, z0],
      [x1, y1, z1],
      [x0, y1, z1],
    ];
    const pairs = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 4],
      [0, 4],
      [1, 5],
      [2, 6],
      [3, 7],
    ];
    for (const [i, j] of pairs) out.push(...(c[i as number] as number[]), ...(c[j as number] as number[]));
  }

  /** Places a marker box around a block (with its extra cells, such as a door's upper half). */
  private updateMarker(marker: LineSegments, key: string | null): void {
    const block = key ? this.blocks.get(key) : undefined;
    if (!key || !block || this.visibility(key, keyPos(key)[1]) === "hidden") {
      marker.visible = false;
      return;
    }
    const pos = keyPos(key);
    const height = 1 + Math.max(0, ...(registryEntry(block.type)?.occupies ?? []).map((o) => o[1]));
    marker.visible = true;
    marker.scale.set(1.04, height + 0.04, 1.04);
    marker.position.set(pos[0] + 0.5, this.layerY(pos[1]) + height / 2, pos[2] + 0.5);
  }

  /** Number of blocks drawn solid (not ghosted or hidden): what the layer slider test counts. */
  visibleBlockCount(): number {
    return new Set(this.solidKeys).size;
  }

  /**
   * The block under a canvas pixel, if any. Picks whole cells (a door's two), not the drawn parts, so a thin wall
   * torch or a dust line is as easy to click as a stone block.
   */
  pick(clientX: number, clientY: number): string | null {
    const model = this.model;
    if (!model) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(ndc, this.camera);
    const { origin, direction } = this.raycaster.ray;
    const inv = [1 / direction.x, 1 / direction.y, 1 / direction.z];
    let best: string | null = null;
    let bestT = Infinity;
    for (const key of new Set(this.solidKeys)) {
      const pos = keyPos(key);
      const block = this.blocks.get(key);
      const height =
        1 + Math.max(0, ...(block ? (registryEntry(block.type)?.occupies ?? []).map((o) => o[1]) : []));
      const min = [pos[0], this.layerY(pos[1]), pos[2]];
      const max = [pos[0] + 1, this.layerY(pos[1]) + height, pos[2] + 1];
      let t0 = -Infinity;
      let t1 = Infinity;
      for (let a = 0; a < 3; a++) {
        const o = a === 0 ? origin.x : a === 1 ? origin.y : origin.z;
        const ta = ((min[a] as number) - o) * (inv[a] as number);
        const tb = ((max[a] as number) - o) * (inv[a] as number);
        t0 = Math.max(t0, Math.min(ta, tb));
        t1 = Math.min(t1, Math.max(ta, tb));
      }
      if (t1 >= Math.max(t0, 0) && t0 < bestT) {
        bestT = t0;
        best = key;
      }
    }
    return best;
  }

  /** Info for a block key, or null. */
  info(key: string | null): BlockInfo | null {
    const block = key ? this.blocks.get(key) : undefined;
    return key && block ? blockInfo(block, keyPos(key)) : null;
  }

  setHover(key: string | null): void {
    if (key === this.hovered) return;
    this.hovered = key;
    this.updateMarker(this.hoverBox, key);
    this.callbacks.onHover?.(this.info(key));
    this.requestRender();
  }

  setSelected(key: string | null): void {
    this.selected = key;
    this.updateMarker(this.selectBox, key);
    this.callbacks.onSelect?.(this.info(key));
    this.requestRender();
  }

  /** Projects a block's centre (plus a height offset) to CSS pixels inside the canvas; null when behind. */
  project(pos: Pos, lift = 0.5): { x: number; y: number } | null {
    this.camera.updateMatrixWorld();
    const v = new Vector3(pos[0] + 0.5, this.layerY(pos[1]) + lift, pos[2] + 0.5).project(this.camera);
    if (v.z > 1 || v.z < -1) return null;
    const canvas = this.renderer.domElement;
    return { x: ((v.x + 1) / 2) * canvas.clientWidth, y: ((1 - v.y) / 2) * canvas.clientHeight };
  }

  /** True when a block is drawn solid or dimmed (labels follow this). */
  isShown(pos: Pos): boolean {
    const vis = this.visibility(posKey(pos), pos[1]);
    return vis === "solid" || vis === "dim";
  }

  /** Camera directions for the named views (from the target toward the camera). */
  private static readonly VIEWS: Record<SnapView, [number, number, number]> = {
    iso: [0.9, 0.85, 1.3],
    north: [0, 0.35, -1],
    south: [0, 0.35, 1],
    east: [1, 0.35, 0],
    west: [-1, 0.35, 0],
    top: [0, 1, 0.05],
  };

  /** Moves the camera to a named view, framing the whole design. */
  snap(view: SnapView): void {
    this.frameDesign(new Vector3(...ViewerScene.VIEWS[view]).normalize());
  }

  /**
   * Re-frames the whole design (with the current explode spread) from the current camera direction. Uses the
   * narrower of the vertical and horizontal fields of view, so a portrait canvas still shows everything.
   */
  fit(): void {
    const dir = this.camera.position.clone().sub(this.controls.target);
    this.frameDesign(
      dir.lengthSq() > 0 ? dir.normalize() : new Vector3(...ViewerScene.VIEWS.iso).normalize(),
    );
  }

  private frameDesign(direction: Vector3): void {
    const size = this.model?.size ?? [1, 1, 1];
    const top = this.layerY(Math.max(0, size[1] - 1)) + 2;
    const centre = new Vector3(size[0] / 2, top / 2, size[2] / 2);
    const radius = Math.max(1.5, Math.hypot(size[0], top, size[2]) / 2);
    const vFov = (this.camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(0.1, this.camera.aspect));
    const distance = (radius / Math.sin(Math.min(vFov, hFov) / 2)) * 1.05;
    this.controls.target.copy(centre);
    this.camera.position.copy(centre).add(direction.clone().multiplyScalar(distance));
    this.camera.near = Math.max(0.05, distance / 200);
    this.camera.far = distance * 20;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.requestRender();
  }

  /** Rotates the camera around the target (keyboard orbit). */
  orbit(dAzimuth: number, dPolar: number): void {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const r = offset.length();
    let theta = Math.atan2(offset.x, offset.z) + dAzimuth;
    let phi = Math.acos(Math.min(1, Math.max(-1, offset.y / r))) + dPolar;
    phi = Math.min(Math.PI - 0.05, Math.max(0.05, phi));
    theta = ((theta + Math.PI) % (2 * Math.PI)) - Math.PI;
    offset.set(r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.cos(theta));
    this.camera.position.copy(this.controls.target).add(offset);
    this.controls.update();
    this.requestRender();
  }

  /** Spreads layers apart (0 = together). Animated unless reduced motion is on. */
  setExplode(amount: number): void {
    this.explodeTarget = amount;
    if (this.reducedMotion) {
      // No animation: jump, and re-frame in the same call so the camera moves exactly once.
      this.explodeNow = amount;
      this.rebuild();
      this.fit();
      return;
    }
    this.rebuild();
    this.fitAfterExplode = true;
  }

  private fitAfterExplode = false;
  private sized = false;

  /** Resizes the drawing buffer to the host's size. */
  setSize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.renderer.domElement.style.width = `${width}px`;
    this.renderer.domElement.style.height = `${height}px`;
    const before = this.camera.aspect;
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    // The first real size (and any big change of shape) re-frames, so the design is framed for this aspect.
    if (this.model && (!this.sized || Math.abs(Math.log(before / this.camera.aspect)) > 0.2)) this.fit();
    this.sized = true;
    this.requestRender();
  }

  /** Schedules one frame. */
  requestRender(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (Math.abs(this.explodeNow - this.explodeTarget) > 0.001) {
        this.explodeNow += (this.explodeTarget - this.explodeNow) * 0.25;
        if (Math.abs(this.explodeNow - this.explodeTarget) <= 0.001) this.explodeNow = this.explodeTarget;
        this.rebuild();
      }
      if (this.fitAfterExplode && this.explodeNow === this.explodeTarget) {
        this.fitAfterExplode = false;
        this.fit();
      }
      this.renderer.render(this.scene, this.camera);
      this.callbacks.onRender?.();
    });
  }

  /** Renders immediately (tests and screenshots). */
  renderNow(): void {
    this.renderer.render(this.scene, this.camera);
    this.callbacks.onRender?.();
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /** Exposed for the canvas host: the element that receives pointer events. */
  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }
}
