# 11 — Libraries, prior art and risks

The file format is solved by open source; the value we add is a simple, browser-native digitizer and editor for hobbyists. Because the tool is free and published under **GPL-3.0**, we can reuse GPL code (Ink/Stitch, Potrace) directly.

## Libraries and prior art

| Project | Language | Licence | Use for us |
|---|---|---|---|
| [pyembroidery](https://github.com/EmbroidePy/pyembroidery) | Python | MIT | Reference PES/PEC reader-writer; golden-test oracle; Pyodide stop-gap |
| [libembroidery](https://github.com/Embroidermodder/libembroidery) | C | zlib | Second reader for round-trip tests |
| [Ink/Stitch](https://inkstitch.org) | Python (Inkscape extension) | GPL-3.0 | Best open digitizing reference (satin columns, fill routing, underlay); code reusable under our licence |
| [Clipper2](https://github.com/AngusJohnson/Clipper2) | C++/C#/Delphi, WASM ports | Boost | Polygon offset and boolean ops |
| [Potrace](https://potrace.sourceforge.net) | C | GPL-2.0+ | Raster → vector tracing (WASM build) |
| OpenCV.js | WASM | Apache-2.0 | Colour quantisation, distance transform, skeleton |
| PixiJS | TypeScript | MIT | WebGL stitch preview |
| PE-Design, Wilcom, Hatch, Embrilliance | — | Proprietary | UX and quality benchmarks |

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Auto-digitized output sews badly (puckering, gaps) | High — the core promise | Machine test kit ([09](09-pes-writer.md#machine-test-kit)), conservative defaults, density warnings |
| Photos and gradients trace into noise | Medium | Detect > 15 colours or soft gradients and warn; "poster" preset; position as a logo/clip-art tool |
| PES v6 header fields not fully understood | Medium | Ship v1 first; v6 only after PE-Design and machine tests pass |
| Large designs (> 100k stitches) slow in browser | Low | Web Worker, incremental re-stitching, WebGL preview |
| Trademark | Low | Say "compatible with Brother machines"; no Brother logos |
| Licensing | Resolved | Free tool → GPL-3.0 open source |

## Sources

PES/PEC byte layouts and the encoder were checked against the pyembroidery 1.5.1 source code (`PesWriter.py`, `PecWriter.py`, `PesReader.py`, `EmbThreadPec.py`). Web search was unavailable while writing, so machine models, hoop sizes and licences come from general knowledge and should be confirmed on [Brother support](https://support.brother.com) and each project's repository before they are relied on.
