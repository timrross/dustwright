import type { Diagnostic } from "@dustwright/core";

/** Shows diagnostics in a list, as text only: design text never becomes markup or a link. */
export function showProblems(list: HTMLUListElement, diagnostics: readonly Diagnostic[]): void {
  list.replaceChildren();
  for (const d of diagnostics) {
    const item = document.createElement("li");
    const head = document.createElement("span");
    head.className = d.severity;
    head.textContent = `${d.code} ${d.severity}: ${d.message}`;
    item.appendChild(head);
    if (d.hint) {
      const hint = document.createElement("div");
      hint.className = "hint";
      hint.textContent = d.hint;
      item.appendChild(hint);
    }
    list.appendChild(item);
  }
  list.hidden = diagnostics.length === 0;
}
