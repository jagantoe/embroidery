# 12 — Motion, thread motifs and page transitions

The site should feel alive and handmade without getting in the way of a tool. Motion comes from **thread**: spools, running stitches, a needle. Every animation is decorative, short, and switched off for people who prefer reduced motion.

> Browser-support notes are from general knowledge (mid-2026); confirm on caniuse.com / MDN before relying on a feature.

## Principles

1. **The tool comes first.** The start page is a drop zone, recent projects and a 3-step explainer — no marketing sections.
2. **Motion means something.** Marching stitches = "working / ready for input", a bobbing needle = "sewing", a pop = "done".
3. **Short and springy.** 200–450 ms for UI changes, slight overshoot (`cubic-bezier(.3,1.4,.5,1)`); loops only on small decorative elements.
4. **Respect `prefers-reduced-motion`.** All keyframes, transitions and view transitions are disabled.

## Thread motifs

| Motif | Where | Animation | CSS hook |
|---|---|---|---|
| Spool logo | Every header | Tilts on hover (springy rotate) | `.np-spool` |
| Stitch rule | Under every header, above footer | Dashes march sideways (background-position) | `.np-stitch-rule` |
| Thread line | Start page, above the drop zone | Thread draws in from the spool once (stroke-dashoffset) | `.np-thread` |
| Spool | Start page | Gentle wobble | `.np-wobble` |
| Needle | Start page | Bobs up and down like it's stitching | `.np-needle` |
| Cross-stitch sparkles | Start page | Twinkle (opacity + scale) | `.np-twinkle` |
| Yarn ball | Start page | Rolls back and forth | `.np-roll` |
| Drop-zone border | Start page | Marching ants, faster on hover/focus | `.np-ants` |
| Needle position | Sew simulator | Pulses where the needle is | `.np-pulse` |
| "Ready" badge | Export | Pops in once | `.np-pop` |
| Project cards | Start page | Lift and tilt slightly on hover | `.np-card` |

Ideas for the real build:

- **Digitizing progress**: a spool unwinding while the Web Worker runs; thread length = progress.
- **Empty states**: a sleepy spool.
- **Export success**: a short thread "signature" stitched under the file name.

## Page transitions

| Technique | Use for | Support (approx.) |
|---|---|---|
| Same-document View Transitions — `document.startViewTransition()` | The app itself (upload → editor → simulator → export) as a single-page app, so editor state stays in memory | Chrome/Edge 111+, Safari 18+, Firefox 144+ — Baseline |
| Cross-document View Transitions — `@view-transition { navigation: auto; }` | Static pages (docs, help) and as the mockups use it | Chrome/Edge 126+, Safari 18.2+; not yet Firefox → progressive enhancement, falls back to a normal page load |
| `view-transition-name` shared elements | `brand` (logo), `progress` (step pills), `design` (the design preview morphs between pages) | as above |

Default root animation: old page slides 32 px left and fades (220 ms), new page slides in from the right (340 ms). The `design` group gets a springy 450 ms morph so the preview visibly "travels" from upload to editor to export.

```css
@view-transition { navigation: auto; }
::view-transition-old(root) { animation: .22s ease-in both np-out; }
::view-transition-new(root) { animation: .34s cubic-bezier(.2,.8,.2,1) both np-in; }
::view-transition-group(design) { animation-duration: .45s; animation-timing-function: cubic-bezier(.3,1.2,.4,1); }
@keyframes np-out { to   { opacity: 0; transform: translateX(-32px); } }
@keyframes np-in  { from { opacity: 0; transform: translateX(32px); } }
```

SPA router sketch:

```ts
function navigate(to: Route) {
  if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return render(to);
  }
  document.startViewTransition(() => render(to));
}
```

## Other modern CSS/HTML we lean on

| Feature | Use | Support |
|---|---|---|
| `@starting-style` | Entry animations for popovers, dialogs, toasts | Baseline 2024 |
| Popover API (`popover`) | Tips, thread picker, menus without JS positioning libraries | Baseline 2024 |
| `:has()` | Style radio "cards" when their input is checked | Baseline 2023 |
| CSS nesting | Component styles | Baseline 2023 |
| `text-wrap: balance` | Headlines | Baseline 2024 |
| `<dialog>` | Export and settings dialogs | Baseline |
| Scroll-driven animations | Optional only (not in all browsers yet) | Chrome/Edge, Safari 26; not Firefox stable |

## Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) { animation: none !important; }
}
```

(The view-transition selectors sit in their own rule so an older browser that doesn't know them doesn't drop the first rule.)
