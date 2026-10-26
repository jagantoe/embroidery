// Rasterize an image to raw RGBA with headless Chromium (same path the browser app uses).
const { chromium } = require('playwright');
const { readFileSync, writeFileSync } = require('node:fs');
const [,, file, wmm, hmm, ppm, out] = process.argv;
const W = Math.round(+wmm * +ppm), H = Math.round(+hmm * +ppm);
(async () => {
const b = await chromium.launch();
const p = await b.newPage();
const data = readFileSync(file).toString('base64');
const mime = file.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
const rgba = await p.evaluate(async ({ data, mime, W, H }) => {
  const img = new Image();
  img.src = `data:${mime};base64,${data}`;
  await img.decode();
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, W, H);
  return Array.from(g.getImageData(0, 0, W, H).data);
}, { data, mime, W, H });
writeFileSync(out, Buffer.from(Uint8Array.from(rgba)));
console.log('wrote', out, W, H);
await b.close();
})();
