import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isJobUrl, isNotJobSite, jobSummary, pageKind } from '../content/detect';
import type { SubmitReply } from '../shared/jobs';
import { watchForJobs } from './index';

const fixture = (name: string) => readFileSync(join(__dirname, '..', 'content', '__fixtures__', name), 'utf8');
const posting = `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'JobPosting', title: 'SRE', hiringOrganization: { name: 'Acme' }, description: 'Run things.' })}</script><h1>SRE</h1>`;
// A company's own careers page: no job data, but it reads like a posting.
const plain = `<h1>Senior Registered Nurse, ICU</h1><a href="/apply">Apply now</a>
  <h2>About the role</h2><p>Care for patients.</p><h2>Responsibilities</h2><ul><li>Rounds</li></ul>
  <h2>Qualifications</h2><p>3+ years of experience</p><h2>Benefits</h2><p>Good ones.</p>`;

function at(url: string) {
  window.history.replaceState(null, '', url);
}

let stops: (() => void)[] = [];
const run = (doc: Document, delay: number) => stops.push(watchForJobs(doc, delay));

afterEach(() => {
  stops.forEach((s) => s());
  stops = [];
  at('/');
  delete window.__weraPage;
  vi.unstubAllGlobals();
});

describe('telling job pages from other pages', () => {
  it('knows application forms, postings with job data, and everything else', () => {
    document.body.innerHTML = fixture('greenhouse.html');
    expect(pageKind(document)).toBe('form');
    document.body.innerHTML = posting;
    expect(pageKind(document)).toBe('posting');
    document.body.innerHTML = '<form><label>Search <input name="q"></label><label>Email <input type="email"></label></form>';
    expect(pageKind(document)).toBeNull();
  });

  it('does not take a contact, demo-request or checkout form for an application', () => {
    at('/contact');
    document.body.innerHTML = `<h1>Contact us</h1><form><label for="a">First name</label><input id="a"><label for="b">Last name</label><input id="b">
      <label for="c">Email</label><input id="c" type="email"><label for="d">Phone</label><input id="d" type="tel"><label for="e">Message</label><textarea id="e"></textarea></form>`;
    expect(pageKind(document)).toBeNull();
    at('/demo');
    document.body.innerHTML = `<h1>Book a demo</h1><form><label for="a">Full name</label><input id="a"><label for="c">Work email</label><input id="c" type="email">
      <label for="d">Company</label><input id="d"><label for="t">Job title</label><input id="t"><label for="h">How did you hear about us?</label><input id="h"></form>`;
    expect(pageKind(document)).toBeNull();
    at('/checkout');
    document.body.innerHTML = `<h1>Checkout</h1><form><label for="a">First name</label><input id="a"><label for="b">Last name</label><input id="b">
      <label for="c">Email</label><input id="c" type="email"><label for="s">Street address</label><input id="s"><label for="z">ZIP code</label><input id="z"></form>`;
    expect(pageKind(document)).toBeNull();
    // The same who-you-are fields with something only an application asks: an application.
    at('/apply');
    document.body.innerHTML += '<label for="li">LinkedIn profile</label><input id="li">';
    expect(pageKind(document)).toBe('form');
  });

  it('reads a posting without job data by what is on it', () => {
    at('/careers/icu-nurse-4411');
    document.body.innerHTML = plain;
    expect(pageKind(document)).toBe('posting');
    // The same words in a blog post, without an Apply button or a job address, are not a posting.
    at('/blog/what-nurses-do');
    document.body.innerHTML = '<h1>What ICU nurses do</h1><p>Responsibilities and qualifications vary.</p>';
    expect(pageKind(document)).toBeNull();
    // A job described in full but with no way to apply (a recruiter's message, a newsletter) is not a posting.
    at('/careers/icu-nurse-4411');
    document.body.innerHTML = plain.replace('<a href="/apply">Apply now</a>', '');
    expect(pageKind(document)).toBeNull();
  });

  it('stays off mail, chat, documents and feeds, where job emails and "thank you for applying" are common', () => {
    for (const url of [
      'https://mail.google.com/mail/u/0/#inbox', 'https://outlook.office.com/mail/', 'https://outlook.live.com/mail/0/', 'https://mail.yahoo.com/d/folders/1',
      'https://docs.google.com/document/d/1/edit', 'https://app.slack.com/client/T1', 'https://discord.com/channels/1/2', 'https://www.linkedin.com/feed/',
      'https://www.linkedin.com/messaging/thread/1/', 'https://chatgpt.com/c/1', 'https://www.youtube.com/watch?v=1',
    ]) expect(isNotJobSite(url), url).toBe(true);
    for (const url of [
      'https://discord.com/careers', 'https://www.linkedin.com/jobs/view/4012345678/', 'https://job-boards.greenhouse.io/discord/jobs/1',
      'https://careers.google.com/jobs/results/1', 'https://acme.com/careers/sre',
    ]) expect(isNotJobSite(url), url).toBe(false);
  });

  it('knows the addresses of job boards', () => {
    for (const url of [
      'https://boards.greenhouse.io/acme/jobs/123', 'https://jobs.lever.co/acme/2f1c3b0e-4b8f-4c55-9a7e-5c0d1e2f3a4b',
      'https://acme.wd5.myworkdayjobs.com/en-US/Careers/job/Austin-TX/SRE_R123', 'https://www.linkedin.com/jobs/view/4012345678/',
      'https://www.indeed.com/viewjob?jk=abc', 'https://apply.workable.com/acme/j/1A2B3C4D5E/',
    ]) expect(isJobUrl(url), url).toBe(true);
    expect(isJobUrl('https://www.linkedin.com/feed/')).toBe(false);
  });

  it('names the job and company', () => {
    document.body.innerHTML = posting;
    expect(jobSummary(document)).toEqual({ title: 'SRE', company: 'Acme' });
  });

  it('stays off the Wera dashboard (its own forms are not applications)', () => {
    document.body.innerHTML = fixture('greenhouse.html');
    document.documentElement.dataset.weraExtension = '0.3.0';
    expect(pageKind(document)).toBeNull();
    delete document.documentElement.dataset.weraExtension;
  });
});

describe('on a page', () => {
  function fakeChrome(submit: SubmitReply = { state: 'off' }, storage: Record<string, unknown> = {}) {
    const sent: { type: string }[] = [];
    vi.stubGlobal('chrome', {
      runtime: {
        id: 'x',
        sendMessage: vi.fn(async (m: { type: string }) => {
          sent.push(m);
          return m.type === 'wera:job-submitted' ? submit : null;
        }),
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      storage: { local: { get: vi.fn(async () => storage) } },
    });
    return sent;
  }

  it('asks for the Wera panel on an application, and says what the page is', async () => {
    const sent = fakeChrome();
    document.body.innerHTML = fixture('greenhouse.html');
    run(document, 5);
    await vi.waitFor(() => expect(sent.some((m) => m.type === 'wera:panel-ensure')).toBe(true));
    expect(sent.find((m) => m.type === 'wera:job-seen')).toMatchObject({ kind: 'form' });
    expect(window.__weraPage?.kind).toBe('form');
    // Once per page, however much the page changes.
    document.body.append(document.createElement('div'));
    await new Promise((r) => setTimeout(r, 40));
    expect(sent.filter((m) => m.type === 'wera:panel-ensure')).toHaveLength(1);
  });

  it('tells the panel when a single-page job board moves to another job', async () => {
    fakeChrome();
    document.body.innerHTML = posting;
    run(document, 5);
    await vi.waitFor(() => expect(window.__weraPage?.kind).toBe('posting'));
    const seen = vi.fn();
    window.__weraPage!.subscribe(seen);
    at('/jobs/2');
    document.body.innerHTML = fixture('greenhouse.html');
    await vi.waitFor(() => expect(seen).toHaveBeenCalledWith(expect.objectContaining({ kind: 'form' })));
  });

  it('stays away when turned off, and on the Wera server', async () => {
    let sent = fakeChrome({ state: 'off' }, { 'wera.settings': { launcher: false } });
    document.body.innerHTML = posting;
    run(document, 5);
    await new Promise((r) => setTimeout(r, 40));
    expect(sent.some((m) => m.type === 'wera:panel-ensure')).toBe(false);
    stops.forEach((s) => s());
    stops = [];
    sent = fakeChrome({ state: 'off' }, { 'wera.session': { server: location.origin } });
    run(document, 5);
    await new Promise((r) => setTimeout(r, 40));
    expect(sent.some((m) => m.type === 'wera:panel-ensure')).toBe(false);
  });

  it('keeps what the user answered (self-identification too) when they move the application on', async () => {
    const sent = fakeChrome();
    document.body.innerHTML = `<form><label for="fn">First name</label><input id="fn" value="Ada">
      <label for="em">Email</label><input id="em" type="email" value="ada@example.com">
      <label for="ph">Phone</label><input id="ph" value="512 555 0142">
      <label for="g">Gender</label><select id="g"><option value="">Select</option><option selected>Woman</option></select>
      <label for="w">Why us?</label><textarea id="w">Robots.</textarea>
      <button type="button" id="next">Save and Continue</button></form>`;
    run(document, 5);
    await vi.waitFor(() => expect(sent.some((m) => m.type === 'wera:job-seen')).toBe(true));
    document.querySelector<HTMLButtonElement>('#next')!.click();
    await vi.waitFor(() => expect(sent.some((m) => m.type === 'wera:job-learn')).toBe(true));
    const learn = sent.find((m) => m.type === 'wera:job-learn') as unknown as { entries: { purpose: string; value: string }[] };
    expect(learn.entries).toEqual(expect.arrayContaining([{ purpose: 'gender', value: 'Woman' }, { purpose: 'phone', value: '512 555 0142' }]));
    expect(learn.entries.some((e) => e.purpose === 'question')).toBe(false);
  });

  it('tells Wera when the form gives way to a thank-you message, and brings the panel to say so', async () => {
    const sent = fakeChrome({ state: 'marked', job: { id: 4, title: 'SRE', company: 'Acme', status: 'applied' }, previous: 'saved' });
    document.body.innerHTML = fixture('greenhouse.html');
    run(document, 5);
    await vi.waitFor(() => expect(sent.some((m) => m.type === 'wera:job-seen')).toBe(true));
    document.body.innerHTML = '<h1>Thank you for applying!</h1><p>We will be in touch.</p>';
    await vi.waitFor(() => expect(window.__weraPage?.submitted?.state).toBe('marked'));
    expect(sent.filter((m) => m.type === 'wera:job-submitted')).toHaveLength(1);
    expect(sent.filter((m) => m.type === 'wera:panel-ensure').length).toBeGreaterThanOrEqual(2);
  });

  it('says when the user sends the application, so the tab can close once the site confirms', async () => {
    const sent = fakeChrome();
    document.body.innerHTML = fixture('greenhouse.html') + '<button type="button" id="send">Submit application</button><button type="button" id="next">Next</button>';
    run(document, 5);
    await vi.waitFor(() => expect(sent.some((m) => m.type === 'wera:job-seen')).toBe(true));
    document.querySelector<HTMLButtonElement>('#next')!.click();
    await new Promise((r) => setTimeout(r, 20));
    expect(sent.some((m) => m.type === 'wera:job-sending')).toBe(false);
    document.querySelector<HTMLButtonElement>('#send')!.click();
    await vi.waitFor(() => expect(sent.some((m) => m.type === 'wera:job-sending')).toBe(true));
  });

  it('goes quietly when the extension is reloaded under it', async () => {
    const sent = fakeChrome();
    document.body.innerHTML = posting;
    run(document, 5);
    await vi.waitFor(() => expect(window.__weraPage?.kind).toBe('posting'));
    const runtime = chrome.runtime as unknown as { id?: string; sendMessage: () => never };
    delete runtime.id;
    runtime.sendMessage = () => {
      throw new Error('Extension context invalidated.');
    };
    const before = sent.length;
    document.body.innerHTML = fixture('greenhouse.html');
    await new Promise((r) => setTimeout(r, 60));
    expect(sent.length).toBe(before);
    expect(window.__weraPage?.kind).toBe('posting');
  });
});
