/**
 * @packageDocumentation
 * Browser entry: the web component and the scene. Separate from the package index so that Node consumers (tests,
 * the registry check) can import the geometry without loading Three.js's WebGL code or touching `HTMLElement`.
 */
export { defineRedstoneViewer, ELEMENT_NAME, MESSAGE_SOURCE, RedstoneViewer } from "./element.js";
export { ViewerScene } from "./scene.js";
export * from "./index.js";
