import { defineRedstoneViewer } from "@dustwright/viewer/browser";
import { validateText } from "@dustwright/validator";
import type { Diagnostic } from "@dustwright/core";
import { EXAMPLES } from "./examples.js";
import "./site.css";

defineRedstoneViewer();

const editor = document.querySelector<HTMLTextAreaElement>("#editor")!;
const viewer = document.querySelector("redstone-viewer")!;
const list = document.querySelector<HTMLUListElement>("#diagnostics")!;
const status = document.querySelector<HTMLSpanElement>("#status")!;
const picker = document.querySelector<HTMLSelectElement>("#example")!;

for (const name of EXAMPLES.keys()) {
  const option = document.createElement("option");
  option.value = name;
  option.textContent = name;
  picker.appendChild(option);
}

function renderDiagnostics(diagnostics: readonly Diagnostic[]): void {
  list.replaceChildren();
  for (const d of diagnostics) {
    const item = document.createElement("li");
    const where = d.pos ? `[${d.pos.join(",")}]` : d.path || "";
    const head = document.createElement(d.pos ? "button" : "span");
    head.className = d.severity;
    head.textContent = `${d.code} ${d.severity}${where ? ` ${where}` : ""}: ${d.message}`;
    if (d.pos && head instanceof HTMLButtonElement) {
      const pos = d.pos;
      head.type = "button";
      head.addEventListener("click", () => viewer.select(pos));
    }
    item.appendChild(head);
    if (d.hint) {
      const hint = document.createElement("div");
      hint.className = "hint";
      hint.textContent = d.hint;
      item.appendChild(hint);
    }
    list.appendChild(item);
  }
}

/** Re-validates and re-renders the editor's text. */
function update(): void {
  const text = editor.value;
  const result = validateText(text);
  renderDiagnostics(result.diagnostics);
  const errors = result.diagnostics.filter((d) => d.severity === "error").length;
  const warnings = result.diagnostics.length - errors;
  status.textContent =
    errors > 0 ? `${errors} error(s), ${warnings} other` : `No errors (${warnings} warnings or notes)`;
  // The viewer renders whatever stage 1 accepts; a design with parse errors shows its diagnostics instead.
  // The markers on the blocks show the same findings as the list (the full validator, not only the static rules).
  if (viewer.load(text)) viewer.setDiagnostics(result.diagnostics);
  document.body.dataset.validated = String(Date.now());
}

let timer = 0;
editor.addEventListener("input", () => {
  clearTimeout(timer);
  timer = window.setTimeout(update, 150);
});
picker.addEventListener("change", () => {
  editor.value = EXAMPLES.get(picker.value) ?? "";
  update();
});

const requested = new URLSearchParams(location.search).get("example");
const first = requested && EXAMPLES.has(requested) ? requested : "not-gate";
picker.value = first;
editor.value = EXAMPLES.get(first) ?? "";
update();
