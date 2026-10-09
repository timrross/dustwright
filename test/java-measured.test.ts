import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { conducts, dustConnections, isSupported, parse, registryEntry, REGISTRY } from "@dustwright/core";
import type { Block, Model, Pos } from "@dustwright/core";
import { BEDROCK_MECHANICS, JAVA_MECHANICS, settle } from "@dustwright/sim";

// The Java registry data and mechanics must equal what was measured in the Java test world (docs/ingame/).
const root = fileURLToPath(new URL("..", import.meta.url));
const evidence = (name: string) =>
  JSON.parse(readFileSync(`${root}/docs/ingame/${name}`, "utf8")) as { table: Record<string, never> };

const withDefaults = (type: string, states: Record<string, unknown> = {}): Block => ({
  type,
  states: {
    ...Object.fromEntries(Object.entries(registryEntry(type)?.states ?? {}).map(([k, d]) => [k, d.default])),
    ...states,
  } as Block["states"],
});

describe("Java support faces equal the in-game measurement", () => {
  // The rows and components of deploy/test-world-java/measure-supports.mjs.
  const SUPPORTS: Record<string, [string, Record<string, unknown>]> = {
    "slab half=top": ["slab", { half: "top" }],
    "stairs half=top": ["stairs", { half: "top" }],
    "trapdoor half=top": ["trapdoor", { half: "top" }],
    "trapdoor open=true": ["trapdoor", { open: true }],
    "piston facing=north": ["piston", { facing: "north" }],
    "sticky_piston facing=north": ["sticky_piston", { facing: "north" }],
    "observer facing=up": ["observer", { facing: "up" }],
  };
  const COMPONENTS: Record<string, [string, Record<string, unknown>, [number, number, number]]> = {
    dust: ["dust", {}, [0, -1, 0]],
    repeater: ["repeater", { facing: "north" }, [0, -1, 0]],
    comparator: ["comparator", { facing: "north" }, [0, -1, 0]],
    "torch floor": ["torch", { mount: "floor" }, [0, -1, 0]],
    "lever floor": ["lever", { mount: "floor" }, [0, -1, 0]],
    "button floor": ["button", { mount: "floor" }, [0, -1, 0]],
    pressure_plate: ["pressure_plate", {}, [0, -1, 0]],
    door: ["door", { facing: "north" }, [0, -1, 0]],
    "torch wall": ["torch", { mount: "west" }, [-1, 0, 0]],
    "lever wall": ["lever", { mount: "west" }, [-1, 0, 0]],
    "button wall": ["button", { mount: "west" }, [-1, 0, 0]],
    "lever ceiling": ["lever", { mount: "ceiling" }, [0, 1, 0]],
    "button ceiling": ["button", { mount: "ceiling" }, [0, 1, 0]],
  };
  const table = evidence("2026-10-09-java-supports.json").table as Record<string, Record<string, string>>;

  it("every measured row agrees with isSupported for Java", () => {
    const wrong: string[] = [];
    let compared = 0;
    for (const [label, row] of Object.entries(table)) {
      const [type, states] = SUPPORTS[label] ?? [label, {}];
      // Blocks that need support themselves hold nothing in the registry: in a real build their faces are taken.
      if (registryEntry(type)?.needsSupport) continue;
      for (const [comp, result] of Object.entries(row)) {
        if (result === "support did not place") continue;
        const [ctype, cstates, off] = COMPONENTS[comp] as [string, Record<string, unknown>, Pos];
        const component = withDefaults(ctype, cstates);
        const support = withDefaults(type, states);
        const at = (p: Pos) => (p[0] === off[0] && p[1] === off[1] && p[2] === off[2] ? support : undefined);
        compared++;
        if (isSupported(at, [0, 0, 0], component, "java") !== (result === "holds"))
          wrong.push(`${label} / ${comp}: measured ${result}`);
      }
    }
    expect(wrong).toEqual([]);
    expect(compared).toBeGreaterThan(300);
  });
});

describe("Java conductivity equals the in-game measurement", () => {
  it("every measured block conducts on Java exactly when the game showed it", () => {
    const table = evidence("2026-10-09-java-conductivity.json").table as Record<
      string,
      { conducts: boolean | null }
    >;
    const rows = Object.entries(table).filter(([, v]) => v.conducts !== null);
    expect(rows.length).toBeGreaterThan(15);
    for (const [type, v] of rows) expect(conducts(withDefaults(type), "java"), type).toBe(v.conducts);
    // The one measured difference, and Bedrock keeps its own value.
    expect(conducts(withDefaults("slime"), "java")).toBe(true);
    expect(conducts(withDefaults("slime"), "bedrock")).toBe(false);
    expect(REGISTRY.filter((e) => e.java?.conductsPower !== undefined).map((e) => e.type)).toEqual(["slime"]);
  });
});

describe("Java dust under slime", () => {
  it("slime above a wire cuts its link to dust a step up on Java (it conducts there), not on Bedrock", () => {
    // Dust at [0,1,0] with slime above it; stone at [1,1,0] with dust on top, one step up and east.
    const blocks = new Map<string, Block>([
      ["0,1,0", withDefaults("dust")],
      ["0,2,0", withDefaults("slime")],
      ["1,1,0", withDefaults("stone")],
      ["1,2,0", withDefaults("dust")],
    ]);
    const at = (p: Pos) => blocks.get(p.join(","));
    expect([...dustConnections(at, [0, 1, 0], "java")]).toEqual([]);
    expect([...dustConnections(at, [0, 1, 0], "bedrock")]).toEqual(["east"]);
  });
});

describe("Java mechanics", () => {
  it("timings equal the frozen-tick measurement", () => {
    const t = evidence("2026-10-09-java-timing.json").table as Record<string, { gameTicks: number[] }>;
    const one = (k: string) => {
      const runs = t[k]?.gameTicks ?? [];
      expect(new Set(runs).size, k).toBe(1);
      return runs[0];
    };
    expect(JAVA_MECHANICS.timing).toEqual({
      torch: one("torch"),
      repeater: one("repeater1"),
      comparator: one("comparator"),
      observer: one("observer"),
      observerPulse: one("observerPulse"),
      piston: one("piston"),
      consumer: one("lampOn"),
      lampOff: one("lampOff"),
    });
    expect([one("repeater2"), one("repeater3"), one("repeater4")]).toEqual([4, 6, 8]);
    expect([one("doorOpen"), one("trapdoorOpen")]).toEqual([0, 0]);
  });

  const design = (layers: string[][], legend: Record<string, string>, edition: "bedrock" | "java") =>
    parse({ format: "rsd/1", meta: { name: "t", edition }, legend, layers }).model as Model;

  it("quasi-connectivity: power at the block above fires a piston on Java, not on Bedrock", () => {
    // A lever on the side of glass (which does not conduct) powers the air cell above the piston, nothing else.
    const layers = [
      ["###", "###"],
      ["P..", "..."],
      [".Lg", "..."],
    ];
    const legend = { "#": "stone", P: "piston facing=south", L: "lever mount=east on=true", g: "glass" };
    const extended = (edition: "bedrock" | "java") =>
      settle(
        design(layers, legend, edition),
        edition === "java" ? JAVA_MECHANICS : BEDROCK_MECHANICS,
      ).readOutput([0, 1, 0]);
    expect(extended("java")).toBe(1);
    expect(extended("bedrock")).toBe(0);
  });

  it("a Java lamp lights at once and goes dark 4 game ticks later; a piston's head stands after 3", () => {
    const m = design([["##"], ["L*"]], { "#": "stone", L: "lever mount=floor", "*": "lamp" }, "java");
    const ticksUntil = (sim: ReturnType<typeof settle>, want: number) => {
      for (let t = 1; t <= 20; t++) {
        sim.step();
        if (sim.readOutput([1, 1, 0]) === want) return t;
      }
      return -1;
    };
    const sim = settle(m, JAVA_MECHANICS);
    sim.setInput([0, 1, 0], 1);
    const on = ticksUntil(sim, 1);
    sim.setInput([0, 1, 0], 0);
    const off = ticksUntil(sim, 0);
    // The simulator steps one game tick at a time and applies a change at the end of a step, so a 0-tick delay shows
    // as 1 (noted in VERIFY); going dark takes the measured 4.
    expect([on, off]).toEqual([1, 4]);
    const p = design(
      [["##"], ["LP"]],
      { "#": "stone", L: "lever mount=floor", P: "piston facing=north" },
      "java",
    );
    const ps = settle(p, JAVA_MECHANICS);
    ps.setInput([0, 1, 0], 1);
    let t = 0;
    while (ps.readOutput([1, 1, 0]) === 0 && t < 20) {
      ps.step();
      t++;
    }
    expect(t).toBe(3);
  });
});
