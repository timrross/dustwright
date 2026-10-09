import {
  ALL_FACES,
  attachedFace,
  conducts,
  dustConnections,
  dustNeighbours,
  dustPointsInto,
  HORIZONTAL,
  isSupported,
  keyPos,
  OPPOSITE,
  outputFace,
  posKey,
  registryEntry,
  stepPos,
} from "@dustwright/core";
import type {
  Block,
  BlockLookup,
  Face,
  Model,
  Pos,
  SimClass,
  SimMechanics,
  StateValue,
} from "@dustwright/core";
import { BEDROCK_MECHANICS } from "./mechanics.js";

/*
 * VERIFY-IN-GAME: Bedrock behaviour this simulator assumes without pinned data or a measurement. The M6 game
 * cross-check (deploy/test-world/measure-timing.mjs) measured only the observer timing and the T flip-flop; every
 * item here is unproven until a probe measures it, and the game wins wherever they differ:
 * - a redstone block powers components and dust next to it, but not blocks;
 * - a lever, button or plate strongly powers the block it is attached to; a lit torch the block above it;
 * - dust weakly powers the block under it and the blocks it points into; weak power reaches components, not dust;
 * - a comparator's side reads only dust, diodes and redstone blocks (a lever beside it counts as 0);
 * - only a powered repeater or comparator pointing into its side locks a repeater;
 * - a piston is not powered through its front face, and there is no quasi-connectivity;
 * - everything that needs support (dust, torches, diodes, levers, buttons, plates, doors) breaks when pushed;
 * - an observer ignores changes while its pulse is scheduled or on;
 * - a door is powered through either half; pistons do not see a door's upper half as a block.
 */

/** The piston head a piston places in front of itself while extended. Not a registry type. */
export const PISTON_HEAD = "piston_head";

/**
 * A block in the simulated world, with the state the simulator tracks for it. Behaviour comes from the registry's
 * `sim.class` and `sim.params`, never from the type name, so a new block needs only its registry file.
 */
interface Cell {
  /** Unique per cell for the whole run, so an observer can tell a moved-in block from the one that left. */
  id: number;
  /** Bumped on every change of the cell's state; with `id`, what an observer compares. */
  version: number;
  /** Where the cell is now (pistons move cells). */
  pos: Pos;
  type: string;
  /** The registry behaviour class (`head` for a piston head, which is not a registry type). */
  cls: SimClass | "head";
  params: Readonly<Record<string, unknown>>;
  /** Consumers: the state that shows they are powered (`lit`, `open`), or null to keep it in `level`. */
  outState: string | null;
  states: Record<string, StateValue>;
  /** Dust power, a comparator's output level, or a note block's power (0 or 1). */
  level: number;
  /** Pistons: extended. */
  extended: boolean;
  /** A pending change: the tick it lands on and the value it sets (see `apply`). */
  pending: { at: number; value: number } | null;
  /** Repeaters: the tick their scheduled toggle fires. Buttons: the tick they release. Otherwise -1. */
  timer: number;
  /** Observers: the ticks their output turns on and off, or -1. */
  pulseOn: number;
  pulseOff: number;
  /** Observers: what they saw in front of them last tick. */
  watched: string;
  /** Dust: its level before the last refresh. */
  last: number;
}

/** What the viewer draws for one tick: every block with its simulated states (pistons get `extended`). */
export interface SimSnapshot {
  tick: number;
  blocks: Map<string, Block>;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
/** Work units one dust cell costs per refresh, against one for any other cell (calibrated by timing). */
const DUST_WORK = 8;
/** Extra work units for each power check a consumer or piston makes per tick (its six neighbours). */
const POWER_CHECK_WORK = 10;
const isContainer = (c: Cell) => c.params.container === true;
/** Slime and honey: solid blocks marked sticky. Pistons are sticky too, but that means they pull. */
const isStickyBlock = (c: Cell) => c.cls === "solid" && c.params.sticky === true;

/**
 * One run of the approximate Bedrock simulator over a design. Time advances in game ticks with `step()` (a
 * redstone tick is two; `stepRedstone()` advances one). At
 * every tick the power field (block power, dust levels) follows instantly from the state; components react to it
 * after their delay. A pure function of the model and the inputs: no randomness, no wall clock, and memory bounded
 * by the design (pistons add at most one head each and move blocks one cell at a time).
 */
export class Simulation {
  /** The current game tick (a redstone tick is 2 game ticks). */
  tick = 0;
  /** Cell updates done so far, for the caller's work budget. */
  work = 0;
  /** Set when the run touched something the simulator does not model; the case is then skipped (T003). */
  unsupported: string | null = null;

  private cells = new Map<string, Cell>();
  private nextId = 1;
  /** Set by `refresh` when a dust level changed. */
  private levelsChanged = false;
  private strong = new Map<string, number>();
  private weak = new Map<string, number>();
  private readonly mechanics: SimMechanics;
  readonly at: BlockLookup = (p) => this.cells.get(posKey(p));

  constructor(
    private readonly model: Model,
    mechanics: SimMechanics = BEDROCK_MECHANICS,
  ) {
    this.mechanics = mechanics;
    for (const [key, b] of model.blocks) {
      const c = this.newCell(keyPos(key), b.type, { ...b.states });
      if (c.cls === "comparator" && b.states.powered === true) c.level = 15;
      this.cells.set(key, c);
    }
    for (const [key, c] of this.cells) {
      if (c.cls === "source" && c.params.input === "none" && typeof c.params.constant !== "number")
        this.unsupported ??= `the ${c.type} at [${key}] gives power that depends on the time of day`;
      if (c.cls === "comparator") {
        const back = this.cells.get(posKey(stepPos(c.pos, OPPOSITE[str(c.states.facing) as Face])));
        if (back && isContainer(back))
          this.unsupported ??= `the comparator at [${key}] reads a ${back.type}'s contents`;
      }
    }
    this.refresh();
    // An observer sees a change at build time only if the block it watches is placed after it. The function
    // exports place building blocks, then components, then power sources, each by y, z, x (ADR 0006).
    const group = (type: string) => {
      const category = registryEntry(type)?.category;
      return category === "solid" || category === "transparent" ? 0 : category === "power_source" ? 2 : 1;
    };
    const order = new Map(
      [...this.cells]
        .map(([key, c]) => ({ key, pos: keyPos(key), g: group(c.type) }))
        .sort((a, b) => a.g - b.g || a.pos[1] - b.pos[1] || a.pos[2] - b.pos[2] || a.pos[0] - b.pos[0])
        .map((e, i) => [e.key, i]),
    );
    for (const [key, c] of this.cells) {
      if (c.cls !== "observer") continue;
      const front = stepPos(keyPos(key), str(c.states.facing) as Face);
      const placedAfter = (order.get(posKey(front)) ?? -1) > (order.get(key) ?? 0);
      if (!placedAfter) c.watched = this.signature(front);
    }
  }

  private newCell(pos: Pos, type: string, states: Record<string, StateValue>): Cell {
    const entry = registryEntry(type);
    return {
      id: this.nextId++,
      version: 0,
      pos,
      type,
      cls: entry?.sim.class ?? "head",
      params: entry?.sim.params ?? {},
      outState: entry ? (["lit", "open"].find((k) => k in entry.states) ?? null) : null,
      states,
      level: 0,
      extended: false,
      pending: null,
      timer: -1,
      pulseOn: -1,
      pulseOff: -1,
      watched: "",
      last: 0,
    };
  }

  // ---- Power field --------------------------------------------------------------------------------------------

  /** Recomputes block power and dust levels from the current state. */
  private refresh(): void {
    this.work += this.cells.size;
    const strong = new Map<string, number>();
    const raise = (m: Map<string, number>, p: Pos, level: number) => {
      if (level <= 0 || !conducts(this.at(p), this.mechanics.id)) return;
      const k = posKey(p);
      if ((m.get(k) ?? 0) < level) m.set(k, level);
    };
    for (const c of this.cells.values()) {
      const p = c.pos;
      const out = this.emitted(c);
      if (out > 0) {
        const face = outputFace(c);
        if (face) raise(strong, stepPos(p, face), out);
      }
      // A lit torch strongly powers the block above it; a switched-on source (lever, button, plate) the block it
      // is attached to. A constant source (redstone block) powers components and dust, not blocks.
      if (c.cls === "torch" && c.states.lit === true) raise(strong, stepPos(p, "up"), 15);
      if (c.cls === "source" && typeof c.params.constant !== "number" && this.sourceLevel(c) > 0) {
        const face = attachedFace(c);
        if (face) raise(strong, stepPos(p, face), 15);
      }
    }
    this.strong = strong;

    // Dust: seeds from sources, diodes and strongly powered blocks, then one level less per connected dust.
    const buckets: Cell[][] = Array.from({ length: 16 }, () => []);
    const dust: Cell[] = [];
    for (const c of this.cells.values()) {
      if (c.cls !== "dust") continue;
      dust.push(c);
      c.last = c.level;
      const p = c.pos;
      let seed = 0;
      for (const f of ALL_FACES) {
        const q = stepPos(p, f);
        const n = this.cells.get(posKey(q));
        if (!n) continue;
        seed = Math.max(seed, this.sourceLevel(n));
        if (outputFace(n) === OPPOSITE[f]) seed = Math.max(seed, this.emitted(n));
        seed = Math.max(seed, strong.get(posKey(q)) ?? 0);
      }
      c.level = seed;
      buckets[seed]?.push(c);
    }
    // Dust costs more than other cells (its connections are looked up), so it weighs more in the work budget.
    this.work += DUST_WORK * dust.length;
    for (let level = 15; level > 1; level--) {
      for (const c of buckets[level] as Cell[]) {
        if (c.level !== level) continue;
        for (const q of dustNeighbours(this.at, c.pos, this.mechanics.id)) {
          const n = this.cells.get(posKey(q)) as Cell;
          if (n.level < level - 1) {
            n.level = level - 1;
            buckets[level - 1]?.push(n);
          }
        }
      }
    }
    this.levelsChanged = false;
    for (const c of dust) {
      if (c.level === c.last) continue;
      c.version++;
      this.levelsChanged = true;
    }
    const weak = new Map<string, number>();
    for (const c of dust) {
      if (c.level === 0) continue;
      const p = c.pos;
      raise(weak, stepPos(p, "down"), c.level);
      // Connections once per dust: it powers a side block when every connection lies on that axis (or none).
      const dirs = [...dustConnections(this.at, p, this.mechanics.id)];
      for (const f of HORIZONTAL) {
        if (dirs.every((d) => d === f || d === OPPOSITE[f])) raise(weak, stepPos(p, f), c.level);
      }
    }
    this.weak = weak;
  }

  /** What a power source gives to everything next to it (0 when off). */
  private sourceLevel(c: Cell): number {
    if (c.cls === "torch") return c.states.lit === true ? 15 : 0;
    if (c.cls !== "source") return 0;
    if (typeof c.params.constant === "number") return c.params.constant;
    if (c.params.input === "hold") return c.states.on === true ? 15 : 0;
    if (c.params.input === "pulse") return c.states.pressed === true ? 15 : 0;
    return 0;
  }

  /** What a diode or observer outputs from its front (repeater, comparator) or back (observer). */
  private emitted(c: Cell): number {
    if (c.cls === "repeater" || c.cls === "observer") return c.states.powered === true ? 15 : 0;
    if (c.cls === "comparator") return c.level;
    return 0;
  }

  /** Power of a conducting block: the strong power into it, or the dust power it takes. */
  private blockPower(p: Pos): number {
    const k = posKey(p);
    return Math.max(this.strong.get(k) ?? 0, this.weak.get(k) ?? 0);
  }

  /** The signal a diode at `p` reads from the cell on its face `f` (its back, or a side). */
  private inputFrom(p: Pos, f: Face, sideOnly = false): number {
    const q = stepPos(p, f);
    const n = this.cells.get(posKey(q));
    if (!n) return 0;
    if (n.cls === "dust") return n.level;
    if (outputFace(n) === OPPOSITE[f]) return this.emitted(n);
    if (sideOnly) return typeof n.params.constant === "number" ? n.params.constant : 0;
    if (conducts(n, this.mechanics.id)) return this.blockPower(q);
    return this.sourceLevel(n);
  }

  /**
   * Whether a component at `p` is powered: a source next to it (a torch not hanging on it), a diode or observer
   * outputting into it, dust lying on it or pointing into it, or a powered conducting block beside it. `skip`
   * leaves out one face (a piston's front).
   */
  private poweredAt(p: Pos, skip?: Face): boolean {
    for (const f of ALL_FACES) {
      if (f === skip) continue;
      const q = stepPos(p, f);
      const n = this.cells.get(posKey(q));
      if (!n) continue;
      if (n.cls === "torch" && attachedFace(n) === OPPOSITE[f]) continue;
      if (this.sourceLevel(n) > 0) return true;
      if (outputFace(n) === OPPOSITE[f] && this.emitted(n) > 0) return true;
      if (n.cls === "dust" && n.level > 0) {
        if (f === "up" || (f !== "down" && dustPointsInto(this.at, q, OPPOSITE[f], this.mechanics.id)))
          return true;
        continue;
      }
      if (conducts(n, this.mechanics.id) && this.blockPower(q) > 0) return true;
    }
    return false;
  }

  // ---- Ticks --------------------------------------------------------------------------------------------------

  /** Advances one redstone tick (two game ticks); returns whether anything changed or is still scheduled. */
  stepRedstone(): boolean {
    const a = this.step();
    const b = this.step();
    return a || b;
  }

  /**
   * Advances one game tick. Returns whether anything changed or is still scheduled; once it returns false the
   * state is a fixed point and further ticks change nothing.
   */
  step(): boolean {
    const t = this.tick;
    const timing = this.mechanics.timing;
    const updates: [Cell, () => void][] = [];
    const pistons: { cell: Cell; key: string; extend: boolean }[] = [];
    let active = false;

    // Schedules a change of a one-value state, landing `delay` ticks from now unless it is already on its way.
    const want = (c: Cell, current: number, desired: number, delay: number, set: (v: number) => void) => {
      if (desired === current) c.pending = null;
      else if (!c.pending || c.pending.value !== desired) c.pending = { at: t + delay, value: desired };
      if (c.pending && c.pending.at <= t + 1) {
        const v = c.pending.value;
        c.pending = null;
        updates.push([c, () => set(v)]);
      }
      if (c.pending) active = true;
    };

    for (const c of this.cells.values()) {
      const p = c.pos;
      switch (c.cls) {
        case "torch": {
          const face = attachedFace(c);
          const lit = face ? this.blockPower(stepPos(p, face)) === 0 : true;
          want(c, c.states.lit === true ? 1 : 0, lit ? 1 : 0, timing.torch, (v) => (c.states.lit = v === 1));
          break;
        }
        case "repeater": {
          const facing = str(c.states.facing) as Face;
          const sides = HORIZONTAL.filter((f) => f !== facing && f !== OPPOSITE[facing]);
          const locked = sides.some((f) => {
            const n = this.cells.get(posKey(stepPos(p, f)));
            return (
              !!n &&
              (n.cls === "repeater" || n.cls === "comparator") &&
              outputFace(n) === OPPOSITE[f] &&
              this.emitted(n) > 0
            );
          });
          if (locked) {
            c.timer = -1;
            break;
          }
          const input = this.inputFrom(p, OPPOSITE[facing]) > 0;
          const delay = timing.repeater * (typeof c.states.delay === "number" ? c.states.delay : 1);
          if (c.timer < 0 && input !== (c.states.powered === true)) c.timer = t + delay;
          if (c.timer >= 0 && c.timer <= t + 1) {
            c.timer = -1;
            updates.push([c, () => (c.states.powered = c.states.powered !== true)]);
          }
          if (c.timer >= 0) active = true;
          break;
        }
        case "comparator": {
          const facing = str(c.states.facing) as Face;
          const rear = this.inputFrom(p, OPPOSITE[facing]);
          const side = Math.max(
            ...HORIZONTAL.filter((f) => f !== facing && f !== OPPOSITE[facing]).map((f) =>
              this.inputFrom(p, f, true),
            ),
          );
          const out = c.states.mode === "subtract" ? Math.max(rear - side, 0) : rear >= side ? rear : 0;
          want(c, c.level, out, timing.comparator, (v) => {
            c.level = v;
            c.states.powered = v > 0;
          });
          break;
        }
        case "observer": {
          const front = stepPos(p, str(c.states.facing) as Face);
          const seen = this.signature(front);
          if (seen !== c.watched && c.pulseOn < 0 && c.pulseOff < 0) {
            c.pulseOn = t + timing.observer;
            c.pulseOff = t + timing.observer + timing.observerPulse;
          }
          c.watched = seen;
          if (c.pulseOn >= 0 && c.pulseOn <= t + 1) {
            c.pulseOn = -1;
            updates.push([c, () => (c.states.powered = true)]);
          }
          if (c.pulseOff >= 0 && c.pulseOff <= t + 1) {
            c.pulseOff = -1;
            updates.push([c, () => (c.states.powered = false)]);
          }
          if (c.pulseOn >= 0 || c.pulseOff >= 0) active = true;
          break;
        }
        case "source": {
          // A pulse source (button) releases on its own; a held one (lever, plate) changes only by `setInput`.
          if (c.timer >= 0 && c.timer <= t + 1) {
            c.timer = -1;
            updates.push([c, () => (c.states.pressed = false)]);
          }
          if (c.timer >= 0) active = true;
          break;
        }
        case "consumer": {
          if (c.params.output !== "binary") break;
          this.work += POWER_CHECK_WORK;
          // A block that fills more cells (a door's upper half) is powered through any of them.
          const cells = [
            p,
            ...(registryEntry(c.type)?.occupies ?? []).map(
              (o) => [p[0] + o[0], p[1] + o[1], p[2] + o[2]] as Pos,
            ),
          ];
          const on = cells.some((q) => this.poweredAt(q)) ? 1 : 0;
          const key = c.outState;
          // A lamp may go dark later than it lights (Java: 0 to light, 4 to go dark).
          const delay = on === 0 && c.type === "lamp" ? (timing.lampOff ?? timing.consumer) : timing.consumer;
          if (key) want(c, c.states[key] === true ? 1 : 0, on, delay, (v) => (c.states[key] = v === 1));
          else want(c, c.level, on, delay, (v) => (c.level = v));
          break;
        }
        case "piston": {
          this.work += POWER_CHECK_WORK;
          const front = str(c.states.facing) as Face;
          // Java's quasi-connectivity: power at the block above counts too (not from the piston's own cell below).
          // VERIFY-IN-GAME: the game reacts only when the piston gets a block update; this reacts at once.
          const qc = this.mechanics.quasiConnectivity && this.poweredAt(stepPos(p, "up"), "down");
          const on = this.poweredAt(p, front) || qc ? 1 : 0;
          want(c, c.extended ? 1 : 0, on, timing.piston, (v) =>
            pistons.push({ cell: c, key: posKey(p), extend: v === 1 }),
          );
          break;
        }
      }
    }

    for (const [c, u] of updates) {
      u();
      c.version++;
    }
    pistons.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    let moved = false;
    // Pistons act in a fixed order. One may move another this tick; the moved one acts again next tick.
    for (const { cell, key, extend } of pistons) {
      if (this.cells.get(key) !== cell) continue;
      moved = (extend ? this.extend(cell) : this.retract(cell)) || moved;
    }
    if (pistons.length > 0) this.dropUnsupported();
    this.tick++;
    this.refresh();
    return active || updates.length > 0 || moved || this.levelsChanged;
  }

  /** What an observer sees at `p`: which block is there, and how many times it changed. */
  private signature(p: Pos): string {
    const c = this.cells.get(posKey(p));
    return c ? `${c.id}.${c.version}` : "";
  }

  // ---- Pistons ------------------------------------------------------------------------------------------------

  /** Components break when pushed (anything that needs support, and doors). */
  private breaksWhenPushed(c: Cell): boolean {
    return !!registryEntry(c.type)?.needsSupport;
  }

  private immovable(c: Cell): boolean {
    return c.cls === "head" || (c.cls === "piston" && c.extended);
  }

  /** Marks the run unsupported for blocks whose push behaviour is not modelled. */
  private checkModelled(c: Cell, key: string): boolean {
    if (isContainer(c)) this.unsupported ??= `a piston moves the ${c.type} at [${key}]`;
    else if (isStickyBlock(c))
      this.unsupported ??= `a piston moves the ${c.type} at [${key}] (sticky blocks)`;
    else return true;
    return false;
  }

  /** Extends a piston, pushing up to the push limit. Returns whether it moved. */
  private extend(piston: Cell): boolean {
    if (piston.cls !== "piston" || piston.extended) return false;
    const facing = str(piston.states.facing) as Face;
    const p = piston.pos;
    const line: Cell[] = [];
    let destroy: string | null = null;
    for (let q = stepPos(p, facing); ; q = stepPos(q, facing)) {
      const c = this.cells.get(posKey(q));
      if (!c) break;
      if (this.immovable(c)) return false;
      if (this.breaksWhenPushed(c)) {
        destroy = posKey(q);
        break;
      }
      if (!this.checkModelled(c, posKey(q))) return false;
      line.push(c);
      if (line.length > this.mechanics.pushLimit) return false;
    }
    if (destroy) this.cells.delete(destroy);
    for (let i = line.length - 1; i >= 0; i--) {
      const c = line[i] as Cell;
      this.cells.delete(posKey(c.pos));
      c.pos = stepPos(c.pos, facing);
      this.cells.set(posKey(c.pos), c);
    }
    const head = stepPos(p, facing);
    this.cells.set(
      posKey(head),
      this.newCell(head, PISTON_HEAD, { facing, sticky: piston.params.sticky === true }),
    );
    piston.extended = true;
    piston.version++;
    return true;
  }

  /** Retracts a piston; a sticky piston pulls the block in front of its head. Returns whether it moved. */
  private retract(piston: Cell): boolean {
    if (piston.cls !== "piston" || !piston.extended) return false;
    const facing = str(piston.states.facing) as Face;
    const p = piston.pos;
    const headPos = stepPos(p, facing);
    const headKey = posKey(headPos);
    if (this.cells.get(headKey)?.cls === "head") this.cells.delete(headKey);
    piston.extended = false;
    piston.version++;
    if (piston.params.sticky !== true) return true;
    const farKey = posKey(stepPos(p, facing, 2));
    const far = this.cells.get(farKey);
    if (!far || this.immovable(far) || this.breaksWhenPushed(far) || !this.checkModelled(far, farKey))
      return true;
    if (this.cells.has(headKey)) return true;
    this.cells.delete(farKey);
    far.pos = headPos;
    this.cells.set(headKey, far);
    return true;
  }

  /** Removes components that lost their support (a piston moved it away). */
  private dropUnsupported(): void {
    for (const [key, c] of [...this.cells]) {
      if (registryEntry(c.type)?.needsSupport && !isSupported(this.at, c.pos, c, this.mechanics.id)) {
        this.cells.delete(key);
      }
    }
  }

  // ---- Inputs and outputs -------------------------------------------------------------------------------------

  /**
   * Drives an input at `pos`: a held source (lever, plate) takes `value`; a pulse source (button) is pressed by a
   * value of 1 for its pulse length (`sim.params.pulseTicks`, redstone ticks, by material).
   */
  setInput(pos: Pos, value: number): void {
    const c = this.cells.get(posKey(pos));
    if (!c || c.cls !== "source") return;
    c.version++;
    if (c.params.input === "hold") c.states.on = value === 1;
    if (c.params.input === "pulse" && value === 1) {
      const ticks = c.params.pulseTicks as Record<string, number> | undefined;
      c.states.pressed = true;
      c.timer = this.tick + 2 * (ticks?.[str(c.states.material)] ?? 10);
    }
    this.refresh();
  }

  /**
   * Reads an output at `pos`: 0 or 1 for binary consumers (lamps, doors, trapdoors, note blocks) and pistons, the
   * level (0 to 15) for dust and comparators.
   */
  readOutput(pos: Pos): number {
    const c = this.cells.get(posKey(pos));
    if (!c) return 0;
    if (c.cls === "piston") return c.extended ? 1 : 0;
    if (c.params.output === "level") return c.level;
    if (c.cls === "consumer" && c.params.output === "binary") {
      return c.outState ? (c.states[c.outState] === true ? 1 : 0) : c.level;
    }
    return 0;
  }

  /** Every block with its simulated states, for the viewer's power view. Piston heads are left out. */
  snapshot(): SimSnapshot {
    const blocks = new Map<string, Block>();
    for (const [key, c] of this.cells) {
      if (c.cls === "head") continue;
      const states: Record<string, StateValue> = { ...c.states };
      if (c.cls === "dust") states.power = c.level;
      if (c.cls === "comparator") states.powered = c.level > 0;
      if (c.cls === "piston") states.extended = c.extended;
      blocks.set(key, { type: c.type, states });
    }
    return { tick: this.tick, blocks };
  }

  /** Power of the block at `pos` as the inspector shows it: dust level, or a conducting block's power. */
  powerAt(pos: Pos): number {
    const c = this.cells.get(posKey(pos));
    if (!c) return 0;
    if (c.cls === "dust" || c.cls === "comparator") return c.level;
    if (conducts(c, this.mechanics.id)) return this.blockPower(pos);
    return this.sourceLevel(c) || this.emitted(c);
  }

  /** The model this run started from. */
  get design(): Model {
    return this.model;
  }
}
