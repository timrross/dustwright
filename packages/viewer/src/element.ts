import { LIMITS, parse, parseText, posKey } from "@dustwright/core";
import type { Diagnostic, Model, Pos, StateValue } from "@dustwright/core";
import { THEMES, type ThemeName } from "./palette.js";
import { type BlockInfo, type SnapView, type ViewerMode, ViewerScene } from "./scene.js";
import { VIEWER_CSS } from "./styles.js";

/** The custom element name. */
export const ELEMENT_NAME = "redstone-viewer";

/** Below this width the inspector becomes a bottom sheet. */
const NARROW_PX = 520;

/** Message source tag on every postMessage the viewer sends to a parent window. */
export const MESSAGE_SOURCE = "dustwright-viewer";

type ElementOptions = Partial<{ text: string; className: string; title: string }>;

/** Creates an element; text always goes through textContent, never HTML. */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts: ElementOptions = {},
  ...children: Node[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (opts.text !== undefined) node.textContent = opts.text;
  if (opts.className) node.className = opts.className;
  if (opts.title) node.setAttribute("title", opts.title);
  for (const c of children) node.appendChild(c);
  return node;
}

const valueText = (v: StateValue) => String(v);

/** Marks a control as hidden on narrow screens (it has a keyboard or toolbar alternative). */
function wideOnly<T extends HTMLElement>(node: T): T {
  node.classList.add("wide-only");
  return node;
}
let sheet: CSSStyleSheet | null = null;

/** Reads a fetch response body, refusing more than `limit` bytes. */
async function readCapped(res: Response, limit: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new RangeError(`Design is larger than the limit of ${limit} bytes`);
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

/**
 * `<redstone-viewer>`: a read-only 3D view of a Dustwright design. Attributes: `src` (same-origin or https: URL)
 * or an inline `<script type="application/json">` child, `mode` (explore | instructions), `layer`, `step`, `height`,
 * `theme` (light | dark | auto). Events (DOM and, inside an iframe, postMessage to the parent): `ready`, `select`,
 * `step`.
 */
export class RedstoneViewer extends HTMLElement {
  static readonly observedAttributes = ["src", "mode", "layer", "step", "height", "theme"];

  private readonly root: HTMLDivElement;
  private readonly stage: HTMLDivElement;
  private readonly canvasHost: HTMLDivElement;
  private readonly labels: HTMLDivElement;
  private readonly inspector: HTMLDivElement;
  private readonly errors: HTMLDivElement;
  private readonly titleNode: HTMLSpanElement;
  private readonly controls: {
    layer: HTMLInputElement;
    layerValue: HTMLSpanElement;
    isolate: HTMLButtonElement;
    explode: HTMLInputElement;
    arrows: HTMLButtonElement;
    mode: HTMLButtonElement;
    back: HTMLButtonElement;
    next: HTMLButtonElement;
    stepLabel: HTMLSpanElement;
    layerGroup: HTMLSpanElement;
    stepGroup: HTMLSpanElement;
  };
  private scene: ViewerScene | null = null;
  private currentModel: Model | null = null;
  private currentDiagnostics: Diagnostic[] = [];
  private labelNodes: { node: HTMLElement; pos: Pos; lift: number }[] = [];
  private note: HTMLDivElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private media: MediaQueryList | null = null;
  private loadToken = 0;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    if (
      "adoptedStyleSheets" in shadow &&
      typeof CSSStyleSheet === "function" &&
      "replaceSync" in CSSStyleSheet.prototype
    ) {
      sheet ??= new CSSStyleSheet();
      if (sheet.cssRules.length === 0) sheet.replaceSync(VIEWER_CSS);
      shadow.adoptedStyleSheets = [sheet];
    } else {
      shadow.appendChild(el("style", { text: VIEWER_CSS }));
    }
    this.titleNode = el("span", { className: "title" });
    const button = (text: string, label: string, onClick: () => void) => {
      const b = el("button", { text, title: label });
      b.type = "button";
      b.setAttribute("aria-label", label);
      b.addEventListener("click", onClick);
      return b;
    };
    const toggle = (text: string, label: string, onClick: (b: HTMLButtonElement) => void) => {
      const b = button(text, label, () => onClick(b));
      b.setAttribute("aria-pressed", "false");
      return b;
    };
    const range = (label: string, min: number, max: number, step: number) => {
      const r = el("input");
      r.type = "range";
      r.min = String(min);
      r.max = String(max);
      r.step = String(step);
      r.setAttribute("aria-label", label);
      return r;
    };
    const layer = range("Highest visible layer", 0, 0, 1);
    const layerValue = el("span", { className: "muted" });
    const isolate = toggle("Isolate", "Show only this layer", (b) =>
      this.setIsolate(b.getAttribute("aria-pressed") !== "true"),
    );
    const explode = range("Explode layers", 0, 2, 0.1);
    explode.value = "0";
    const arrows = toggle("Arrows", "Show direction arrows", (b) =>
      this.setOverlay(b.getAttribute("aria-pressed") !== "true"),
    );
    const mode = toggle("Steps", "Instructions mode", (b) =>
      this.setMode(b.getAttribute("aria-pressed") === "true" ? "explore" : "instructions"),
    );
    const back = button("◀", "Previous step (b)", () => this.setStep((this.scene?.step ?? 0) - 1));
    const next = button("▶", "Next step (n)", () => this.setStep((this.scene?.step ?? 0) + 1));
    const stepLabel = el("span", { className: "muted" });
    stepLabel.setAttribute("aria-live", "polite");
    layer.addEventListener("input", () => this.setLayer(Number(layer.value)));
    explode.addEventListener("input", () => this.scene?.setExplode(Number(explode.value)));
    const views = el(
      "span",
      { className: "group" },
      button("⟲", "Reset view (r)", () => this.snap("iso")),
      ...(["north", "east", "south", "west"] as const).map((v) =>
        wideOnly(button(v[0]!.toUpperCase(), `View from the ${v}`, () => this.snap(v))),
      ),
      button("Top", "View from the top", () => this.snap("top")),
    );
    const layerGroup = el(
      "span",
      { className: "group" },
      el("span", { text: "Layer", className: "wide-only" }),
      layer,
      layerValue,
      isolate,
    );
    const stepGroup = el("span", { className: "group" }, back, stepLabel, next);
    const toolbar = el(
      "div",
      { className: "toolbar" },
      this.titleNode,
      views,
      layerGroup,
      el("span", { className: "group wide-only" }, el("span", { text: "Explode" }), explode),
      arrows,
      mode,
      stepGroup,
    );
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", "Viewer controls");
    this.controls = {
      layer,
      layerValue,
      isolate,
      explode,
      arrows,
      mode,
      back,
      next,
      stepLabel,
      layerGroup,
      stepGroup,
    };
    this.canvasHost = el("div");
    this.labels = el("div", { className: "labels" });
    this.stage = el("div", { className: "stage" }, this.canvasHost, this.labels);
    this.stage.tabIndex = 0;
    this.stage.setAttribute("role", "application");
    this.stage.setAttribute(
      "aria-label",
      "3D view. Arrow keys orbit; Shift with arrow keys or Page Up and Page Down moves the selection; [ and ] change layer; n and b step in instructions mode; r resets the view; Escape clears the selection.",
    );
    this.inspector = el("div", { className: "inspector" });
    this.inspector.setAttribute("role", "region");
    this.inspector.setAttribute("aria-label", "Block inspector");
    this.inspector.setAttribute("aria-live", "polite");
    this.errors = el("div", { className: "errors" });
    this.errors.setAttribute("role", "alert");
    this.errors.hidden = true;
    this.root = el("div", { className: "root" }, toolbar, this.stage, this.inspector, this.errors);
    shadow.appendChild(this.root);
    this.showInspector(null);
    arrows.setAttribute("aria-pressed", "true");
    this.wireStage();
  }

  connectedCallback(): void {
    this.applyHeight();
    this.applyTheme();
    if (!this.scene) {
      try {
        this.scene = new ViewerScene(this.canvasHost, {
          onSelect: (info) => this.onSelect(info),
          onRender: () => this.positionLabels(),
        });
      } catch (err) {
        this.showErrors([
          { code: "E001", severity: "error", message: `WebGL is not available: ${(err as Error).message}` },
        ]);
        return;
      }
      this.scene.reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      this.applyTheme();
      this.resizeObserver = new ResizeObserver(() => this.layout());
      this.resizeObserver.observe(this.stage);
      this.resizeObserver.observe(this.root);
    }
    if (this.currentModel) {
      this.scene.load(this.currentModel);
      this.afterLoad();
    } else if (!this.loadInline() && this.getAttribute("src")) {
      void this.loadSrc(this.getAttribute("src") as string);
    } else if (!this.currentModel && !this.getAttribute("src")) {
      // When the viewer script runs in <head>, the element upgrades before its children are parsed: wait for an
      // inline design to arrive.
      this.childWatcher?.disconnect();
      this.childWatcher = new MutationObserver(() => {
        if (this.loadInline()) this.childWatcher?.disconnect();
      });
      this.childWatcher.observe(this, { childList: true, subtree: true, characterData: true });
    }
  }

  private childWatcher: MutationObserver | null = null;

  /** Loads the inline `<script type="application/json">` child, if there is one with content. */
  private loadInline(): boolean {
    const inline = [...this.children].find(
      (c) => c instanceof HTMLScriptElement && c.type === "application/json",
    );
    if (!inline?.textContent?.trim()) return false;
    this.load(inline.textContent);
    return true;
  }

  disconnectedCallback(): void {
    this.childWatcher?.disconnect();
    this.childWatcher = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.media?.removeEventListener("change", this.onMedia);
    this.scene?.dispose();
    this.scene = null;
  }

  attributeChangedCallback(name: string, old: string | null, value: string | null): void {
    if (old === value) return;
    if (name === "height") this.applyHeight();
    else if (name === "theme") this.applyTheme();
    else if (name === "src" && value && this.isConnected) void this.loadSrc(value);
    else if (name === "mode" && value) this.setMode(value === "instructions" ? "instructions" : "explore");
    else if (name === "layer" && value !== null) this.setLayer(Number(value));
    else if (name === "step" && value !== null) this.setStep(Number(value));
  }

  /** The loaded model, or null. */
  get model(): Model | null {
    return this.currentModel;
  }

  /** Diagnostics from the last load. */
  get diagnostics(): readonly Diagnostic[] {
    return this.currentDiagnostics;
  }

  /**
   * Loads a design from JSON text or a decoded object. It goes through the stage 1 parser first; a design with
   * errors shows its diagnostics instead of the canvas.
   */
  load(design: unknown): boolean {
    this.loadToken++;
    const result = typeof design === "string" ? parseText(design) : parse(design);
    this.currentDiagnostics = result.diagnostics;
    if (!result.model) {
      this.currentModel = null;
      this.showErrors(result.diagnostics);
      return false;
    }
    this.currentModel = result.model;
    this.errors.hidden = true;
    this.stage.hidden = false;
    this.inspector.hidden = false;
    if (this.scene) {
      this.scene.load(result.model);
      this.afterLoad();
    }
    return true;
  }

  /** Fetches and loads a design from a same-origin or https: URL, at most 2 MB. */
  async loadSrc(src: string): Promise<boolean> {
    const token = ++this.loadToken;
    let url: URL;
    try {
      url = new URL(src, document.baseURI);
    } catch {
      return this.refuse(`"src" is not a valid URL`);
    }
    if (url.origin !== location.origin && url.protocol !== "https:") {
      return this.refuse(`"src" must be same-origin or https:`);
    }
    try {
      const res = await fetch(url, { credentials: "omit", redirect: "follow" });
      // A redirect must land somewhere the original rule allows too.
      const landed = new URL(res.url || url.href);
      if (landed.origin !== location.origin && landed.protocol !== "https:") {
        return this.refuse(`"src" redirected to a location that is not same-origin or https:`);
      }
      if (!res.ok) return this.refuse(`Could not load the design (HTTP ${res.status})`);
      const declared = Number(res.headers.get("content-length") ?? "0");
      if (declared > LIMITS.fileBytes) throw new RangeError("too large");
      const text = await readCapped(res, LIMITS.fileBytes);
      if (token !== this.loadToken) return false;
      return this.load(text);
    } catch (err) {
      if (token !== this.loadToken) return false;
      if (err instanceof RangeError) {
        this.showErrors([
          {
            code: "E013",
            severity: "error",
            message: `Design is larger than the file size limit of ${LIMITS.fileBytes} bytes (2 MB)`,
          },
        ]);
        return false;
      }
      return this.refuse("Could not load the design");
    }
  }

  private refuse(message: string): false {
    this.currentModel = null;
    this.showErrors([{ code: "E001", severity: "error", message }]);
    return false;
  }

  /** Shows layers 0..y (clamped). */
  setLayer(y: number): void {
    const scene = this.scene;
    const model = this.currentModel;
    if (!scene || !model || Number.isNaN(y)) return;
    scene.layer = Math.max(0, Math.min(model.size[1] - 1, Math.round(y)));
    this.controls.layer.value = String(scene.layer);
    this.controls.layerValue.textContent = `${scene.layer} / ${model.size[1] - 1}`;
    scene.rebuild();
  }

  /** Shows only the current layer solid (layers below hidden, above ghosted), or all layers up to it. */
  setIsolate(on: boolean): void {
    if (!this.scene) return;
    this.scene.isolate = on;
    this.controls.isolate.setAttribute("aria-pressed", String(on));
    this.scene.rebuild();
  }

  /** Shows or hides the direction arrows on directional blocks. */
  setOverlay(on: boolean): void {
    if (!this.scene) return;
    this.scene.overlay = on;
    this.controls.arrows.setAttribute("aria-pressed", String(on));
    this.scene.rebuild();
  }

  /** Switches between free exploration and instructions mode (stepping through the design's `steps`). */
  setMode(mode: ViewerMode): void {
    if (!this.scene) return;
    this.scene.mode = mode;
    const instructions = mode === "instructions";
    this.controls.mode.setAttribute("aria-pressed", String(instructions));
    this.controls.stepGroup.hidden = !instructions;
    this.controls.layerGroup.hidden = instructions;
    this.scene.rebuild();
    if (instructions) this.setStep(this.scene.step);
  }

  /** Moves to build step `i` (clamped) and emits `step`. */
  setStep(i: number): void {
    const scene = this.scene;
    const model = this.currentModel;
    if (!scene || !model || model.steps.length === 0 || Number.isNaN(i)) return;
    scene.step = Math.max(0, Math.min(model.steps.length - 1, Math.round(i)));
    const step = model.steps[scene.step];
    const count = step?.positions.length ?? 0;
    this.controls.stepLabel.textContent = `Step ${scene.step + 1} of ${model.steps.length}: ${step?.title ?? ""} (${count} block${count === 1 ? "" : "s"})`;
    this.controls.back.disabled = scene.step === 0;
    this.controls.next.disabled = scene.step === model.steps.length - 1;
    scene.rebuild();
    this.emit("step", {
      index: scene.step,
      count: model.steps.length,
      title: step?.title ?? "",
      blocks: count,
    });
  }

  /** Moves the camera to a named view (`iso` is the reset view), framing the whole design. */
  snap(view: SnapView): void {
    this.scene?.snap(view);
  }

  /** Selects the block at `pos` (or clears the selection) as a click would. */
  select(pos: Pos | null): void {
    this.scene?.setSelected(pos ? posKey(pos) : null);
  }

  /** Number of blocks drawn solid: layers 0..layer in explore mode. */
  visibleBlockCount(): number {
    return this.scene?.visibleBlockCount() ?? 0;
  }

  /** Viewport (client) coordinates of a block's centre, for tests and host pages. */
  screenPositionOf(pos: Pos): { x: number; y: number } | null {
    const p = this.scene?.project(pos, 0.5);
    if (!p || !this.scene) return null;
    const rect = this.scene.canvas.getBoundingClientRect();
    return { x: rect.left + p.x, y: rect.top + p.y };
  }

  /** Orbits the camera by the given angles in radians (benchmark and host pages). */
  orbitBy(dAzimuth: number, dPolar: number): void {
    this.scene?.orbit(dAzimuth, dPolar);
  }

  /** Renders a frame now (screenshots). */
  renderNow(): void {
    this.scene?.renderNow();
  }

  private afterLoad(): void {
    const model = this.currentModel;
    const scene = this.scene;
    if (!model || !scene) return;
    this.titleNode.textContent = model.meta.name;
    this.titleNode.setAttribute("title", model.meta.name);
    this.controls.layer.max = String(model.size[1] - 1);
    this.setLayer(model.size[1] - 1);
    this.buildLabels(model);
    this.showInspector(null);
    const mode = this.getAttribute("mode") === "instructions" ? "instructions" : "explore";
    this.setMode(mode);
    const step = this.getAttribute("step");
    if (step !== null) this.setStep(Number(step));
    const layer = this.getAttribute("layer");
    if (layer !== null) this.setLayer(Number(layer));
    this.layout();
    this.emit("ready", { name: model.meta.name, size: [...model.size], blocks: model.blocks.size });
  }

  private buildLabels(model: Model): void {
    this.labels.replaceChildren();
    this.labelNodes = [];
    this.note = null;
    for (const [kind, ports] of [
      ["input", model.ports.inputs],
      ["output", model.ports.outputs],
    ] as const) {
      for (const p of ports) {
        const node = el("div", {
          className: `label ${kind}`,
          text: `${kind === "input" ? "▶" : "◀"} ${p.name}`,
        });
        this.labels.appendChild(node);
        this.labelNodes.push({ node, pos: p.pos, lift: 1.25 });
      }
    }
    model.annotations.forEach((a, i) => {
      const pin = el("button", { className: "pin", text: "i" });
      pin.type = "button";
      pin.setAttribute("aria-label", `Note ${i + 1}`);
      pin.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this.toggleNote(pin, a.text);
      });
      this.labels.appendChild(pin);
      this.labelNodes.push({ node: pin, pos: a.pos, lift: 0.6 });
    });
  }

  private toggleNote(pin: HTMLElement, text: string): void {
    if (this.note && this.note.dataset.for === pin.getAttribute("aria-label")) {
      this.note.remove();
      this.note = null;
      return;
    }
    this.note?.remove();
    const note = el("div", { className: "note", text });
    note.setAttribute("role", "note");
    note.dataset.for = pin.getAttribute("aria-label") ?? "";
    note.style.left = `${pin.offsetLeft + 14}px`;
    note.style.top = `${pin.offsetTop}px`;
    this.labels.appendChild(note);
    this.note = note;
  }

  private positionLabels(): void {
    const scene = this.scene;
    if (!scene) return;
    for (const { node, pos, lift } of this.labelNodes) {
      const p = scene.isShown(pos) ? scene.project(pos, lift) : null;
      node.hidden = p === null;
      if (p) {
        node.style.left = `${p.x}px`;
        node.style.top = `${p.y}px`;
      }
    }
  }

  private onSelect(info: BlockInfo | null): void {
    this.showInspector(info);
    this.emit("select", info);
  }

  private showInspector(info: BlockInfo | null): void {
    if (!info) {
      const model = this.currentModel;
      const summary: Node[] = [el("h2", { text: model ? model.meta.name : "Inspector" })];
      if (model?.meta.description) summary.push(el("p", { text: model.meta.description }));
      if (model) {
        summary.push(
          el("p", {
            className: "muted",
            text: `${model.blocks.size} blocks, ${model.size.join(" × ")} (x × y × z). ${model.ports.inputs.length} input(s), ${model.ports.outputs.length} output(s).`,
          }),
        );
      }
      summary.push(
        el("p", { className: "muted", text: "Click a block to see its type, states and Bedrock mapping." }),
      );
      this.inspector.replaceChildren(...summary);
      return;
    }
    const dl = (entries: [string, string][]) => {
      const list = el("dl");
      for (const [k, v] of entries) list.append(el("dt", { text: k }), el("dd", { text: v }));
      return list;
    };
    const states = Object.entries(info.states).map(([k, v]) => [k, valueText(v)] as [string, string]);
    const parts: Node[] = [
      el("h2", { text: info.type }),
      dl([["position", `[${info.pos.join(", ")}]`], ...states]),
    ];
    for (const b of info.bedrock) {
      const label = b.offset.some((o) => o !== 0) ? `Bedrock (+[${b.offset.join(",")}])` : "Bedrock";
      parts.push(
        el("h2", { text: label }),
        dl([
          ["id", b.id],
          ...Object.entries(b.states).map(([k, v]) => [k, valueText(v)] as [string, string]),
        ]),
      );
    }
    this.inspector.replaceChildren(...parts);
  }

  private showErrors(diagnostics: readonly Diagnostic[]): void {
    this.stage.hidden = true;
    this.inspector.hidden = true;
    this.titleNode.textContent = "Design has errors";
    const list = el("ul");
    for (const d of diagnostics) {
      const where = d.pos ? ` at [${d.pos.join(",")}]` : d.path ? ` at ${d.path}` : "";
      list.appendChild(
        el(
          "li",
          {},
          el("span", { className: "code", text: d.code }),
          document.createTextNode(` ${d.severity}${where}: ${d.message}`),
          ...(d.hint ? [el("br"), el("span", { className: "hint", text: d.hint })] : []),
        ),
      );
    }
    this.errors.replaceChildren(el("h2", { text: "This design cannot be shown" }), list);
    this.errors.hidden = false;
    this.emit("error", { diagnostics: [...diagnostics] });
  }

  private wireStage(): void {
    let down: { x: number; y: number } | null = null;
    let last: { x: number; y: number } | null = null;
    this.stage.addEventListener("pointerdown", (e) => {
      down = { x: e.clientX, y: e.clientY };
    });
    this.stage.addEventListener("pointermove", (e) => {
      last = { x: e.clientX, y: e.clientY };
      if (e.pointerType === "mouse" && !e.buttons && this.scene)
        this.scene.setHover(this.scene.pick(e.clientX, e.clientY));
    });
    this.stage.addEventListener("pointerleave", () => this.scene?.setHover(null));
    this.stage.addEventListener("pointerup", (e) => {
      if (!down || !this.scene) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved < 5) this.scene.setSelected(this.scene.pick(e.clientX, e.clientY));
    });
    this.stage.addEventListener("keydown", (e) => {
      const scene = this.scene;
      if (!scene) return;
      const step = Math.PI / 12;
      const instructions = scene.mode === "instructions";
      const handled = (() => {
        if (e.shiftKey) {
          const moves: Record<string, Pos> = {
            ArrowLeft: [-1, 0, 0],
            ArrowRight: [1, 0, 0],
            ArrowUp: [0, 0, -1],
            ArrowDown: [0, 0, 1],
            PageUp: [0, 1, 0],
            PageDown: [0, -1, 0],
          };
          const move = moves[e.key];
          if (move) {
            this.moveSelection(move);
            return true;
          }
        }
        switch (e.key) {
          case "ArrowLeft":
            scene.orbit(-step, 0);
            return true;
          case "ArrowRight":
            scene.orbit(step, 0);
            return true;
          case "ArrowUp":
            scene.orbit(0, -step);
            return true;
          case "ArrowDown":
            scene.orbit(0, step);
            return true;
          case "[":
            this.setLayer(scene.layer - 1);
            return true;
          case "]":
            this.setLayer(scene.layer + 1);
            return true;
          case "n":
            if (instructions) this.setStep(scene.step + 1);
            return instructions;
          case "b":
            if (instructions) this.setStep(scene.step - 1);
            return instructions;
          case "r":
            scene.snap("iso");
            return true;
          case "Enter":
            if (last) scene.setSelected(scene.pick(last.x, last.y));
            else this.moveSelection([0, 0, 0]);
            return true;
          case "Escape":
            scene.setSelected(null);
            return true;
          default:
            return false;
        }
      })();
      if (handled) e.preventDefault();
    });
  }

  /**
   * Keyboard selection: moves the selection to the nearest shown block in a direction (Shift+arrows on x and z,
   * Shift+PageUp/PageDown on y). With nothing selected, selects the first shown block.
   */
  private moveSelection(dir: Pos): void {
    const scene = this.scene;
    const model = this.currentModel;
    if (!scene || !model) return;
    const shown = [...model.blocks.keys()]
      .map((k) => k.split(",").map(Number) as unknown as Pos)
      .filter((p) => scene.isShown(p));
    if (shown.length === 0) return;
    const current = scene.selected ? (scene.selected.split(",").map(Number) as unknown as Pos) : null;
    if (!current || (dir[0] === 0 && dir[1] === 0 && dir[2] === 0)) {
      if (!current)
        scene.setSelected(posKey(shown.sort((a, b) => a[1] - b[1] || a[2] - b[2] || a[0] - b[0])[0] as Pos));
      return;
    }
    // The nearest block whose offset points the chosen way, preferring ones on the same line.
    let best: Pos | null = null;
    let bestScore = Infinity;
    for (const p of shown) {
      const d = [p[0] - current[0], p[1] - current[1], p[2] - current[2]];
      const along = (d[0] as number) * dir[0] + (d[1] as number) * dir[1] + (d[2] as number) * dir[2];
      if (along <= 0) continue;
      const off = Math.hypot(
        (d[0] as number) - along * dir[0],
        (d[1] as number) - along * dir[1],
        (d[2] as number) - along * dir[2],
      );
      const score = along + off * 3;
      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (best) scene.setSelected(posKey(best));
  }

  private layout(): void {
    if (!this.scene) return;
    const rect = this.stage.getBoundingClientRect();
    this.root.classList.toggle("narrow", this.root.getBoundingClientRect().width < NARROW_PX);
    if (rect.width > 0 && rect.height > 0)
      this.scene.setSize(Math.floor(rect.width), Math.floor(rect.height));
  }

  private applyHeight(): void {
    const h = this.getAttribute("height");
    if (h === null) return;
    // Numbers are pixels; otherwise only simple CSS lengths are accepted.
    if (/^\d{1,5}$/.test(h)) this.style.height = `${h}px`;
    else if (/^\d{1,5}(\.\d+)?(px|vh|vw|em|rem|%)$/.test(h)) this.style.height = h;
  }

  private readonly onMedia = () => this.applyTheme();

  private applyTheme(): void {
    const attr = this.getAttribute("theme");
    let theme: ThemeName;
    if (attr === "light" || attr === "dark") {
      theme = attr;
    } else {
      this.media ??= globalThis.matchMedia?.("(prefers-color-scheme: dark)") ?? null;
      this.media?.removeEventListener("change", this.onMedia);
      this.media?.addEventListener("change", this.onMedia);
      theme = this.media?.matches ? "dark" : "light";
    }
    for (const [k, v] of Object.entries(THEMES[theme].css)) this.style.setProperty(k, v);
    this.scene?.setTheme(theme);
  }

  private emit(type: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
    if (globalThis.parent && globalThis.parent !== globalThis.window) {
      try {
        globalThis.parent.postMessage(
          { source: MESSAGE_SOURCE, type, detail: JSON.parse(JSON.stringify(detail ?? null)) },
          "*",
        );
      } catch {
        // A parent that cannot receive messages is not our problem.
      }
    }
  }
}

/** Registers `<redstone-viewer>` once. Safe to call more than once. */
export function defineRedstoneViewer(): void {
  if (!customElements.get(ELEMENT_NAME)) customElements.define(ELEMENT_NAME, RedstoneViewer);
}

declare global {
  interface HTMLElementTagNameMap {
    "redstone-viewer": RedstoneViewer;
  }
}
