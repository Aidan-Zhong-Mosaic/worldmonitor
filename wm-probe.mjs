import { chromium } from 'playwright';

const BASE = process.env.WM_URL || 'http://localhost:3001/';

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text().slice(0, 300)}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${String(e).slice(0, 500)}`));

const snapshot = () => page.evaluate(() => {
  const grid = document.getElementById('panelsGrid');
  let settings = null;
  try { settings = JSON.parse(localStorage.getItem('worldmonitor-panels') || 'null'); } catch {}
  const enabled = settings ? Object.entries(settings).filter(([, v]) => v && v.enabled).map(([k]) => k) : null;
  return {
    storedVariant: localStorage.getItem('worldmonitor-variant'),
    storedLayoutVariant: localStorage.getItem('worldmonitor-panel-layout-variant'),
    activeChip: document.querySelector('.lob-switcher .variant-option.active')?.getAttribute('data-variant') ?? null,
    gridChildren: grid ? grid.children.length : -1,
    panelEls: document.querySelectorAll('.panel').length,
    settingsCount: settings ? Object.keys(settings).length : -1,
    enabledCount: enabled ? enabled.length : -1,
    enabledSample: enabled ? enabled.slice(0, 15) : null,
  };
});

await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(10000);
console.log('BOOT 1 (fresh):', JSON.stringify(await snapshot(), null, 2));

// Reload once — second boot on the same LOB
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(8000);
console.log('BOOT 2 (same lob, reload):', JSON.stringify(await snapshot(), null, 2));

// Switch to another LOB via the header chip
await page.click('.lob-switcher .variant-option[data-variant="cyber"]');
await page.waitForTimeout(10000);
console.log('BOOT 3 (after switch to cyber):', JSON.stringify(await snapshot(), null, 2));

await page.click('.lob-switcher .variant-option[data-variant="specialty-casualty"]');
await page.waitForTimeout(10000);
console.log('BOOT 4 (after switch to specialty-casualty):', JSON.stringify(await snapshot(), null, 2));

console.log('--- console errors ---');
console.log(errors.slice(0, 30).join('\n') || '(none)');
await browser.close();
