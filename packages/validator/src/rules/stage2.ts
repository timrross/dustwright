import { diag, holdsOnFace, keyPos, posKey, registryEntry } from "@dustwright/core";
import type { Diagnostic, Model, Pos, Rule } from "@dustwright/core";
import {
  ALL,
  attachedFace,
  blockAt,
  conducts,
  dustNetworkIndex,
  dustNetworks,
  dustNeighbours,
  dustPointsInto,
  dustReachesConsumer,
  faceKind,
  feedsDust,
  HORIZONTAL,
  isSource,
  OPPOSITE,
  outputFace,
  step,
  stronglyPowered,
} from "./power.js";

const fmt = (p: Pos) => `[${p.join(",")}]`;

/** E006: a component lacks the block it needs for support (faces measured in game). */
export const E006: Rule = {
  code: "E006",
  stage: 2,
  severity: "error",
  editions: ["bedrock"],
  run(model, ctx) {
    const out: Diagnostic[] = [];
    for (const [key, b] of model.blocks) {
      const rule = registryEntry(b.type)?.needsSupport;
      const dir = attachedFace(b);
      if (!rule || !dir) continue;
      const pos = keyPos(key);
      const at = step(pos, dir);
      const support = blockAt(model, at);
      // A lever attaches to any block that stands by itself; the game would not place one on a component in the
      // measurement, so a component (dust, a torch, a repeater...) does not count.
      const anyBlock = "byState" in rule && rule.anyBlock === true;
      const kind = faceKind(dir);
      const ok = anyBlock
        ? support !== undefined && !registryEntry(support.type)?.needsSupport
        : support !== undefined && holdsOnFace(support, kind, ctx.edition);
      if (ok) continue;
      const where = dir === "down" ? "below it" : dir === "up" ? "above it" : `to its ${dir}`;
      out.push(
        diag("E006", `${b.type} at ${fmt(pos)} needs a supporting block ${where}, at ${fmt(at)}`, {
          pos,
          related: [at],
          hint: support
            ? `${support.type} cannot hold it on that face; use a full block such as stone, or change the ${"byState" in rule ? rule.byState : "position"}.`
            : at[1] < 0
              ? `There is no layer below it: add one (layers[0] is the bottom) with a solid block at the same x and z${"byState" in rule ? `, or change ${rule.byState}` : ""}.`
              : `Place a solid block at ${fmt(at)}${"byState" in rule ? ` or change ${rule.byState}` : ""}.`,
        }),
      );
    }
    return out;
  },
};

/** W101: a dust run longer than 15 from its nearest source with no repeater (the far end gets no power). */
export const W101: Rule = {
  code: "W101",
  stage: 2,
  severity: "warning",
  editions: ["bedrock"],
  run(model) {
    const out: Diagnostic[] = [];
    for (const net of dustNetworks(model)) {
      const fed = net.filter((p) => feedsDust(model, p));
      if (fed.length === 0) continue;
      const dist = new Map<string, number>(fed.map((p) => [posKey(p), 0]));
      const queue = [...fed];
      for (let i = 0; i < queue.length; i++) {
        const p = queue[i] as Pos;
        const d = dist.get(posKey(p)) as number;
        for (const q of dustNeighbours(model, p)) {
          if (!dist.has(posKey(q))) {
            dist.set(posKey(q), d + 1);
            queue.push(q);
          }
        }
      }
      const dead = net
        .filter((p) => (dist.get(posKey(p)) ?? 0) >= 15)
        .sort((a, b) => (dist.get(posKey(a)) ?? 0) - (dist.get(posKey(b)) ?? 0));
      const first = dead[0];
      if (!first) continue;
      out.push(
        diag(
          "W101",
          `Dust at ${fmt(first)} is ${dist.get(posKey(first))} blocks from its nearest source, so it gets no power`,
          {
            pos: first,
            hint: "Signal strength drops by one per dust and runs out after 15; insert a repeater before the 15th dust.",
          },
        ),
      );
    }
    return out;
  },
};

/**
 * W102: a repeater or comparator outputs into air or a block that takes no signal. Another diode takes it at its
 * back (input) or its sides (a comparator's subtract input, a repeater's lock), but not at its front.
 */
export const W102: Rule = {
  code: "W102",
  stage: 2,
  severity: "warning",
  editions: ["bedrock"],
  run(model) {
    const out: Diagnostic[] = [];
    for (const [key, b] of model.blocks) {
      if (b.type !== "repeater" && b.type !== "comparator") continue;
      const face = outputFace(b);
      if (!face) continue;
      const pos = keyPos(key);
      const target = step(pos, face);
      const t = blockAt(model, target);
      const category = t ? registryEntry(t.type)?.category : undefined;
      const takes =
        t !== undefined &&
        (t.type === "dust" ||
          conducts(t) ||
          category === "consumer" ||
          ((t.type === "repeater" || t.type === "comparator") && outputFace(t) !== OPPOSITE[face]));
      if (takes) continue;
      out.push(
        diag(
          "W102",
          `${b.type} at ${fmt(pos)} outputs into ${t ? t.type : "air"} at ${fmt(target)}, which takes no signal`,
          {
            pos,
            related: [target],
            hint: "Point it at dust, a consumer, another diode's input, or a conducting block (stone, wool...).",
          },
        ),
      );
    }
    return out;
  },
};

/** W103: isolated dust: a dust network with no source and no consumer in reach. */
export const W103: Rule = {
  code: "W103",
  stage: 2,
  severity: "warning",
  editions: ["bedrock"],
  run(model) {
    const out: Diagnostic[] = [];
    for (const net of dustNetworks(model)) {
      if (net.some((p) => feedsDust(model, p)) || net.some((p) => dustReachesConsumer(model, p))) continue;
      const first = [...net].sort((a, b) => a[1] - b[1] || a[2] - b[2] || a[0] - b[0])[0] as Pos;
      out.push(
        diag(
          "W103",
          `Dust at ${fmt(first)}${net.length > 1 ? ` (and ${net.length - 1} connected)` : ""} has no source and no consumer in reach`,
          {
            pos: first,
            hint: "Connect the dust to a source and to something it powers, or remove it.",
          },
        ),
      );
    }
    return out;
  },
};

/**
 * W104: a torch whose own output powers the block it hangs on (a loop that burns the torch out): the dust it feeds
 * reaches dust lying on that block, or dust pointing into it from the side.
 */
export const W104: Rule = {
  code: "W104",
  stage: 2,
  severity: "warning",
  editions: ["bedrock"],
  run(model) {
    const out: Diagnostic[] = [];
    const { of } = dustNetworkIndex(model);
    const net = (p: Pos) => (blockAt(model, p)?.type === "dust" ? of.get(posKey(p)) : undefined);
    for (const [key, b] of model.blocks) {
      if (b.type !== "torch") continue;
      const pos = keyPos(key);
      const dir = attachedFace(b);
      if (!dir) continue;
      const support = step(pos, dir);
      // Networks of the dust the torch feeds: beside it, or on the block above it.
      const fed = new Set<number>();
      for (const f of ALL) {
        if (f === dir) continue;
        const id = net(step(pos, f));
        if (id !== undefined) fed.add(id);
      }
      const above = step(pos, "up");
      if (conducts(blockAt(model, above))) {
        const id = net(step(above, "up"));
        if (id !== undefined) fed.add(id);
      }
      if (fed.size === 0) continue;
      // Dust lying on the support, or beside it and pointing into it, powers it.
      const onTop = net(step(support, "up"));
      const loops =
        (onTop !== undefined && fed.has(onTop)) ||
        HORIZONTAL.some((f) => {
          const p = step(support, f);
          const id = net(p);
          return id !== undefined && fed.has(id) && dustPointsInto(model, p, OPPOSITE[f]);
        });
      if (loops) {
        out.push(
          diag(
            "W104",
            `Torch at ${fmt(pos)} powers dust that leads back into the block it hangs on, at ${fmt(support)}`,
            {
              pos,
              related: [support],
              hint: "A torch powered by its own output flickers and burns out; break the loop or add delay with repeaters.",
            },
          ),
        );
      }
    }
    return out;
  },
};

/** Whether something next to `p` powers a piston at `p` directly (Bedrock: power at the piston itself). */
function powersAt(model: Model, p: Pos, exclude?: string): boolean {
  for (const f of ALL) {
    const q = step(p, f);
    if (posKey(q) === exclude) continue;
    const n = blockAt(model, q);
    if (!n) continue;
    if (isSource(n) || n.type === "dust") return true;
    const o = outputFace(n);
    if (o && o === OPPOSITE[f]) return true;
    if (
      conducts(n) &&
      (stronglyPowered(model, q) ||
        ALL.some((g) => isSource(blockAt(model, step(q, g))) || blockAt(model, step(q, g))?.type === "dust"))
    )
      return true;
  }
  return false;
}

/** W105: a piston that only Java's quasi-connectivity would fire (no power at the piston, power above it). */
export const W105: Rule = {
  code: "W105",
  stage: 2,
  severity: "warning",
  editions: ["bedrock"],
  run(model) {
    const out: Diagnostic[] = [];
    for (const [key, b] of model.blocks) {
      if (b.type !== "piston" && b.type !== "sticky_piston") continue;
      const pos = keyPos(key);
      const front = posKey(
        step(pos, (typeof b.states.facing === "string" ? b.states.facing : "up") as never),
      );
      if (powersAt(model, pos, front)) continue;
      const above = step(pos, "up");
      if (blockAt(model, above) && !conducts(blockAt(model, above))) continue;
      if (!powersAt(model, above, posKey(pos))) continue;
      out.push(
        diag(
          "W105",
          `${b.type} at ${fmt(pos)} has no power next to it, only above it: it would fire only by Java's quasi-connectivity`,
          {
            pos,
            hint: "Bedrock has no quasi-connectivity: power the piston directly (a powered block, dust or a torch beside it).",
          },
        ),
      );
    }
    return out;
  },
};
