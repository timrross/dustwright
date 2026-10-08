import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Packages depend inward only: everything may depend on core; nothing depends on viewer, cli or site.
const root = fileURLToPath(new URL("..", import.meta.url));
const manifests = ["packages", "apps"].flatMap((dir) =>
  readdirSync(`${root}/${dir}`).map((name) => {
    const pkg = JSON.parse(readFileSync(`${root}/${dir}/${name}/package.json`, "utf8")) as {
      name: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return { name: pkg.name, deps: Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }) };
  }),
);
const internal = new Set(manifests.map((m) => m.name));
const forbiddenTargets = ["@dustwright/viewer", "dustwright", "@dustwright/site"];

describe("package dependency graph", () => {
  it.each(manifests.map((m) => [m.name, m] as const))("%s has only allowed internal edges", (_n, m) => {
    for (const dep of m.deps.filter((d) => internal.has(d))) {
      if (forbiddenTargets.includes(dep)) {
        // The site is the one consumer allowed to use the viewer.
        expect(m.name === "@dustwright/site" && dep === "@dustwright/viewer", `${m.name} -> ${dep}`).toBe(
          true,
        );
      }
    }
  });

  it("core depends on no other internal package", () => {
    const core = manifests.find((m) => m.name === "@dustwright/core");
    expect(core?.deps.filter((d) => internal.has(d))).toEqual([]);
  });

  it("has no cycles", () => {
    const edges = new Map(manifests.map((m) => [m.name, m.deps.filter((d) => internal.has(d))]));
    const state = new Map<string, "visiting" | "done">();
    const visit = (n: string, path: string[]) => {
      if (state.get(n) === "done") return;
      expect(state.get(n), `cycle: ${[...path, n].join(" -> ")}`).not.toBe("visiting");
      state.set(n, "visiting");
      for (const d of edges.get(n) ?? []) visit(d, [...path, n]);
      state.set(n, "done");
    };
    for (const n of edges.keys()) visit(n, []);
  });
});
