// Renders public/icons/{16,32,48,128}.png from the Wera briefcase mark.
// Run once after changing the mark: node scripts/icons.mjs
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const svg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
  <rect x="1" y="1" width="22" height="22" rx="5.5" fill="#D9653F"/>
  <rect x="5" y="9" width="14" height="9.5" rx="1.8" fill="#fff"/>
  <path d="M9.5 9V7.6A1.3 1.3 0 0 1 10.8 6.3h2.4a1.3 1.3 0 0 1 1.3 1.3V9" fill="none" stroke="#fff" stroke-width="1.6"/>
  <rect x="10.8" y="12.3" width="2.4" height="1.6" rx=".5" fill="#D9653F"/>
</svg>`;

mkdirSync('public/icons', { recursive: true });
const browser = await chromium.launch(process.env.PW_CHROME_PATH ? { executablePath: process.env.PW_CHROME_PATH } : {});
for (const size of [16, 32, 48, 128]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0;background:transparent">${svg(size)}</body>`);
  await page.locator('svg').screenshot({ path: `public/icons/${size}.png`, omitBackground: true });
  await page.close();
}
await browser.close();
console.log('icons written');
