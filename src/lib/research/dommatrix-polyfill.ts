import DOMMatrix from "dommatrix";

// pdfjs-dist (bundled inside pdf-parse) executes `new DOMMatrix()` at module
// load time. Node.js and Vercel serverless have no DOM, and pdfjs-dist's
// fallback polyfill source is @napi-rs/canvas — a native module that is not
// available on serverless — so without this the pdf-parse module fails to
// load with "ReferenceError: DOMMatrix is not defined".
//
// This file MUST evaluate before pdf-parse is imported anywhere. It is
// imported as a side effect at the top of document-parse.ts (ESM evaluates
// imports in source order, so the polyfill is installed first).
if (typeof globalThis.DOMMatrix === "undefined") {
  // DOMMatrix is a browser global, not defined on the Node global object.
  globalThis.DOMMatrix = DOMMatrix;
}
