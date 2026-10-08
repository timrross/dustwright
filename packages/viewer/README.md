# @dustwright/viewer

A read-only Three.js viewer for Dustwright designs, as the `<redstone-viewer>` web component. It renders the
normalised model from `@dustwright/core` (never the raw JSON), so what you inspect is what the exporters place.

## Use

```html
<script src="redstone-viewer.js"></script>
<!-- dist/bundle/redstone-viewer.js, an IIFE with everything inlined -->
<redstone-viewer src="designs/not-gate.rsd.json" height="480" theme="auto"></redstone-viewer>
```

Or with the design inline:

```html
<redstone-viewer>
  <script type="application/json">
    { "format": "rsd/1", ... }
  </script>
</redstone-viewer>
```

From a bundler: `import { defineRedstoneViewer } from "@dustwright/viewer/browser"; defineRedstoneViewer();`.

## Attributes

| Attribute | Values                                                                                                |
| --------- | ----------------------------------------------------------------------------------------------------- |
| `src`     | URL of a design: same-origin or `https:` only, at most 2 MB, parsed (stage 1) before anything renders |
| `mode`    | `explore` (default) or `instructions` (step through `steps`)                                          |
| `layer`   | Highest visible layer                                                                                 |
| `step`    | Current instruction step                                                                              |
| `height`  | Pixels, or a CSS length (`480`, `70vh`)                                                               |
| `theme`   | `light`, `dark` or `auto` (follows the system)                                                        |

## Methods and events

Methods: `load(designTextOrObject)`, `loadSrc(url)`, `setLayer(y)`, `setIsolate(on)`, `setOverlay(on)`,
`setMode(mode)`, `setStep(i)`, `snap("iso" | "north" | "east" | "south" | "west" | "top")`, `select(pos | null)`,
`orbitBy(dAzimuth, dPolar)`, `visibleBlockCount()`, `screenPositionOf(pos)`, `renderNow()`; properties `model`
and `diagnostics`.

Events (DOM `CustomEvent`s that bubble out of the shadow root; inside an iframe also `postMessage` to the parent as
`{ source: "dustwright-viewer", type, detail }`): `ready` (`{ name, size, blocks }`), `select` (the block's
position, type, abstract states and Bedrock ID and states, or `null`), `step` (`{ index, count, title, blocks }`),
`error` (`{ diagnostics }`). Inbound commands from a host page arrive in M7.

## Controls

Mouse or touch: orbit, pan, zoom (OrbitControls); hover highlights a block; click pins it in the inspector.
Keyboard on the focused view: arrow keys orbit; Enter selects (the block under the pointer, or the first block);
Shift with the arrow keys moves the selection along x and z, Shift with Page Up and Page Down along y; Escape
clears it; `[` and `]` change layer; `n` and `b` step in instructions mode; `r` resets the view. Toolbar: reset and N/E/S/W/top views, the layer slider with isolate,
explode, the direction-arrow overlay and instructions mode. The inspector is a live region and becomes a bottom
sheet below 520 px wide.

## Safety

All design text (names, annotations, port names, step titles) is set with `textContent`; nothing uses
`innerHTML`, `eval` or `new Function` (enforced by ESLint and checked by the hostile-name Playwright test). Styles
are applied with constructable stylesheets, so the component works under a CSP without inline styles.

## Build and test

`pnpm build` compiles the library (`dist/`) and the IIFE bundle (`dist/bundle/redstone-viewer.js`, about 650 KB).
Unit tests: `pnpm test packages/viewer`. Browser tests: `pnpm e2e` (Playwright, see CONTRIBUTING.md).
