import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';

const API = process.env.WERA_API ?? 'http://127.0.0.1:8090';
const EMAIL = process.env.WERA_E2E_EMAIL ?? 'alex-e2e@example.com';
const PASSWORD = process.env.WERA_E2E_PASSWORD ?? 'e2e test password';

let server: Server;
let site = '';
let context: BrowserContext;
let extId = '';

// Fixture job pages. Each run uses a fresh job path, so saving is new.
const run = Date.now().toString(36);
test.beforeAll(async () => {
  server = createServer((req, res) => {
    const file = req.url?.endsWith('/apply') ? 'apply.html' : 'job.html';
    res.setHeader('Content-Type', 'text/html');
    res.end(readFileSync(join(import.meta.dirname, 'pages', file)));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address();
  site = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;

  // Give the account a resume PDF to attach (the API stores the latest).
  const conn = await fetch(`${API}/api/ext/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'chrome-extension://e2e' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, name: 'e2e setup' }),
  });
  const { token } = (await conn.json()) as { token: string };
  const form = new FormData();
  form.append('file', new Blob([readFileSync(join(import.meta.dirname, 'fixtures', 'resume.pdf'))], { type: 'application/pdf' }), 'Alex_Resume.pdf');
  const up = await fetch(`${API}/api/profile/resume`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  expect(up.ok).toBe(true);
  await fetch(`${API}/api/ext/tokens/current`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });

  const dist = resolve(import.meta.dirname, '..', 'dist');
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  extId = new URL(worker.url()).host;
});

test.afterAll(async () => {
  await context?.close();
  server?.close();
});

/** Screenshots for review when WERA_SHOTS is set. */
async function shot(p: Page, name: string) {
  if (process.env.WERA_SHOTS) await p.screenshot({ path: `${process.env.WERA_SHOTS}/${name}.png`, fullPage: true });
}

async function openPanel(): Promise<Page> {
  const panel = await context.newPage();
  await panel.setViewportSize({ width: 400, height: 900 });
  await panel.goto(`chrome-extension://${extId}/sidepanel.html`);
  return panel;
}

test('sign in, save a job from its page, and fill its application', async () => {
  const job = await context.newPage();
  await job.goto(`${site}/jobs/${run}/sre`);

  const panel = await openPanel();
  await panel.getByLabel('Wera address').fill(API);
  await panel.getByLabel('Email').fill(EMAIL);
  await panel.getByLabel('Password').fill(PASSWORD);
  await panel.getByRole('button', { name: 'Connect' }).click();

  // The job comes from the page's schema.org data, ready to review.
  await expect(panel.getByText("Filled from the page's job data")).toBeVisible();
  await expect(panel.getByLabel('Company')).toHaveValue('Fixture Robotics');
  await expect(panel.getByLabel('Title')).toHaveValue('Site Reliability Engineer');
  await expect(panel.getByLabel('Location')).toHaveValue('Austin, TX, US');
  await panel.getByRole('button', { name: 'Save to Wera' }).click();
  await expect(panel.getByText('In your Wera lists')).toBeVisible();
  await shot(panel, 'job-saved');

  // Same page again: Wera recognizes the saved job.
  await panel.reload();
  await expect(panel.getByText('In your Wera lists')).toBeVisible();

  // The application form: Wera opens on Apply and fills it.
  await job.goto(`${site}/jobs/${run}/sre/apply`);
  await job.bringToFront();
  await panel.reload();
  await expect(panel.getByRole('tab', { name: 'Apply' })).toHaveAttribute('aria-selected', 'true');
  await panel.getByRole('button', { name: 'Fill the form' }).click();
  await expect(panel.getByText(/^Filled \d+ field/)).toBeVisible();

  await expect(job.locator('#fn')).not.toHaveValue('');
  await expect(job.locator('#em')).toHaveValue(/@/);
  await expect(job.locator('#sp')).not.toHaveValue('');
  // The best resume Wera has is attached: a tailored copy, the main
  // resume, or the uploaded file, and the panel says which.
  expect(await job.locator('#re').evaluate((i: HTMLInputElement) => i.files?.[0]?.name)).toMatch(/\.pdf$/);
  await expect(panel.getByText(/Resume offered for upload/)).toBeVisible();
  // Never ticks consent, never submits.
  await expect(job.locator('#agree')).not.toBeChecked();
  expect(await job.title()).not.toBe('SUBMITTED');
  // The open question is offered for an AI draft.
  await expect(panel.getByText('Why do you want to join Fixture Robotics?')).toBeVisible();
  await expect(panel.getByRole('button', { name: /Draft an answer/ })).toBeVisible();
  await shot(panel, 'apply-panel');
  await shot(job, 'apply-form');
});

// Uses the live AI (a fraction of a cent): run with WERA_E2E_AI=1.
test('AI: draft an answer, write a cover letter, tailor the resume', async () => {
  test.skip(!process.env.WERA_E2E_AI, 'set WERA_E2E_AI=1 to call the AI');
  const job = await context.newPage();
  await job.goto(`${site}/jobs/${run}/sre/apply`);
  const panel = await openPanel();
  if (await panel.getByLabel('Wera address').isVisible().catch(() => false)) {
    await panel.getByLabel('Wera address').fill(API);
    await panel.getByLabel('Email').fill(EMAIL);
    await panel.getByLabel('Password').fill(PASSWORD);
    await panel.getByRole('button', { name: 'Connect' }).click();
  }
  await panel.getByRole('button', { name: /Fill the form|Fill again/ }).click();
  await panel.getByRole('button', { name: /Draft an answer/ }).click();
  const answer = panel.getByLabel(/Answer to Why do you want/);
  await expect(answer).not.toHaveValue('', { timeout: 30_000 });
  expect(await answer.inputValue()).not.toMatch(/[—–]/);
  await panel.getByRole('button', { name: 'Insert into form' }).click();
  await expect(job.locator('#why')).toHaveValue(await answer.inputValue());
  await shot(panel, 'ai-answer');

  await panel.getByRole('tab', { name: 'Letter' }).click();
  await panel.getByRole('button', { name: /Write my letter|Rewrite/ }).click();
  await expect(panel.getByText(/^Dear /)).toBeVisible({ timeout: 30_000 });
  await shot(panel, 'ai-letter');

  await panel.getByRole('tab', { name: 'Resume' }).click();
  await panel.getByRole('button', { name: /Tailor my resume/ }).click();
  await expect(panel.getByRole('link', { name: /Edit in Wera/ })).toBeVisible({ timeout: 45_000 });
  await expect(panel.getByAltText('Resume preview')).toBeVisible({ timeout: 15_000 });
  await shot(panel, 'ai-resume');
});
