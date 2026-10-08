import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MinecraftBlockTypes } from "@minecraft/vanilla-data";
import { describe, expect, it } from "vitest";
import { PINS, REGISTRY, toEditionBlocks } from "@dustwright/core";
import type { Block, RegistryEntry, StateValue } from "@dustwright/core";
import { SIM_CLASSES } from "@dustwright/sim";
import { GEOMETRY_BUILDERS } from "@dustwright/viewer";
// @ts-expect-error: plain ESM script without type declarations
import { generate, loadRegistry } from "../scripts/gen-core.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

/** Every combination of an entry's abstract states (the v1 set is small enough to enumerate). */
function allBlocks(entry: RegistryEntry): Block[] {
  let combos: Record<string, StateValue>[] = [{}];
  for (const [key, def] of Object.entries(entry.states)) {
    combos = combos.flatMap((c) => def.values.map((v) => ({ ...c, [key]: v })));
  }
  return combos.map((states) => ({ type: entry.type, states }));
}

const V1_TYPES = [
  "stone",
  "glass",
  "slab",
  "stairs",
  "wool",
  "concrete",
  "target",
  "dust",
  "repeater",
  "comparator",
  "torch",
  "lever",
  "button",
  "pressure_plate",
  "daylight_sensor",
  "lamp",
  "piston",
  "sticky_piston",
  "note_block",
  "door",
  "trapdoor",
  "observer",
  "hopper",
  "dropper",
  "dispenser",
  "slime",
  "honey_block",
  "redstone_block",
];

describe("registry", () => {
  it("every file validates against packages/core/schema/registry.json and passes the cross-checks", () => {
    expect(() => loadRegistry()).not.toThrow();
  });

  it("holds exactly the v1 block set", () => {
    expect(REGISTRY.map((e) => e.type).sort()).toEqual([...V1_TYPES].sort());
  });

  it("generated modules are up to date with the registry and the schema", async () => {
    const files = (await generate()) as Record<string, string>;
    for (const [name, content] of Object.entries(files)) {
      expect(readFileSync(`${root}/packages/core/src/generated/${name}`, "utf8"), name).toBe(content);
    }
  });

  it.each(REGISTRY.map((e) => [e.type, e] as const))(
    "%s has all three parts: a geometry builder, a sim class and a Bedrock mapping",
    (_t, entry) => {
      expect(GEOMETRY_BUILDERS).toContain(entry.geometry.builder);
      expect(SIM_CLASSES).toContain(entry.sim.class);
      for (const block of allBlocks(entry)) {
        const out = toEditionBlocks(block, "bedrock");
        expect(out.length).toBeGreaterThan(0);
      }
    },
  );

  it("every mapping records the pinned data versions", () => {
    for (const e of REGISTRY) {
      expect(e.bedrock.checkedAgainst).toEqual({
        vanillaData: PINS.vanillaData,
        bedrockSamples: PINS.bedrockSamples,
      });
    }
  });

  it("the installed @minecraft/vanilla-data is the pinned version", () => {
    const pkg = JSON.parse(
      readFileSync(`${root}/node_modules/@minecraft/vanilla-data/package.json`, "utf8"),
    ) as { version: string };
    expect(pkg.version).toBe(PINS.vanillaData);
  });

  it("every Bedrock ID exists in the pinned @minecraft/vanilla-data", () => {
    const ids = new Set<string>(Object.values(MinecraftBlockTypes));
    for (const e of REGISTRY) {
      for (const block of allBlocks(e))
        for (const b of toEditionBlocks(block, "bedrock")) expect(ids, `${e.type}: ${b.id}`).toContain(b.id);
    }
  });
});

// Mojang's block metadata is not committed (its licence is not MIT); `pnpm fetch:bedrock-data` caches the pinned
// copy. CI fetches it and sets RSD_REQUIRE_BEDROCK_DATA so this suite can never silently skip there.
const metadataPath = `${root}/.cache/bedrock-samples/${PINS.bedrockSamples}/mojang-blocks.json`;
const haveMetadata = existsSync(metadataPath);
if (!haveMetadata && process.env.RSD_REQUIRE_BEDROCK_DATA) {
  throw new Error(`${metadataPath} is missing; run pnpm fetch:bedrock-data`);
}

describe.skipIf(!haveMetadata)("Bedrock states against the pinned mojang-blocks.json", () => {
  interface Meta {
    block_properties: { name: string; type: string; values: { value: StateValue }[] }[];
    data_items: { name: string; properties: { name: string }[] }[];
  }
  const meta = haveMetadata ? (JSON.parse(readFileSync(metadataPath, "utf8")) as Meta) : undefined;
  const props = new Map(meta?.block_properties.map((p) => [p.name, p]));
  const blocks = new Map(meta?.data_items.map((b) => [b.name, new Set(b.properties.map((p) => p.name))]));

  it.each(REGISTRY.map((e) => [e.type, e] as const))(
    "%s: every state name belongs to the block and every value is in its domain",
    (_t, e) => {
      for (const block of allBlocks(e)) {
        for (const b of toEditionBlocks(block, "bedrock")) {
          const allowed = blocks.get(b.id);
          expect(allowed, b.id).toBeDefined();
          // Every state the game defines for the block is set, and nothing else.
          expect(Object.keys(b.states).sort(), b.id).toEqual([...(allowed ?? [])].sort());
          for (const [name, value] of Object.entries(b.states)) {
            const domain = props.get(name)?.values.map((v) => v.value) ?? [];
            expect(domain, `${b.id} ${name}=${String(value)}`).toContain(value);
          }
        }
      }
    },
  );
});
