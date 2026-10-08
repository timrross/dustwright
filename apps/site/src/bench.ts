import { defineRedstoneViewer } from "@dustwright/viewer/browser";
import "./site.css";

defineRedstoneViewer();

/** A deterministic design with `n` blocks: stone floors with dust, repeaters, torches and lamps mixed in. */
function generate(n: number): unknown {
  const side = 50;
  const perLayer = side * side;
  const layersNeeded = Math.ceil(n / perLayer);
  const legend = {
    "#": "stone",
    "-": "dust",
    ">": "repeater facing=east",
    t: "torch",
    "*": "lamp",
    o: "observer facing=north",
  };
  const keys = ["#", "#", "#", "-", ">", "t", "*", "o"];
  let placed = 0;
  const layers: string[][] = [];
  for (let y = 0; y < layersNeeded * 2; y++) {
    const rows: string[] = [];
    for (let z = 0; z < side; z++) {
      let row = "";
      for (let x = 0; x < side; x++) {
        if (y % 2 === 1 || placed >= n) row += ".";
        else {
          row += keys[(x * 7 + z * 13 + y) % keys.length];
          placed++;
        }
      }
      rows.push(row);
    }
    layers.push(rows);
  }
  return { format: "rsd/1", meta: { name: `Benchmark ${n}` }, legend, layers };
}

const n = Math.min(50_000, Math.max(1, Number(new URLSearchParams(location.search).get("blocks") ?? 10_000)));
document.querySelector("#count")!.textContent = n.toLocaleString();
const viewer = document.querySelector("redstone-viewer")!;
viewer.load(generate(n));

const fps = document.querySelector("#fps")!;
let frames = 0;
let since = performance.now();
function tick(): void {
  viewer.orbitBy(0.01, 0);
  frames++;
  const now = performance.now();
  if (now - since >= 1000) {
    fps.textContent = `${Math.round((frames * 1000) / (now - since))} fps`;
    frames = 0;
    since = now;
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
