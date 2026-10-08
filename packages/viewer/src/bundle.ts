/**
 * Entry for the single-file bundle (`rsd bundle`) and the hosted `viewer.html`: registers `<redstone-viewer>` and
 * exposes `DustwrightViewer.mount(design)`, which loads an inlined design into the first viewer on the page.
 */
import { defineRedstoneViewer } from "./element.js";

defineRedstoneViewer();

/**
 * Loads a design into the first `<redstone-viewer>` on the page (or a new one in the body). The bundle passes the
 * design as JSON text, so it goes through the same size and depth guards as any file.
 */
export function mount(design: unknown): void {
  let viewer = document.querySelector("redstone-viewer");
  if (!viewer) {
    viewer = document.createElement("redstone-viewer");
    document.body.appendChild(viewer);
  }
  viewer.load(design);
}

export { defineRedstoneViewer };
