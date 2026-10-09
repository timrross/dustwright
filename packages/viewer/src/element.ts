import { inBounds, LIMITS, parse, parseText, posKey } from "@dustwright/core";
import type { Diagnostic, Model, Pos, Severity, StateValue } from "@dustwright/core";
import { GAME_TICKS_PER_REDSTONE_TICK, MECHANICS, SETTLE_TICKS, settle, Simulation } from "@dustwright/sim";
import { checkStatic } from "@dustwright/validator/static";
import { THEMES, type ThemeName } from "./palette.js";
import { type BlockInfo, type SnapView, type ViewerMode, ViewerScene } from "./scene.js";
import { parseAllowedOrigins, parseCommand } from "./messages.js";
import { VIEWER_CSS } from "./styles.js";

/** The custom element name. */
export const ELEMENT_NAME = "redstone-viewer";

/** Below this width the inspector becomes a bottom sheet. */
const NARROW_PX = 520;

/** Game ticks the power view's free run lasts (no inputs set): 10 seconds. */
export const FREE_RUN_TICKS = 200;

/**
 * The power view refuses designs whose longest possible run (blocks x game ticks, settle cap included) exceeds
 * this, so a large design cannot freeze the page. A run this size takes well under a second.
 */
const POWER_VIEW_WORK = 2_000_000;

/** Formats a game-tick count as redstone ticks (halves when needed). */
const redstoneTicks = (gameTicks: number) => String(gameTicks / GAME_TICKS_PER_REDSTONE_TICK);

/** At most this many cells get a diagnostic marker; the rest are still listed in the inspector summary. */
export const MAX_MARKERS = 256;

const SEVERITY_RANK: Record<Severity, number> = { error: 2, warning: 1, info: 0 };

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
 * `theme` (light | dark | auto), `allowed-origins`. Diagnostics from the stage 1 and 2 rules (or from
 * `setDiagnostics`) show as markers on the blocks they blame. Events (DOM and, inside an iframe, postMessage to the
 * parent): `ready`, `select`, `step`, `power`, `error`. Inside an iframe, the parent may send `setStep`, `setLayer`
 * and `setMode` commands from an origin in `allowed-origins` (see messages.ts and docs/embedding.md).
 */
export class RedstoneViewer extends HTMLElement {
  static readonly observedAttributes = ["src", "mode", "layer", "step", "height", "theme", "allowed-origins"];

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
    power: HTMLSelectElement;
    powerTick: HTMLInputElement;
    powerLabel: HTMLSpanElement;
    powerGroup: HTMLSpanElement;
  };
  /** The power view: which run is shown, the simulation at `tick`, and where the inputs are set. */
  private power: {
    test: number | "free";
    sim: Simulation;
    settleTicks: number;
    maxTick: number;
  } | null = null;
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
    const power = el("select");
    power.setAttribute("aria-label", "Power view: show simulated power for a test case");
    power.addEventListener("change", () =>
      this.setPowerView(power.value === "" ? null : power.value === "free" ? "free" : Number(power.value)),
    );
    const powerTick = range("Simulated tick", 0, 0, 1);
    powerTick.addEventListener("input", () => this.setPowerTick(Number(powerTick.value)));
    const powerLabel = el("span", { className: "muted" });
    powerLabel.setAttribute("aria-live", "polite");
    const powerGroup = el(
      "span",
      { className: "group" },
      el("span", { text: "Power", className: "wide-only" }),
      power,
    );
    const powerTickGroup = el("span", { className: "group" }, powerTick, powerLabel);
    powerTickGroup.hidden = true;
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
      powerGroup,
      powerTickGroup,
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
      power,
      powerTick,
      powerLabel,
      powerGroup: powerTickGroup,
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
    globalThis.addEventListener("message", this.onMessage);
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
    globalThis.removeEventListener("message", this.onMessage);
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

  /** Diagnostics for the loaded design: the stage 1 and 2 findings, or what `setDiagnostics` last set. */
  get diagnostics(): readonly Diagnostic[] {
    return this.currentDiagnostics;
  }

  /**
   * Replaces the diagnostics shown as markers, for hosts that run more checks (such as the stage 3 simulator) than
   * the viewer does. Takes effect for the loaded design; the next `load` recomputes them.
   */
  setDiagnostics(diagnostics: readonly Diagnostic[]): void {
    this.currentDiagnostics = [...diagnostics];
    const model = this.currentModel;
    if (!model || !this.scene) return;
    this.buildLabels(model);
    this.positionLabels();
    this.showInspector(this.scene.info(this.scene.selected));
  }

  /** Rebuilds the power view's choices for a newly loaded design and turns the view off. */
  private resetPowerView(model: Model): void {
    this.power = null;
    const select = this.controls.power;
    const option = (value: string, text: string) => {
      const o = el("option", { text });
      o.value = value;
      return o;
    };
    select.replaceChildren(
      option("", "Off"),
      option("free", "Free run"),
      ...model.tests.map((t, i) =>
        option(
          String(i),
          `Test ${i + 1}: ${
            Object.entries(t.set)
              .map(([k, v]) => `${k}=${v}`)
              .join(" ") || "no input"
          }`,
        ),
      ),
    );
    select.value = "";
    this.controls.powerGroup.hidden = true;
  }

  /**
   * Shows simulated power: `"free"` runs the design with no inputs set, a number runs that test case (settle, then
   * its `set`, then `afterTicks`), and null goes back to the design as written. Starts at the end of the run.
   * Returns false when the design is too large to simulate here.
   */
  setPowerView(test: number | "free" | null): boolean {
    try {
      return this.showPower(test);
    } catch (err) {
      this.failPower(err);
      return false;
    }
  }

  /** A simulator error turns the power view off with a message instead of breaking the toolbar. */
  private failPower(err: unknown): void {
    this.power = null;
    this.scene?.setBlocks(null);
    this.controls.power.value = "";
    this.controls.powerGroup.hidden = false;
    this.controls.powerLabel.textContent = `simulator error: ${(err as Error).message}`;
  }

  private showPower(test: number | "free" | null): boolean {
    const model = this.currentModel;
    const scene = this.scene;
    if (!model || !scene) return false;
    if (test === null || (test !== "free" && !model.tests[test])) {
      this.power = null;
      this.controls.power.value = "";
      this.controls.powerGroup.hidden = true;
      scene.setBlocks(null);
      this.showInspector(scene.info(scene.selected));
      this.positionLabels();
      return test === null;
    }
    // Checked before anything runs: the longest run is the settle cap plus afterTicks.
    const after = test === "free" ? 0 : (model.tests[test]?.afterTicks ?? 0) * GAME_TICKS_PER_REDSTONE_TICK;
    const longest = test === "free" ? FREE_RUN_TICKS : SETTLE_TICKS * GAME_TICKS_PER_REDSTONE_TICK + after;
    if (model.blocks.size * longest > POWER_VIEW_WORK) {
      this.controls.powerLabel.textContent = "too large to simulate here";
      this.controls.powerGroup.hidden = false;
      return false;
    }
    const settleTicks = test === "free" ? 0 : settle(model, MECHANICS[model.meta.edition]).tick;
    const maxTick = test === "free" ? FREE_RUN_TICKS : settleTicks + after;
    if (this.scene?.mode === "instructions") this.setMode("explore");
    this.power = { test, sim: new Simulation(model, MECHANICS[model.meta.edition]), settleTicks, maxTick };
    this.controls.power.value = String(test);
    this.controls.powerTick.max = String(maxTick);
    this.controls.powerGroup.hidden = false;
    this.showPowerTick(maxTick);
    return true;
  }

  /** Moves the power view to game tick `tick` (clamped; a redstone tick is 2 game ticks) and emits `power`. */
  setPowerTick(tick: number): void {
    try {
      this.showPowerTick(tick);
    } catch (err) {
      this.failPower(err);
    }
  }

  private showPowerTick(tick: number): void {
    const power = this.power;
    const model = this.currentModel;
    if (!power || !model || !this.scene || Number.isNaN(tick)) return;
    const target = Math.max(0, Math.min(power.maxTick, Math.round(tick)));
    // The run is deterministic, so going back means starting again; going forward continues.
    if (power.sim.tick > target) power.sim = new Simulation(model, MECHANICS[model.meta.edition]);
    const test = power.test === "free" ? null : model.tests[power.test];
    const applySetAt = (sim: Simulation) => {
      if (test && sim.tick === power.settleTicks) {
        for (const [name, value] of Object.entries(test.set)) {
          const port = model.ports.inputs.find((p) => p.name === name);
          if (port) sim.setInput(port.pos, value);
        }
      }
    };
    if (power.sim.tick === 0) applySetAt(power.sim);
    while (power.sim.tick < target) {
      power.sim.step();
      applySetAt(power.sim);
    }
    this.scene.setBlocks(power.sim.snapshot().blocks);
    this.controls.powerTick.value = String(target);
    const phase = test
      ? target < power.settleTicks
        ? "settling"
        : `inputs set at ${redstoneTicks(power.settleTicks)}`
      : "no inputs";
    this.controls.powerLabel.textContent = `tick ${redstoneTicks(target)} / ${redstoneTicks(power.maxTick)} (${phase})`;
    this.showInspector(this.scene.info(this.scene.selected));
    this.positionLabels();
    this.emit("power", {
      test: power.test,
      tick: target,
      maxTick: power.maxTick,
      settleTicks: power.settleTicks,
    });
  }

  /** The power view's state, or null when it is off. Ticks are game ticks (a redstone tick is 2). */
  get powerView(): { test: number | "free"; tick: number; maxTick: number; settleTicks: number } | null {
    const p = this.power;
    return p ? { test: p.test, tick: p.sim.tick, maxTick: p.maxTick, settleTicks: p.settleTicks } : null;
  }

  /** The block drawn at `pos` now (simulated in the power view), for tests and host pages. */
  shownBlock(pos: Pos): { type: string; states: Record<string, StateValue> } | null {
    const info = this.scene?.info(posKey(pos));
    return info ? { type: info.type, states: { ...info.states } } : null;
  }

  /** Cells that carry a diagnostic marker, as `x,y,z` keys (tests and host pages). */
  markedCells(): string[] {
    return this.labelNodes.filter((l) => l.node.classList.contains("marker")).map((l) => posKey(l.pos));
  }

  /**
   * Loads a design from JSON text or a decoded object. It goes through the stage 1 parser first; a design with
   * errors shows its diagnostics instead of the canvas.
   */
  load(design: unknown): boolean {
    this.loadToken++;
    const result = typeof design === "string" ? parseText(design) : parse(design);
    this.currentDiagnostics = result.model
      ? [...result.diagnostics, ...checkStatic(result.model)]
      : result.diagnostics;
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
    if (mode === "instructions" && this.power) this.setPowerView(null);
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
    this.resetPowerView(model);
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
    this.buildMarkers(model);
  }

  /** Diagnostics that blame a cell of the design, grouped by cell. */
  private diagnosticsByCell(model: Model): Map<string, Diagnostic[]> {
    const cells = new Map<string, Diagnostic[]>();
    for (const d of this.currentDiagnostics) {
      if (!d.pos || !inBounds(d.pos, model.size)) continue;
      const key = posKey(d.pos);
      cells.set(key, [...(cells.get(key) ?? []), d]);
    }
    return cells;
  }

  /** One marker per blamed cell, coloured by its worst severity. Clicking it selects the block. */
  private buildMarkers(model: Model): void {
    let count = 0;
    for (const [key, list] of this.diagnosticsByCell(model)) {
      if (count++ >= MAX_MARKERS) break;
      const pos = list[0]?.pos as Pos;
      const worst = list.reduce<Severity>(
        (w, d) => (SEVERITY_RANK[d.severity] > SEVERITY_RANK[w] ? d.severity : w),
        "info",
      );
      const marker = el("button", { className: `marker ${worst}`, text: worst === "error" ? "×" : "!" });
      marker.type = "button";
      marker.dataset.pos = key;
      const codes = [...new Set(list.map((d) => d.code))].join(", ");
      marker.setAttribute(
        "aria-label",
        `${list.length} ${list.length === 1 ? "problem" : "problems"} at [${key}]: ${codes}`,
      );
      marker.setAttribute("title", list.map((d) => `${d.code} ${d.severity}: ${d.message}`).join("\n"));
      marker.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this.select(pos);
      });
      this.labels.appendChild(marker);
      this.labelNodes.push({ node: marker, pos, lift: 1 });
    }
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
      const errors = this.currentDiagnostics.filter((d) => d.severity === "error").length;
      const warnings = this.currentDiagnostics.filter((d) => d.severity === "warning").length;
      if (errors + warnings > 0) {
        summary.push(
          el("p", {
            text: `${errors} error(s), ${warnings} warning(s). Markers show the blocks they concern; click one for details.`,
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
    const simulated: [string, string][] = this.power
      ? [[`power at tick ${redstoneTicks(this.power.sim.tick)}`, String(this.power.sim.powerAt(info.pos))]]
      : [];
    const parts: Node[] = [
      el("h2", { text: info.type }),
      dl([["position", `[${info.pos.join(", ")}]`], ...states, ...simulated]),
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
    const problems = this.currentModel
      ? this.diagnosticsByCell(this.currentModel).get(posKey(info.pos))
      : undefined;
    if (problems) {
      const list = el("ul", { className: "problems" });
      for (const d of problems) {
        list.appendChild(
          el(
            "li",
            { className: d.severity },
            el("span", { className: "code", text: d.code }),
            document.createTextNode(` ${d.severity}: ${d.message}`),
            ...(d.hint ? [el("br"), el("span", { className: "hint", text: d.hint })] : []),
          ),
        );
      }
      parts.push(el("h2", { text: "Problems" }), list);
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

  /** The origins allowed to send commands, from the `allowed-origins` attribute. */
  get allowedOrigins(): string[] {
    return parseAllowedOrigins(this.getAttribute("allowed-origins"));
  }

  /**
   * A command from the parent window: accepted only from the parent, only from an allowed origin, and only in a
   * documented shape (parseCommand); everything else is dropped without a word.
   */
  private readonly onMessage = (ev: MessageEvent): void => {
    if (globalThis.parent === globalThis.window || ev.source !== globalThis.parent) return;
    if (!this.allowedOrigins.includes(ev.origin)) return;
    const command = parseCommand(ev.data);
    if (!command) return;
    if (command.type === "setStep") this.setStep(command.step);
    else if (command.type === "setLayer") this.setLayer(command.layer);
    else this.setMode(command.mode);
  };

  /** The current build step (instructions mode). */
  get step(): number {
    return this.scene?.step ?? 0;
  }

  private emit(type: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
    if (globalThis.parent && globalThis.parent !== globalThis.window) {
      // With allowed-origins set, events go only to those origins; without, to any parent, as they carry nothing
      // the embedding page could not read from the design itself.
      const targets = this.allowedOrigins;
      const message = { source: MESSAGE_SOURCE, type, detail: JSON.parse(JSON.stringify(detail ?? null)) };
      for (const target of targets.length > 0 ? targets : ["*"]) {
        try {
          globalThis.parent.postMessage(message, target);
        } catch {
          // A parent that cannot receive messages is not our problem.
        }
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
