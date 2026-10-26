# 00 — Decisions

Decided 2026-10-25.

| Question | Decision | Consequence |
|---|---|---|
| Main user | Hobbyists with single-needle home machines | Default hoop 100×100 mm (130×180 one click away), woven-fabric preset, plain-language settings. Colour changes remain a top optimisation goal: on a single-needle machine every change is a manual rethread. Assume no automatic thread cutter, so jumps are minimised too. |
| Price / licence | Free | Publish as open source under **GPL-3.0**. This lets us reuse Ink/Stitch and Potrace code legally instead of clean-room rewrites. |
| Platform | Browser-first | See comparison below. The same web app can later be wrapped as a desktop app (e.g. Tauri) without a rewrite. |
| Test machine | Not needed yet | PES is the same for every Brother model. The exact model matters before the Phase 1 gate (first physical sew) and for hoop list, auto-trimmer and Wi-Fi defaults. |
| Output mode | Standalone patch is the default | "Sew on white fabric" is a toggle that skips white fills and lowers density. See [05](05-example-flanders.md#two-output-modes). |

## Browser vs desktop

| Factor | Browser | Desktop |
|---|---|---|
| Getting started | Open a link | Installer per OS, updates, code signing |
| Hosting cost for a free tool | Static hosting, effectively free — all work runs on the user's device | Free, but signing and distributing installers costs time |
| Ecosystem | Port geometry to TypeScript/WASM (Clipper2 and Potrace WASM builds exist), or run pyembroidery + shapely in Pyodide | Python ecosystem directly: pyembroidery, shapely, Ink/Stitch |
| Saving to the USB stick | Download, or save straight to the stick via the File System Access API (Chrome/Edge) | Direct |
| Performance | Fine with Web Worker + WASM up to ~100k stitches | Somewhat faster |
| Competition | Few free, simple browser digitizers | Ink/Stitch already is the free desktop digitizer, but requires Inkscape skills |

**Recommendation: browser.** The strongest desktop argument is the mature Python stack, and Ink/Stitch already fills the free-desktop niche. A simple browser tool for hobbyists is the gap. If a prototype needs speed, pyembroidery can run in the browser via Pyodide while the TypeScript writer is being built.

## Still open

- Which Brother model(s) are available for physical testing (needed before the Phase 1 gate).
- Whether that machine has an automatic thread cutter — changes how aggressively we avoid jumps.
