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

// Fixture job pages. Each run uses a fresh job path, so saving is new.
const run = Date.now().toString(36);
test.beforeAll(async () => {
  server = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html');
    // A careers page embedding the application from "another site": the
    // same server under localhost, a different origin from 127.0.0.1.
    if (req.url?.endsWith('/embedded')) {
      const port = (server.address() as { port: number }).port;
      res.end(`<!doctype html><title>Careers</title><main><h1>Join us</h1>
        <form><label for="nl">Newsletter email</label><input id="nl" type="email" name="newsletter"></form>
        <iframe id="grnhse_iframe" src="http://localhost:${port}${req.url.replace('/embedded', '/apply')}" width="900" height="1200"></iframe></main>`);
      return;
    }
    // A posting whose Apply button leads to its application (in a new tab, for /quick-tab).
    if (req.url?.endsWith('/quick') || req.url?.endsWith('/quick-tab')) {
      const page = readFileSync(join(import.meta.dirname, 'pages', 'job.html'), 'utf8');
      const to = `${req.url.replace(/\/quick(-tab)?$/, '')}/apply`;
      res.end(page.replace('<a href="apply.html">Apply</a>', `<a href="${to}"${req.url.endsWith('-tab') ? ' target="_blank"' : ''}>Apply now</a>`));
      return;
    }
    const file = req.url?.endsWith('/apply') ? 'apply.html' : req.url?.endsWith('/steps') ? 'steps.html' : req.url?.endsWith('/traps') ? 'traps.html' : 'job.html';
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
  // And the work authorization answers a form asks for (a fresh account has none,
  // and Wera never guesses them).
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const { applicant } = (await (await fetch(`${API}/api/applicant`, { headers: auth })).json()) as { applicant: Record<string, string> };
  const saved = await fetch(`${API}/api/applicant`, {
    method: 'PUT',
    headers: auth,
    body: JSON.stringify({ ...applicant, authorized_to_work: 'yes', needs_sponsorship: 'no' }),
  });
  expect(saved.ok).toBe(true);
  // Answers learned on earlier runs would fill the questions these tests draft (an older API has none).
  await fetch(`${API}/api/applicant/answers`, { method: 'DELETE', headers: auth });
  await fetch(`${API}/api/ext/tokens/current`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });

  const dist = resolve(import.meta.dirname, '..', 'dist');
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  // WERA_E2E_LOG=1 prints every page's console and errors (and the service worker's), to see why a test failed.
  if (process.env.WERA_E2E_LOG) {
    const print = (where: string) => (m: { type(): string; text(): string }) => console.log(`[${where} ${m.type()}] ${m.text()}`);
    worker.on('console', print('worker'));
    context.on('page', (p) => {
      p.on('console', print('page'));
      p.on('pageerror', (e) => console.log(`[page error] ${e.message}`));
    });
  }
});

test.afterAll(async () => {
  await context?.close();
  server?.close();
});

// A failed test leaves a screenshot of each open page (the panel included) beside its trace.
// eslint-disable-next-line no-empty-pattern -- Playwright reads the fixtures a hook asks for from this pattern
test.afterEach(async ({}, info) => {
  if (info.status === info.expectedStatus) return;
  for (const [i, p] of context.pages().entries()) {
    if (!p.isClosed()) await p.screenshot({ path: info.outputPath(`page-${i}.png`) }).catch(() => {});
  }
});

/** Calls the API as the test user with a short-lived token. */
async function asUser<T>(path: string): Promise<T> {
  const conn = await fetch(`${API}/api/ext/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'chrome-extension://e2e' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, name: 'e2e check' }),
  });
  const { token } = (await conn.json()) as { token: string };
  try {
    return (await (await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } })).json()) as T;
  } finally {
    await fetch(`${API}/api/ext/tokens/current`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  }
}

/** Screenshots for review when WERA_SHOTS is set. */
async function shot(p: Page, name: string) {
  if (process.env.WERA_SHOTS) await p.screenshot({ path: `${process.env.WERA_SHOTS}/${name}.png` });
}

/** The Wera panel on a page (its shadow root is open in test builds). */
const panelOf = (p: Page) => p.locator('wera-panel');

/** Opens the panel when it sits collapsed at the page's edge. */
async function open(p: Page) {
  const tab = panelOf(p).getByRole('button', { name: 'Show the Wera panel' });
  await expect(tab.or(panelOf(p).getByRole('dialog', { name: 'Wera' }))).toBeVisible({ timeout: 10_000 });
  if (await tab.isVisible()) await tab.click();
}

test('sign in on a posting, save it, then autofill its application', async () => {
  const job = await context.newPage();
  await job.goto(`${site}/jobs/${run}/sre`);
  // A posting: Wera waits at the edge of the page.
  await expect(panelOf(job).getByRole('button', { name: 'Show the Wera panel' })).toBeVisible({ timeout: 10_000 });
  await shot(job, 'posting-tab');
  await open(job);
  const panel = panelOf(job);
  await panel.getByLabel('Wera address').fill(API);
  await panel.getByLabel('Email').fill(EMAIL);
  await panel.getByLabel('Password').fill(PASSWORD);
  await panel.getByRole('button', { name: 'Connect' }).click();
  await panel.getByRole('button', { name: /Save to Wera/ }).click();
  await expect(panel.getByText('Open in Wera')).toBeVisible();
  await shot(job, 'posting-saved');

  // Its application: the panel opens on its own, and Autofill fills it.
  await job.goto(`${site}/jobs/${run}/sre/apply`);
  await expect(panel.getByRole('dialog', { name: 'Wera' })).toBeVisible({ timeout: 10_000 });
  await expect(panel.getByText('Open in Wera')).toBeVisible();
  await panel.getByRole('button', { name: /^Autofill$/ }).click();
  await expect(job.locator('#fn')).not.toHaveValue('', { timeout: 15_000 });
  await expect(job.locator('#em')).toHaveValue(/@/);
  await expect(job.locator('#sp')).not.toHaveValue('');
  await expect(panel.getByRole('button', { name: /Fill again/ })).toBeVisible({ timeout: 20_000 });
  // The best resume Wera has is attached.
  expect(await job.locator('#re').evaluate((i: HTMLInputElement) => i.files?.[0]?.name)).toMatch(/\.pdf$/);
  // Never ticks consent, never submits; consent is listed for the user.
  await expect(job.locator('#agree')).not.toBeChecked();
  expect(await job.title()).not.toBe('SUBMITTED');
  await expect(panel.getByText('agree yourself after reading it')).toBeVisible();
  await shot(job, 'apply-filled');

  // The open question has Wera's button.
  await job.locator('#why').focus();
  await expect(job.locator('wera-assist').getByRole('button', { name: 'Draft this answer with Wera' })).toBeVisible();
});

test('fill a multi-step application, then mark it applied', async () => {
  const job = await context.newPage();
  await job.goto(`${site}/jobs/${run}/sre`); // the posting saved above
  await open(job);
  await expect(panelOf(job).getByText('Open in Wera')).toBeVisible();
  // Its application, in the same tab: Wera keeps the job.
  await job.goto(`${site}/jobs/${run}/sre/steps`);
  const panel = panelOf(job);
  await panel.getByRole('button', { name: /^Autofill$/ }).click();
  await expect(job.locator('#fn')).not.toHaveValue('', { timeout: 15_000 });

  // Continue: Wera presses "Save and continue", then fills step 2 on its own.
  await panel.getByRole('button', { name: /Continue to the next page/ }).click({ timeout: 20_000 });
  await expect(job.locator('#ph')).toBeVisible({ timeout: 10_000 });
  await expect(job.locator('#sp')).not.toHaveValue('', { timeout: 15_000 });
  await expect(panel.getByText(/Last page/)).toBeVisible({ timeout: 20_000 });
  await shot(job, 'steps');

  // The user writes their own answer (CI's API has no AI to draft one), then submits; Wera sees the
  // thank-you, moves the job to Applied, says so, then closes the tab.
  await job.locator('#why').fill('I want to keep a fleet of robots online, and Fixture runs the biggest one.');
  const closed = job.waitForEvent('close', { timeout: 30_000 });
  await job.locator('#submit').click();
  await expect(panel.getByRole('alertdialog', { name: 'Application submitted' })).toBeVisible({ timeout: 15_000 });
  await expect(panel.getByText(/is now Applied in your Wera tracker/)).toBeVisible();
  await expect(panel.getByText(/Application sent. Marked as applied/)).toBeVisible();
  await shot(job, 'applied');
  await closed;
  // The answer on the form the user submitted is remembered for the next one.
  await expect.poll(async () => (await asUser<{ answers: { question: string }[] }>('/api/applicant/answers')).answers.map((a) => a.question))
    .toContain('Why do you want to join Fixture Robotics?');
});

test('is not duped by a form set with traps for AI tools', async () => {
  const job = await context.newPage();
  await job.goto(`${site}/jobs/${run}/sre/traps`);
  const panel = panelOf(job);
  await panel.getByRole('button', { name: /^Autofill$/ }).click();
  await expect(job.locator('#fn')).not.toHaveValue('', { timeout: 15_000 });
  await expect(panel.getByRole('button', { name: /Fill again/ })).toBeVisible({ timeout: 30_000 });
  // What a person sees is filled, however a page lays it out: a label in a "font-size: 0" row, and pills over hidden radios.
  await expect(job.locator('#em')).toHaveValue(/@/);
  await expect(job.locator('#n')).toBeChecked();
  expect(await job.locator('#re').evaluate((i: HTMLInputElement) => i.files?.[0]?.name)).toMatch(/\.pdf$/);
  // No decoy is touched, whatever its label asks for.
  for (const id of ['#d1', '#d2', '#d3', '#d4', '#d5', '#d6']) await expect(job.locator(id), id).toHaveValue('');
  // Nothing obeys an order: no 0, no banana. What only the person can answer stays theirs.
  for (const id of ['#q1', '#q2']) expect(await job.locator(id).inputValue(), id).not.toMatch(/^\s*0\s*$/);
  await expect(job.locator('#c1')).toHaveValue('');
  await expect(job.locator('#c2')).toHaveValue('');
  await expect(job.locator('#c3')).toHaveValue('');
  // The user is told, in words, and can read each line.
  await panel.getByRole('button', { name: /tests whether you read it/ }).click();
  await expect(panel.getByText(/pineapple on pizza/)).toBeVisible();
  await expect(panel.getByText(/flamingo/)).toBeVisible();
  await expect(panel.getByText(/Avocado/)).toBeVisible();
  await expect(panel.getByText(/boxes set out to catch bots were left empty/)).toBeVisible();
  await shot(job, 'traps');
  // Required, and only the person can answer it.
  await expect(panel.getByText(/a check that a person is filling the form/).first()).toBeVisible();
  // The Wera button stays off what is not an open question.
  await job.locator('#c3').focus();
  await job.waitForTimeout(400);
  await expect(job.locator('wera-assist').getByRole('button', { name: 'Draft this answer with Wera' })).toHaveCount(0);
  await job.close();
});

test('applies from the posting: one press, and the application fills itself', async () => {
  const job = await context.newPage();
  await job.goto(`${site}/jobs/${run}-quick/quick`);
  await open(job);
  await panelOf(job).getByRole('button', { name: /Apply with Wera/ }).click();
  await job.waitForURL(/\/apply$/);
  await expect(job.locator('#fn')).not.toHaveValue('', { timeout: 15_000 });
  await expect(job.locator('#em')).toHaveValue(/@/);
  await job.close();
});

test('applies from a posting that opens the application in a new tab', async () => {
  const job = await context.newPage();
  await job.goto(`${site}/jobs/${run}-tab/quick-tab`);
  await open(job);
  const [tab] = await Promise.all([context.waitForEvent('page'), panelOf(job).getByRole('button', { name: /Apply with Wera/ }).click()]);
  await tab.waitForLoadState();
  await expect(tab.locator('#fn')).not.toHaveValue('', { timeout: 15_000 });
  await tab.close();
  await job.close();
});

test('keeps filling when the site\'s own Next button shows the next step', async () => {
  const job = await context.newPage();
  await job.goto(`${site}/jobs/${run}/sre/steps`);
  const panel = panelOf(job);
  await panel.getByRole('button', { name: /^Autofill$/ }).click();
  await expect(job.locator('#fn')).not.toHaveValue('', { timeout: 15_000 });
  await expect(panel.getByRole('button', { name: /Continue to the next page/ })).toBeVisible({ timeout: 20_000 });
  // The user presses the page's own button, not Wera's.
  await job.locator('#next').click();
  await expect(job.locator('#sp')).not.toHaveValue('', { timeout: 15_000 });
  await job.close();
});

test('the page makes room for the panel on an application', async () => {
  const job = await context.newPage();
  await job.setViewportSize({ width: 1280, height: 800 });
  await job.goto(`${site}/jobs/${run}/sre/apply`);
  await expect(panelOf(job).getByRole('dialog', { name: 'Wera' })).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => job.evaluate(() => document.documentElement.style.marginRight)).toBe('396px');
  const form = await job.locator('#f').boundingBox();
  const panel = await panelOf(job).getByRole('dialog', { name: 'Wera' }).boundingBox();
  expect(form!.x + form!.width).toBeLessThanOrEqual(panel!.x);
  await job.close();
});

test('stays off a mail inbox full of job emails and "thank you for applying"', async () => {
  await context.route('https://mail.google.com/**', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><title>Inbox - Gmail</title>
    <input aria-label="Search mail"><table><tr><td>Thank you for applying to Fixture Robotics</td></tr><tr><td>Your application has been received</td></tr></table>
    <h1>Senior Site Reliability Engineer</h1><p>About the role</p><p>Responsibilities</p><p>Qualifications</p><p>Benefits</p><a href="${site}/jobs/x/sre">Apply now</a>` }));
  const mail = await context.newPage();
  await mail.goto('https://mail.google.com/mail/u/0/#inbox');
  await mail.waitForTimeout(3000);
  await expect(panelOf(mail)).toHaveCount(0);
  await mail.close();
});

test('stays off a shop: a product with a coupon, and a checkout with a promo code', async () => {
  await context.route('https://www.amazon.com/**', (route) => route.fulfill({ contentType: 'text/html', body: route.request().url().includes('/gp/buy/')
    ? `<!doctype html><title>Checkout</title><h1>Checkout</h1><form><label for="a">Full name</label><input id="a"><label for="m">Email</label><input id="m" type="email">
      <label for="p">Phone</label><input id="p" type="tel"><label for="s">Street address</label><input id="s"><label for="c">City</label><input id="c">
      <label for="z">ZIP code</label><input id="z"><label for="o">Promo code</label><input id="o"><button type="button">Apply</button></form>`
    : `<!doctype html><title>Wireless Earbuds</title><h1>Wireless Earbuds</h1><button>Apply</button><a href="/cart">Apply now</a><h2>Benefits</h2><h2>Requirements</h2>
      <p>Qualifications for free delivery</p><h2>About the team</h2><p>Compensation for late delivery</p>` }));
  for (const url of ['https://www.amazon.com/dp/B0D1XD1ZV3?ref=position_1_job', 'https://www.amazon.com/gp/buy/spc/handlers/display.html']) {
    const shop = await context.newPage();
    await shop.goto(url);
    await shop.waitForTimeout(2500);
    await expect(panelOf(shop)).toHaveCount(0);
    await shop.close();
  }
});

test('fill an application embedded from another site, and again after a reload', async () => {
  const job = await context.newPage();
  await job.goto(`${site}/jobs/${run}/sre/embedded`);
  const panel = panelOf(job);
  await open(job);
  await panel.getByRole('button', { name: /^Autofill$/ }).click();
  const form = job.frameLocator('#grnhse_iframe');
  await expect(form.locator('#fn')).not.toHaveValue('', { timeout: 15_000 });
  await expect(form.locator('#em')).toHaveValue(/@/);
  // The careers page's own newsletter box is not the application.
  await expect(job.locator('#nl')).toHaveValue('');
  await shot(job, 'embedded');

  await job.reload();
  await expect(form.locator('#fn')).toHaveValue('');
  await open(job);
  await panel.getByRole('button', { name: /^Autofill$/ }).click();
  await expect(form.locator('#fn')).not.toHaveValue('', { timeout: 15_000 });
});

test('the panel comes on job pages and steps aside when the page stops being one', async () => {
  const job = await context.newPage();
  await job.goto(`${site}/jobs/${run}/sre/apply`);
  await expect(panelOf(job).getByRole('dialog', { name: 'Wera' })).toBeVisible({ timeout: 10_000 });
  await job.evaluate(() => {
    document.title = 'Blog';
    document.body.innerHTML = '<p>Just a blog post now.</p>';
  });
  await expect(panelOf(job).getByRole('dialog', { name: 'Wera' })).toBeHidden({ timeout: 10_000 });
});

test('the dashboard tells the extension which job a tab is for', async () => {
  // A dashboard page on the signed-in Wera server (the API serves no HTML,
  // so the test serves one at its address): the bridge runs there.
  const careers = `${site}/careers/fixture-robotics/sre-${run}`;
  const conn = await fetch(`${API}/api/ext/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'chrome-extension://e2e' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, name: 'e2e lookup' }),
  });
  const { token } = (await conn.json()) as { token: string };
  const found = await fetch(`${API}/api/ext/jobs/lookup?url=${encodeURIComponent(`${site}/jobs/${run}/sre`)}`, { headers: { Authorization: `Bearer ${token}` } });
  const { job: saved } = (await found.json()) as { job: { id: number } };
  await fetch(`${API}/api/ext/tokens/current`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });

  await context.route(`${API}/e2e-dashboard`, (route) =>
    route.fulfill({ contentType: 'text/html', body: `<!doctype html><title>Wera</title><a id="go" href="${careers}" target="_blank" rel="noreferrer">Apply on Fixture Robotics' site</a>` }));
  const dash = await context.newPage();
  await dash.goto(`${API}/e2e-dashboard`);
  await expect.poll(() => dash.evaluate(() => document.documentElement.dataset.weraExtension ?? '')).not.toBe('');
  // "Apply on Fixture Robotics' site", where the careers page has an address Wera never saw.
  await dash.evaluate(([id, url]) => window.postMessage({ source: 'wera-dashboard', type: 'open-job', jobId: id, url }, location.origin), [saved.id, careers] as const);
  const [tab] = await Promise.all([context.waitForEvent('page'), dash.click('#go')]);
  await tab.waitForLoadState();
  await open(tab);
  // The job, as Wera has it (marked applied by the test before).
  await expect(panelOf(tab).getByText('Open in Wera')).toBeVisible();
  await expect(panelOf(tab).getByText('Applied', { exact: true })).toBeVisible();
  await shot(tab, 'from-dashboard');
});

// Uses the live AI (a fraction of a cent): run with WERA_E2E_AI=1.
test('AI: draft an answer in the box, rework it, insert it', async () => {
  test.skip(!process.env.WERA_E2E_AI, 'set WERA_E2E_AI=1 to call the AI');
  const job = await context.newPage();
  await job.goto(`${site}/jobs/${run}/sre/apply`);
  await job.locator('#why').focus();
  const assist = job.locator('wera-assist');
  await assist.getByRole('button', { name: 'Draft this answer with Wera' }).click();
  await expect(assist.getByRole('button', { name: 'Insert' })).toBeEnabled({ timeout: 30_000 });
  await assist.getByLabel('What to change').fill('make it two sentences');
  await assist.getByLabel('What to change').press('Enter');
  await expect(assist.getByRole('button', { name: 'Insert' })).toBeEnabled({ timeout: 30_000 });
  await assist.getByRole('button', { name: 'Insert' }).click();
  await expect(job.locator('#why')).not.toHaveValue('');
  expect(await job.locator('#why').inputValue()).not.toMatch(/[—–]/);
  await shot(job, 'ai-answer');
});
