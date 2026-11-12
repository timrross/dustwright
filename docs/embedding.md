# Embedding the viewer

Three ways to show a design on another page, from most to least capable.

## 1. The web component

Load the single-file viewer script and use the element. It works in a plain HTML page with no build step. The
URLs below are the public site on GitHub Pages; a build you serve yourself (`apps/site/dist`) works the same.

```html
<script src="https://timrross.github.io/dustwright/redstone-viewer.js"></script>
<redstone-viewer src="designs/not-gate.rsd.json" mode="instructions" height="480"></redstone-viewer>
```

Or inline the design in a child script element instead of `src`:

```html
<redstone-viewer height="480">
  <script type="application/json">
    { "format": "rsd/1", "meta": { "name": "NOT gate" }, ... }
  </script>
</redstone-viewer>
```

Attributes:

| Attribute         | Values                                                                 |
| ----------------- | ---------------------------------------------------------------------- |
| `src`             | A design URL, same origin or `https:`. At most 2 MB; validated first   |
| `mode`            | `explore` (default) or `instructions` (step through the build)         |
| `layer`, `step`   | The highest visible layer, or the build step, to open at               |
| `height`          | CSS height (default 480px)                                             |
| `theme`           | `light`, `dark` or `auto`                                              |
| `allowed-origins` | Origins (space- or comma-separated) that may send commands (see below) |

A design with structural errors shows its diagnostics instead of the canvas, never a blank page.

## 2. An iframe: `viewer.html?src=`

For hosts that only allow iframes, MediaWiki with an embed extension among them:

```html
<iframe
  src="https://timrross.github.io/dustwright/viewer.html?src=https://example.org/not-gate.rsd.json&mode=instructions"
  width="100%"
  height="480"
  title="NOT gate"
></iframe>
```

`viewer.html` takes the attributes above as query parameters (`src`, `mode`, `layer`, `step`, `theme`,
`allowed-origins`) and ships with the site's Content Security Policy:
`default-src 'self'; connect-src 'self' https:; img-src 'self' data:` and stricter.

### Messages

The viewer posts events to its parent window:

```js
{ source: "dustwright-viewer", type: "ready", detail: { name, size: [x, y, z], blocks } }
{ source: "dustwright-viewer", type: "select", detail: { type, pos, states, bedrock } }   // or detail: null
{ source: "dustwright-viewer", type: "step", detail: { index, count, title, blocks } }
{ source: "dustwright-viewer", type: "power", detail: { test, tick, maxTick, settleTicks } }
{ source: "dustwright-viewer", type: "error", detail: { diagnostics } }
```

Without `allowed-origins` they go to any parent (`*`): they carry nothing the page could not read from the design
itself. With `allowed-origins`, they go only to those origins.

The parent may send three commands:

```js
frame.contentWindow.postMessage({ type: "setStep", step: 2 }, "https://timrross.github.io");
frame.contentWindow.postMessage({ type: "setLayer", layer: 0 }, "https://timrross.github.io");
frame.contentWindow.postMessage({ type: "setMode", mode: "instructions" }, "https://timrross.github.io");
```

A command is accepted only when all of these hold; otherwise it is ignored without a reply:

- it comes from the iframe's parent window;
- the parent's origin is listed in `allowed-origins` (`*` is not accepted: name each origin);
- the message has exactly the documented shape: the `type` and one integer (or mode) field, nothing else.

Check events on your side too: accept them only from your iframe (`event.source === frame.contentWindow`), from
the viewer's origin, and with `source: "dustwright-viewer"`. The site's [embedding example](/embed-example.html)
does exactly this: it frames `viewer.html` and steps through a build with Previous and Next buttons.

Each viewer opens its own WebGL context, and browsers allow about 16 at once, so keep a page to a handful of
embedded viewers.

## 3. Layer sheets

Where no script or iframe is allowed, upload the layer sheets as ordinary images: `rsd sheets design.rsd.json -o
sheets/` (or Layer sheets in the playground) writes one A4 SVG per layer, in the style of the wiki's schematics.
