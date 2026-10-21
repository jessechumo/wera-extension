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
    const file = req.url?.endsWith('/apply') ? 'apply.html' : req.url?.endsWith('/steps') ? 'steps.html' : 'job.html';
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
  // Wera reads the form into a list first: each field with what it would enter. Nothing is typed yet.
  await expect(panel.getByLabel('Value for First name')).not.toHaveValue('');
  await expect(job.locator('#fn')).toHaveValue('');
  await expect(panel.getByLabel('Fill I agree to the privacy policy')).toBeDisabled();
  await shot(panel, 'apply-plan');
  await panel.getByRole('button', { name: /^Fill \d+ fields?$/ }).click();
  await expect(panel.getByLabel('Filled').first()).toBeVisible();

  await expect(job.locator('#fn')).not.toHaveValue('');
  await expect(job.locator('#em')).toHaveValue(/@/);
  await expect(job.locator('#sp')).not.toHaveValue('');
  // The best resume Wera has is attached: a tailored copy, the main
  // resume, or the uploaded file, and the panel says which.
  expect(await job.locator('#re').evaluate((i: HTMLInputElement) => i.files?.[0]?.name)).toMatch(/\.pdf$/);
  await expect(panel.getByText(/Resume to attach/)).toBeVisible();
  // Never ticks consent, never submits.
  await expect(job.locator('#agree')).not.toBeChecked();
  expect(await job.title()).not.toBe('SUBMITTED');
  // The open question is offered for an AI draft.
  await expect(panel.getByText('Why do you want to join Fixture Robotics?')).toBeVisible();
  await expect(panel.getByRole('button', { name: /Draft an answer/ })).toBeVisible();
  await shot(panel, 'apply-panel');
  await shot(job, 'apply-form');
});

test('fill a multi-step application, then mark it applied', async () => {
  const job = await context.newPage();
  await job.goto(`${site}/jobs/${run}/sre`); // the posting saved above
  const panel = await openPanel();
  await expect(panel.getByText('In your Wera lists')).toBeVisible();
  // Its application, in the same tab: Wera keeps the job.
  await job.goto(`${site}/jobs/${run}/sre/steps`);
  await job.bringToFront();
  await panel.reload();
  await panel.getByRole('button', { name: /^Fill \d+ fields?$/ }).click();
  await expect(job.locator('#fn')).not.toHaveValue('');

  // Approve the page: Wera presses "Save and continue", then reads and fills step 2 on its own.
  await panel.getByRole('button', { name: /Approve & continue/ }).click();
  await expect(job.locator('#ph')).toBeVisible({ timeout: 10_000 });
  await expect(job.locator('#sp')).not.toHaveValue('', { timeout: 15_000 });
  await expect(panel.getByRole('heading', { name: 'Application, page 2' })).toBeVisible();
  // The last page: Wera never presses Submit.
  await expect(panel.getByText(/This is the last page/)).toBeVisible();
  await expect(job.getByRole('heading', { name: 'Application questions' })).toBeVisible();
  await shot(panel, 'steps-panel');

  // The user submits; Wera sees the thank-you page and moves the job to Applied on its own.
  await job.locator('#submit').click();
  await expect(panel.getByText(/Application sent. Marked as applied/)).toBeVisible({ timeout: 15_000 });
  await shot(panel, 'applied');
  await shot(job, 'applied-toast');

});

test('fill an application embedded from another site, and read it again after a reload', async () => {
  const job = await context.newPage();
  await job.goto(`${site}/jobs/${run}/sre/embedded`);
  const panel = await openPanel();
  await expect(panel.getByRole('tab', { name: 'Apply' })).toHaveAttribute('aria-selected', 'true');
  await panel.getByRole('button', { name: /^Fill \d+ fields?$/ }).click();
  const form = job.frameLocator('#grnhse_iframe');
  await expect(form.locator('#fn')).not.toHaveValue('');
  await expect(form.locator('#em')).toHaveValue(/@/);
  // The careers page's own newsletter box is not the application.
  await expect(job.locator('#nl')).toHaveValue('');
  await shot(job, 'embedded-form');

  // The page reloads and its form is empty again: Wera reads it again and fills it.
  // The panel, opened here as a tab, works on the most recently used other
  // tab; close the earlier tests' job tabs so a slow machine cannot pick one.
  for (const p of context.pages()) if (p !== job && p !== panel) await p.close();
  await job.reload();
  await expect(form.locator('#fn')).toHaveValue('');
  await job.bringToFront();
  await panel.reload();
  await panel.getByRole('button', { name: /^Fill \d+ fields?$/ }).click();
  await expect(form.locator('#fn')).not.toHaveValue('');
});

test('slides the Wera dock in on job pages', async () => {
  const job = await context.newPage();
  await job.goto(`${site}/jobs/${run}/sre/apply`);
  const dock = job.locator('wera-launcher');
  await expect(dock).toHaveJSProperty('hidden', false, { timeout: 10_000 });
  await job.waitForTimeout(500); // the slide-in
  await shot(job, 'dock-form');
  // The page turns into something that is neither a posting nor an application: the dock goes.
  await job.evaluate(() => { document.body.innerHTML = '<p>Just a blog post now.</p>'; });
  await expect(dock).toHaveJSProperty('hidden', true, { timeout: 10_000 });
});

test('the dashboard tells the extension which job a tab is for', async () => {
  // The job saved by the first test, as Wera has it.
  const conn = await fetch(`${API}/api/ext/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'chrome-extension://e2e' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, name: 'e2e lookup' }),
  });
  const { token } = (await conn.json()) as { token: string };
  const found = await fetch(`${API}/api/ext/jobs/lookup?url=${encodeURIComponent(`${site}/jobs/${run}/sre`)}`, { headers: { Authorization: `Bearer ${token}` } });
  const { job: saved } = (await found.json()) as { job: { id: number } };
  await fetch(`${API}/api/ext/tokens/current`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });

  // A dashboard page on the signed-in Wera server (the API serves no HTML,
  // so the test serves one at its address): the bridge runs there.
  const careers = `${site}/careers/fixture-robotics/sre-${run}`;
  await context.route(`${API}/e2e-dashboard`, (route) =>
    route.fulfill({ contentType: 'text/html', body: `<!doctype html><title>Wera</title><a id="go" href="${careers}" target="_blank" rel="noreferrer">Apply on Fixture Robotics' site</a>` }));
  const dash = await context.newPage();
  await dash.goto(`${API}/e2e-dashboard`);
  await expect.poll(() => dash.evaluate(() => document.documentElement.dataset.weraExtension ?? '')).not.toBe('');

  // "Apply on Fixture Robotics' site", where the careers page has an address Wera never saw.
  await dash.evaluate(([id, url]) => window.postMessage({ source: 'wera-dashboard', type: 'open-job', jobId: id, url }, location.origin), [saved.id, careers] as const);
  const [tab] = await Promise.all([context.waitForEvent('page'), dash.click('#go')]);
  await tab.waitForLoadState();
  await tab.bringToFront();
  const panel = await openPanel();
  await expect(panel.getByText(/opened from your dashboard/)).toBeVisible();
  await expect(panel.getByText('In your Wera lists')).toBeVisible();
  await shot(panel, 'from-dashboard');
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
