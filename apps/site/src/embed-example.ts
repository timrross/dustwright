// The embedding example: a host page that frames viewer.html and drives it with postMessage. Query parameters, for
// trying it against a local build: `viewer` (the viewer.html URL, this site's or a loopback one), `design` (the design URL, resolved against the
// viewer) and `allow` (the allowed-origins value; this page's origin by default).
import "./site.css";

const params = new URLSearchParams(location.search);
const frame = document.querySelector<HTMLIFrameElement>("#frame")!;
const log = document.querySelector<HTMLOListElement>("#log")!;
const current = document.querySelector<HTMLSpanElement>("#current")!;

// The viewer may come from this site, or from a local build (another port is another origin; the e2e tests use
// that). Anything else falls back to this site's viewer, so the page can never frame a foreign site.
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);
function viewerFrom(param: string | null): URL {
  const fallback = new URL("/viewer.html", location.href);
  if (param === null) return fallback;
  try {
    const url = new URL(param, location.href);
    const local = url.protocol === "http:" && LOOPBACK.has(url.hostname);
    return url.origin === location.origin || local ? url : fallback;
  } catch {
    return fallback;
  }
}
const viewerUrl = viewerFrom(params.get("viewer"));
viewerUrl.searchParams.set("src", params.get("design") ?? "/examples/t-flip-flop.rsd.json");
viewerUrl.searchParams.set("mode", "instructions");
viewerUrl.searchParams.set("allowed-origins", params.get("allow") ?? location.origin);
const viewerOrigin = viewerUrl.origin;
frame.src = viewerUrl.href;

let step = 0;
let count = 0;

// Events from the viewer: only from our iframe, its origin, and the viewer's message shape.
window.addEventListener("message", (ev: MessageEvent) => {
  if (ev.source !== frame.contentWindow || ev.origin !== viewerOrigin) return;
  const data = ev.data as { source?: unknown; type?: unknown; detail?: unknown } | null;
  if (!data || data.source !== "dustwright-viewer" || typeof data.type !== "string") return;
  const item = document.createElement("li");
  item.textContent = `${data.type}: ${JSON.stringify(data.detail)}`;
  log.prepend(item);
  if (data.type === "step") {
    const d = data.detail as { index: number; count: number; title: string };
    step = d.index;
    count = d.count;
    current.textContent = `Step ${d.index + 1} of ${d.count}: ${d.title}`;
  }
});

const send = (message: unknown) => frame.contentWindow?.postMessage(message, viewerOrigin);
document
  .querySelector("#next")!
  .addEventListener("click", () =>
    send({ type: "setStep", step: Math.min(step + 1, Math.max(0, count - 1)) }),
  );
document
  .querySelector("#back")!
  .addEventListener("click", () => send({ type: "setStep", step: Math.max(0, step - 1) }));
