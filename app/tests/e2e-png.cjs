// PNG path: a raster logo on a solid grey background should drop the background.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://localhost:4173/');
  await p.setInputFiles('#file', process.argv[2]);
  await p.getByText(/We found \d+ colour/).waitFor({ timeout: 20000 });
  console.log(await p.locator('.colour-list li').allInnerTexts());
  await p.getByRole('button', { name: 'Digitize my design' }).click();
  await p.getByRole('tablist', { name: 'View' }).waitFor({ timeout: 60000 });
  await p.waitForTimeout(800);
  console.log(await p.locator('.status-bar').innerText());
  console.log(await p.locator('.tips').innerText());
  await p.screenshot({ path: 'tests/out/png-editor.png' });
  console.log(errors.length ? errors : 'no errors');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
