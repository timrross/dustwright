import { defineRedstoneViewer } from "@dustwright/viewer/browser";
import { validateText } from "@dustwright/validator";
import type { Diagnostic } from "@dustwright/core";
import { sitePath } from "./base.js";
import { download } from "./download.js";
import { DESIGNS as EXAMPLES } from "./examples.js";
import { decodeFragment, shareFragment } from "./fragment.js";
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
  // Downloads follow the design's edition: Bedrock packs and structures, or Java schematics.
  const java = result.model?.meta.edition === "java";
  for (const id of ["download-mcfunction", "download-mcstructure", "download-mcpack"])
    document.querySelector<HTMLButtonElement>(`#${id}`)!.hidden = java;
  for (const id of ["download-schem", "download-litematic"])
    document.querySelector<HTMLButtonElement>(`#${id}`)!.hidden = !java;
  document.body.dataset.validated = String(Date.now());
}

// The draft is kept in this browser only, as a convenience: storage can be missing or full, so every access is
// guarded, and the downloaded file is the durable copy.
const DRAFT_KEY = "dustwright:draft";
function saveDraft(): void {
  try {
    localStorage.setItem(DRAFT_KEY, editor.value);
  } catch {
    // No storage: the draft lives only in the page.
  }
}
function loadDraft(): string | null {
  try {
    return localStorage.getItem(DRAFT_KEY);
  } catch {
    return null;
  }
}

let timer = 0;
editor.addEventListener("input", () => {
  clearTimeout(timer);
  timer = window.setTimeout(() => {
    update();
    saveDraft();
  }, 150);
});
picker.addEventListener("change", () => {
  editor.value = EXAMPLES.get(picker.value) ?? "";
  update();
  saveDraft();
});

const notice = document.querySelector<HTMLSpanElement>("#notice")!;
const shareLink = document.querySelector<HTMLInputElement>("#share-link")!;

/** The current design when it has no errors, else null with a notice saying why. */
function validModel() {
  const result = validateText(editor.value);
  if (!result.model || result.diagnostics.some((d) => d.severity === "error")) {
    notice.textContent = "Fix the errors first: exports need a design without errors.";
    return null;
  }
  return result.model;
}

const button = (id: string, run: () => Promise<void> | void) =>
  document.querySelector<HTMLButtonElement>(`#${id}`)!.addEventListener("click", () => {
    notice.textContent = "";
    shareLink.hidden = true;
    void Promise.resolve(run()).catch((err: unknown) => {
      notice.textContent = `Something went wrong: ${(err as Error).message}`;
    });
  });

button("share", async () => {
  const link = await shareFragment(editor.value);
  if ("error" in link) {
    notice.textContent = `${link.error.code}: ${link.error.message}`;
    return;
  }
  shareLink.value = `${location.origin}${sitePath("/view/")}#${link.fragment}`;
  shareLink.hidden = false;
  shareLink.select();
  try {
    await navigator.clipboard.writeText(shareLink.value);
    notice.textContent = "Link copied. The design travels in the link itself; no server sees it.";
  } catch {
    notice.textContent = "Copy the link below. The design travels in the link itself; no server sees it.";
  }
});

const slugOf = () => validateText(editor.value).model?.meta.slug ?? "design";
button("download-design", () => download(`${slugOf()}.rsd.json`, editor.value, "application/json"));
button("download-mcfunction", async () => {
  const model = validModel();
  if (!model) return;
  const { mcfunctionExporter } = await import("@dustwright/export");
  const out = await mcfunctionExporter.export(model, {});
  const file = out.files[0];
  if (!file) {
    notice.textContent = out.diagnostics.map((d) => `${d.code}: ${d.message}`).join(" ");
    return;
  }
  download(`${model.meta.slug}.mcfunction`, file.bytes, "text/plain");
});
button("download-mcstructure", async () => {
  const model = validModel();
  if (!model) return;
  const { mcstructureExporter } = await import("@dustwright/export");
  const out = await mcstructureExporter.export(model, {});
  const file = out.files[0];
  if (!file) {
    notice.textContent = out.diagnostics.map((d) => `${d.code}: ${d.message}`).join(" ");
    return;
  }
  download(`${model.meta.slug}.mcstructure`, file.bytes);
});
button("download-mcpack", async () => {
  const model = validModel();
  if (!model) return;
  const { buildMcpack } = await import("@dustwright/export");
  const pack = await buildMcpack(model);
  if (!pack.bytes) {
    notice.textContent = pack.diagnostics.map((d) => `${d.code}: ${d.message}`).join(" ");
    return;
  }
  download(pack.fileName, pack.bytes);
  notice.textContent =
    "Import the .mcpack by opening it, enable it on a world with cheats on, then run /function rsd/" +
    model.meta.slug +
    ".";
});
for (const [id, ext] of [
  ["download-schem", "schem"],
  ["download-litematic", "litematic"],
] as const) {
  button(id, async () => {
    const model = validModel();
    if (!model) return;
    const { litematicExporter, schemExporter } = await import("@dustwright/export");
    const out = await (ext === "schem" ? schemExporter : litematicExporter).export(model, {});
    const file = out.files[0];
    if (!file) {
      notice.textContent = out.diagnostics.map((d) => `${d.code}: ${d.message}`).join(" ");
      return;
    }
    download(`${model.meta.slug}.${ext}`, file.bytes);
    notice.textContent =
      ext === "schem"
        ? "Load it with WorldEdit: put it in the schematics folder, then //schem load and //paste."
        : "Open it with the Litematica client mod: put it in the schematics folder and load it there.";
  });
}
button("download-sheets", async () => {
  const result = validateText(editor.value);
  if (!result.model) {
    notice.textContent = "Fix the errors first: the design does not parse.";
    return;
  }
  const { renderLayerSheets, zipDeterministic } = await import("@dustwright/export");
  const sheets = renderLayerSheets(result.model);
  const zip = zipDeterministic(
    Object.fromEntries(sheets.map((s) => [s.path, new TextEncoder().encode(s.svg)])),
  );
  download(`${result.model.meta.slug}-sheets.zip`, zip, "application/zip");
});

async function start(): Promise<void> {
  // A share link (#d= or #json=) opens its design; otherwise ?example=, the last draft, or the NOT gate.
  const fragment = await decodeFragment(location.hash);
  if (fragment && "text" in fragment) {
    editor.value = fragment.text;
    picker.value = "";
  } else {
    if (fragment && "error" in fragment)
      notice.textContent = `${fragment.error.code}: ${fragment.error.message}`;
    // ?example= opens that example; otherwise the last draft in this browser, else the NOT gate.
    const requested = new URLSearchParams(location.search).get("example");
    const draft = requested ? null : loadDraft();
    if (draft) {
      editor.value = draft;
      picker.value = "";
      notice.textContent = "Your last draft in this browser. Pick an example to start again.";
    } else {
      const first = requested && EXAMPLES.has(requested) ? requested : "not-gate";
      picker.value = first;
      editor.value = EXAMPLES.get(first) ?? "";
    }
  }
  update();
}
void start();
