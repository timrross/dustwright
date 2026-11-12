// /view: opens a design from the URL fragment (#d= or #json=), from ?src= (same origin or https:, through the
// viewer's own checks), or from a file the visitor chooses or drops. The fragment never reaches a server.
import { diag, LIMITS } from "@dustwright/core";
import { defineRedstoneViewer } from "@dustwright/viewer/browser";
import { sitePath } from "./base.js";
import { decodeFragment, shareFragment } from "./fragment.js";
import { showProblems } from "./problems.js";
import "./site.css";

defineRedstoneViewer();
const viewer = document.querySelector("redstone-viewer")!;
const problems = document.querySelector<HTMLUListElement>("#problems")!;
const intro = document.querySelector<HTMLParagraphElement>("#intro")!;
const status = document.querySelector<HTMLSpanElement>("#status")!;
const edit = document.querySelector<HTMLAnchorElement>("#edit")!;
const file = document.querySelector<HTMLInputElement>("#file")!;

/** Shows a design's text in the viewer, and offers it to the playground. */
async function show(text: string, from: string): Promise<void> {
  showProblems(problems, []);
  intro.hidden = true;
  const ok = viewer.load(text);
  status.textContent = ok ? `Opened from ${from}.` : `The design from ${from} has errors.`;
  const link = await shareFragment(text);
  edit.hidden = !("fragment" in link);
  if ("fragment" in link) edit.href = sitePath(`/play/#${link.fragment}`);
  document.body.dataset.opened = String(Date.now());
}

function fail(message: Parameters<typeof showProblems>[1]): void {
  showProblems(problems, message);
  status.textContent = "Could not open the design.";
  document.body.dataset.opened = String(Date.now());
}

async function openFromUrl(): Promise<void> {
  const fragment = await decodeFragment(location.hash);
  if (fragment && "error" in fragment) return fail([fragment.error]);
  if (fragment) return show(fragment.text, "the link");
  const src = new URLSearchParams(location.search).get("src");
  if (src) {
    intro.hidden = true;
    viewer.addEventListener("ready", () => (document.body.dataset.opened = String(Date.now())), {
      once: true,
    });
    viewer.addEventListener("error", () => (document.body.dataset.opened = String(Date.now())), {
      once: true,
    });
    viewer.setAttribute("src", src);
    status.textContent = "Opened from its URL.";
  }
}

async function openFile(f: File): Promise<void> {
  if (f.size > LIMITS.fileBytes) {
    return fail([
      diag("E013", `${f.name} is larger than the file size limit of ${LIMITS.fileBytes} bytes (2 MB)`, {
        hint: "Split or simplify the design.",
      }),
    ]);
  }
  return show(await f.text(), "a file");
}

file.addEventListener("change", () => {
  const f = file.files?.[0];
  if (f) void openFile(f);
});
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => {
  e.preventDefault();
  const f = e.dataTransfer?.files[0];
  if (f) void openFile(f);
});
window.addEventListener("hashchange", () => void openFromUrl());
void openFromUrl();
