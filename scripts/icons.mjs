// Renders public/icons/{16,32,48,128}.png from the dashboard's favicon
// (wera-frontend/public/favicon.svg, copied below), so the extension and
// the web app share one mark. Run after changing it: node scripts/icons.mjs
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

// The briefcase mark in its dark-theme colors (as favicon.svg).
const svg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none">
  <defs>
    <linearGradient id="g" x1="3" y1="6" x2="21" y2="21" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FF7A59"/>
      <stop offset="1" stop-color="#F2546A"/>
    </linearGradient>
  </defs>
  <path d="M8.75 7V5.25A2.25 2.25 0 0 1 11 3h2a2.25 2.25 0 0 1 2.25 2.25V7" stroke="#FF7A59" stroke-width="2" stroke-linecap="round"/>
  <rect x="2" y="6.5" width="20" height="14.5" rx="4" fill="url(#g)"/>
  <path d="M2 12.75h20" stroke="#0A0B0F" stroke-opacity="0.3" stroke-width="1.25"/>
  <rect x="10" y="11" width="4" height="3.5" rx="1.25" fill="#0A0B0F"/>
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
