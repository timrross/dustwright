// viewer.html: the viewer alone, filling the page, for iframes (the MediaWiki embed path). Query parameters map to
// the element's attributes: src, mode, layer, step, theme and allowed-origins. The element itself enforces the
// rules: src must be same-origin or https: and at most 2 MB, and commands come only from allowed origins.
import { defineRedstoneViewer } from "@dustwright/viewer/browser";
import "./site.css";

defineRedstoneViewer();
const viewer = document.querySelector("redstone-viewer")!;
const params = new URLSearchParams(location.search);
for (const name of ["mode", "layer", "step", "theme", "allowed-origins"]) {
  const value = params.get(name);
  if (value !== null) viewer.setAttribute(name, value);
}
const src = params.get("src");
if (src) viewer.setAttribute("src", src);
else document.querySelector<HTMLElement>("#missing")!.hidden = false;
