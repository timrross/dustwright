/** The component's stylesheet. Applied with adoptedStyleSheets, so it works under a CSP without inline styles. */
export const VIEWER_CSS = `
:host { display: block; position: relative; height: 480px; min-width: 0; font: 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--rv-text); }
* { box-sizing: border-box; }
.root { position: relative; height: 100%; display: grid; grid-template-rows: auto 1fr; grid-template-columns: 1fr auto; background: var(--rv-bg); border: 1px solid var(--rv-border); border-radius: 8px; overflow: hidden; }
.toolbar { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; padding: 6px 8px; background: var(--rv-panel); border-bottom: 1px solid var(--rv-border); }
.title { font-weight: 600; margin-right: auto; max-width: 40ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.group { display: inline-flex; gap: 4px; align-items: center; }
button, input, select { font: inherit; color: inherit; }
button { background: var(--rv-bg); border: 1px solid var(--rv-border); border-radius: 6px; padding: 2px 8px; min-height: 28px; min-width: 28px; cursor: pointer; }
button[aria-pressed="true"] { background: var(--rv-accent); color: var(--rv-panel); border-color: var(--rv-accent); }
button:focus-visible, input:focus-visible, .stage:focus-visible { outline: 2px solid var(--rv-accent); outline-offset: 2px; }
input[type="range"] { width: 90px; accent-color: var(--rv-accent); }
.stage { position: relative; min-height: 0; min-width: 0; overflow: hidden; outline: none; }
.labels { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.label { position: absolute; transform: translate(-50%, -100%); padding: 1px 6px; border-radius: 4px; background: var(--rv-panel); border: 1px solid var(--rv-border); font-size: 12px; white-space: nowrap; max-width: 24ch; overflow: hidden; text-overflow: ellipsis; }
.label.input { border-color: var(--rv-input); }
.label.output { border-color: var(--rv-accent); }
.pin { position: absolute; transform: translate(35%, -50%); pointer-events: auto; width: 22px; height: 22px; min-width: 0; min-height: 0; padding: 0; border-radius: 50%; background: var(--rv-accent); color: var(--rv-panel); border: 2px solid var(--rv-panel); font-weight: 700; font-size: 12px; line-height: 1; }
.note { position: absolute; max-width: 260px; padding: 6px 8px; background: var(--rv-panel); border: 1px solid var(--rv-border); border-radius: 6px; white-space: pre-wrap; overflow-wrap: anywhere; pointer-events: auto; }
.inspector { width: 260px; padding: 8px 10px; background: var(--rv-panel); border-left: 1px solid var(--rv-border); overflow: auto; min-height: 0; }
.inspector h2 { font-size: 14px; margin: 0 0 6px; }
.inspector dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 8px; margin: 0 0 8px; }
.inspector dt { color: var(--rv-muted); }
.inspector dd { margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; overflow-wrap: anywhere; }
.muted { color: var(--rv-muted); }
.errors { grid-column: 1 / -1; padding: 12px; overflow: auto; background: var(--rv-panel); }
.errors h2 { margin: 0 0 8px; font-size: 15px; color: var(--rv-error); }
.errors li { margin: 0 0 6px; overflow-wrap: anywhere; }
.code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 600; }
.hint { color: var(--rv-muted); }
.root.narrow { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr) minmax(0, 30%); }
.root.narrow .inspector { width: auto; min-height: 0; border-left: none; border-top: 1px solid var(--rv-border); }
.root.narrow .toolbar { gap: 4px 6px; padding: 4px 6px; }
.root.narrow .toolbar .wide-only { display: none; }
.root.narrow button { min-height: 32px; padding: 2px 6px; }
.root.narrow input[type="range"] { width: 70px; }
.root.narrow .title { display: none; }
[hidden] { display: none !important; }
`;
