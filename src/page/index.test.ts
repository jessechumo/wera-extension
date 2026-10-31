import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { careerAddress, findApply, isJobUrl, isNotJobSite, jobSummary, pageDocument, pageKind } from '../content/detect';
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

/** What Wera makes of a page at any address (jsdom's own document stays on one site). */
function kindAt(url: string, html: string) {
  return pageKind(new JSDOM(`<!doctype html><title>Page</title><body>${html}`, { url }).window.document);
}

// Sections a shop's page has too: "benefits", "requirements", "qualifying", "about the team".
const product = `<h1>Wireless Earbuds, Noise Cancelling</h1><span>Save 20%</span><button>Apply</button><a href="/cart">Apply now</a>
  <h2>Product benefits</h2><h2>System requirements</h2><p>Qualifications for free delivery</p><h2>About the team</h2><p>Compensation for late delivery</p>`;
const checkout = `<h1>Checkout</h1><form><label for="a">Full name</label><input id="a"><label for="m">Email</label><input id="m" type="email">
  <label for="p">Phone</label><input id="p" type="tel"><label for="s">Street address</label><input id="s"><label for="c">City</label><input id="c">
  <label for="t">State</label><input id="t"><label for="z">ZIP code</label><input id="z"><label for="y">Country</label><input id="y">
  <label for="o">Promo code</label><input id="o"><button type="button">Apply</button></form>`;

let stops: (() => void)[] = [];
const run = (doc: Document, delay: number) => stops.push(watchForJobs(doc, delay));

afterEach(() => {
  stops.forEach((s) => s());
  stops = [];
  at('/');
  delete window.__weraPage;
  vi.unstubAllGlobals();
});

describe('an application that starts with the email alone', () => {
  const form = '<label for="e">Email Address</label><input id="e" type="email"><label><input type="checkbox"> I agree with the terms and conditions</label><button>Next</button>';
  const at = (url: string) => new JSDOM(`<!doctype html>${form}`, { url }).window.document;

  it('is an application on a system that says so in its address', () => {
    expect(pageKind(at('https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/job/210597507/apply/email'))).toBe('form');
    expect(pageKind(at('https://careers-acme.icims.com/jobs/7968/qa-engineer/login?in_iframe=1'))).toBe('form');
  });

  it('is not a job alert or a newsletter', () => {
    expect(pageKind(at('https://careers.acme.com/job-alerts'))).toBeNull();
    expect(pageKind(at('https://www.acme.com/apply/newsletter'))).toBeNull();
  });
});

describe('a page shown in a frame of its own (iCIMS)', () => {
  /** The empty page around iCIMS's frame, with what the frame shows. */
  function wrapped(inner: string) {
    const dom = new JSDOM('<!doctype html><iframe id="icims_content_iframe"></iframe>', { url: 'https://careers-acme.icims.com/jobs/7946/analyst/job?mobile=false' });
    const frame = dom.window.document.querySelector('iframe')!;
    frame.contentDocument!.body.innerHTML = inner;
    return dom.window.document;
  }

  it('is read through the frame', () => {
    const doc = wrapped(posting);
    expect(pageKind(doc)).toBe('posting');
    expect(jobSummary(pageDocument(doc)).title).toBe('SRE');
  });

  it('finds an Apply button that says it twice for screen readers', () => {
    const doc = wrapped(`${posting}<a href="?mode=apply"><span>Apply</span><span>Apply</span></a>`);
    expect(findApply(pageDocument(doc))?.getAttribute('href')).toBe('?mode=apply');
  });

  it('is left alone when the frame is empty', () => {
    expect(pageKind(wrapped(''))).toBeNull();
  });
});

describe('Apply buttons in other languages', () => {
  it('are found on a job page', () => {
    for (const says of ['Auf diese Stelle bewerben', 'Jetzt bewerben', 'Postuler', 'Solicitar', 'Candidatar-se', 'Solliciteer nu']) {
      const { document } = new JSDOM(`<a href="#">${says}</a>`).window;
      expect(findApply(document)?.textContent).toBe(says);
    }
  });
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
    // The same who-you-are fields with something an application asks, on an application's address: an application.
    at('/apply');
    document.body.innerHTML += '<label for="li">LinkedIn profile</label><input id="li">';
    expect(pageKind(document)).toBe('form');
  });

  it('stays off a shop: a coupon\'s Apply button and a product\'s "benefits" and "requirements" are not a job', () => {
    // A tracking token holds "job" and "position": letters, not a careers address.
    expect(kindAt('https://www.amazon.com/dp/B0D1XD1ZV3?ref=position_1_job&pd_rd=role', product)).toBeNull();
    expect(kindAt('https://www.amazon.com/gp/buy/spc/handlers/display.html?ref=job', checkout)).toBeNull();
    expect(kindAt('https://shop.example.com/checkout', checkout)).toBeNull();
    expect(kindAt('https://www.bestbuy.com/cart', `<h1>Your cart</h1><input aria-label="Promo"><button>Apply</button><p>Member benefits</p><p>Requirements</p><p>Qualifications</p>`)).toBeNull();
  });

  it('stays off forms that ask who you are for anything else: a bank, a clinic, a demo on a vendor\'s site, a job alert', () => {
    const card = `<h1>Apply for the card</h1><form><label for="a">First name</label><input id="a"><label for="b">Last name</label><input id="b">
      <label for="m">Email</label><input id="m" type="email"><label for="s">Street address</label><input id="s"><label for="i">Annual income</label><input id="i"><button>Apply now</button></form>`;
    expect(kindAt('https://www.chase.com/apply/credit-card', card)).toBeNull();
    const patient = `<h1>New patient</h1><form><label for="a">First name</label><input id="a"><label for="m">Email</label><input id="m" type="email">
      <label for="g">Gender</label><select id="g"><option>Woman</option></select><label for="r">Race</label><select id="r"><option>Asian</option></select>
      <label for="h">Are you Hispanic or Latino?</label><select id="h"><option>No</option></select></form>`;
    expect(kindAt('https://portal.clinic.example/register', patient)).toBeNull();
    const demo = `<h1>Book a demo</h1><form><label for="a">First name</label><input id="a"><label for="m">Work email</label><input id="m" type="email">
      <label for="c">Company</label><input id="c"><label for="t">Job title</label><input id="t"><label for="n">Phone</label><input id="n"></form>`;
    for (const url of ['https://www.greenhouse.io/demo', 'https://www.lever.co/demo/', 'https://www.ashbyhq.com/contact', 'https://www.workable.com/get-a-demo', 'https://www.workday.com/en-us/forms/demo.html']) {
      expect(kindAt(url, demo), url).toBeNull();
    }
    const alerts = `<h1>Job alerts</h1><form><label for="a">First name</label><input id="a"><label for="m">Email</label><input id="m" type="email"><label for="c">City</label><input id="c"></form>`;
    expect(kindAt('https://careers.acme.com/alerts', alerts)).toBeNull();
  });

  it('knows an application by its resume upload, anywhere', () => {
    const form = `<form><label for="a">Full name</label><input id="a"><label for="m">Email</label><input id="m" type="email"><label for="r">Resume</label><input id="r" type="file"></form>`;
    expect(kindAt('https://www.acme.com/about/team', form)).toBe('form');
    // "Attach a file" on a contact form is not a resume.
    expect(kindAt('https://www.acme.com/contact', form.replace('Resume', 'Attach a file'))).toBeNull();
  });

  it('knows a later step of an application, which need not ask who you are', () => {
    const eeo = `<h1>Voluntary disclosures</h1><form><label for="g">Gender</label><select id="g"><option>Woman</option></select><label for="r">Race</label><select id="r"><option>Asian</option></select>
      <label for="v">Veteran status</label><select id="v"><option>No</option></select><label for="d">Disability status</label><select id="d"><option>No</option></select></form>`;
    expect(kindAt('https://acme.wd5.myworkdayjobs.com/en-US/Careers/job/SRE_R1/apply/step', eeo)).toBe('form');
    expect(kindAt('https://careers.acme.com/application/step-4', eeo)).toBe('form');
    const questions = `<form><label for="s">Will you require visa sponsorship?</label><select id="s"><option>No</option></select>
      <label for="w">Are you authorized to work in the US?</label><select id="w"><option>Yes</option></select></form>`;
    expect(kindAt('https://apply.acme.com/x', questions)).toBe('form');
  });

  it('takes no address alone for a job: a page gone from a job board shows nothing', () => {
    expect(kindAt('https://jobs.lever.co/acme/2f1c3b0e-4b8f-4c55-9a7e-5c0d1e2f3a4b', '<h1>Not found</h1><p>404 error</p>')).toBeNull();
    expect(kindAt('https://jobs.lever.co/acme/2f1c3b0e-4b8f-4c55-9a7e-5c0d1e2f3a4b', '<h1>Senior Engineer</h1>')).toBe('posting');
  });

  it('takes no job board named in another page\'s address for that board', () => {
    expect(isJobUrl('https://www.google.com/url?q=https://boards.greenhouse.io/acme/jobs/123')).toBe(false);
    expect(isJobUrl('https://www.bing.com/search?q=jobs.lever.co/acme/2f1c3b0e-4b8f-4c55-9a7e-5c0d1e2f3a4b')).toBe(false);
  });

  it('stays off a frame inside mail or chat, whatever its own address says', () => {
    const dom = new JSDOM(`<!doctype html><body>${fixture('greenhouse.html')}`, { url: 'https://boards.greenhouse.io/acme/jobs/123' });
    expect(pageKind(dom.window.document)).toBe('form');
    Object.defineProperty(dom.window.document.location, 'ancestorOrigins', { value: ['https://mail.google.com'] });
    expect(pageKind(dom.window.document)).toBeNull();
  });

  it('reads a posting without job data by what is on it', () => {
    at('/careers/icu-nurse-4411');
    document.body.innerHTML = plain;
    expect(pageKind(document)).toBe('posting');
    // The same words in a blog post, without an Apply button or a job address, are not a posting.
    at('/blog/what-nurses-do');
    document.body.innerHTML = '<h1>What ICU nurses do</h1><p>Responsibilities and qualifications vary.</p>';
    expect(pageKind(document)).toBeNull();
    // Nor is an article that happens to link to an application.
    document.body.innerHTML = plain;
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
      'https://www.indeed.com/viewjob?jk=abc', 'https://apply.workable.com/acme/j/1A2B3C4D5E/', 'https://smartapply.indeed.com/beta/indeedapply/form/resume',
      'https://acme.icims.com/jobs/1234/sre/job', 'https://jobs.dayforcehcm.com/en-US/acme/CANDIDATEPORTAL/jobs/1234', 'https://acme.bamboohr.com/careers/42',
      'https://recruiting.paylocity.com/Recruiting/Jobs/Details/123', 'https://careers.acme.com/hcmUI/CandidateExperience/en/sites/CX/job/1234/',
      'https://www.metacareers.com/jobs/123456', 'https://acme.com/careers/sre?gh_jid=123',
    ]) expect(isJobUrl(url), url).toBe(true);
    expect(isJobUrl('https://www.linkedin.com/feed/')).toBe(false);
  });

  it('reads careers in an address as whole words, not letters in a token', () => {
    for (const url of ['https://acme.com/careers/sre', 'https://jobs.acme.com/x', 'https://acme.com/open-roles/12', 'https://acme.com/en/jobs.html', 'https://acme.com/work-with-us']) {
      expect(careerAddress(url), url).toBe(true);
    }
    for (const url of ['https://acme.com/controller', 'https://acme.com/dp/X?ref=careers', 'https://acme.com/blog/jobless-recovery', 'https://acme.com/s?k=job', 'https://acme.com/apply/card', 'https://careers.acme.com/alerts']) {
      expect(careerAddress(url), url).toBe(false);
    }
  });

  it('knows the first step of an application on a careers address, which may ask only who you are', () => {
    const step = `<form><label for="a">First name</label><input id="a"><label for="b">Last name</label><input id="b"><label for="m">Email</label><input id="m" type="email"></form>`;
    expect(kindAt('https://acme.com/careers/sre/apply', step)).toBe('form');
    expect(kindAt('https://acme.com/join-us', step)).toBe('form');
    expect(kindAt('https://acme.com/apply', step)).toBeNull();
    expect(kindAt('https://acme.com/get-started', step)).toBeNull();
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

  it('tells the panel when an Apply button renders after the page (Ashby)', async () => {
    fakeChrome();
    document.body.innerHTML = posting;
    run(document, 5);
    await vi.waitFor(() => expect(window.__weraPage?.kind).toBe('posting'));
    expect(window.__weraPage?.canApply).toBe(false);
    const seen = vi.fn();
    window.__weraPage!.subscribe(seen);
    document.body.insertAdjacentHTML('beforeend', '<a href="/apply">Apply for this Job</a>');
    await vi.waitFor(() => expect(window.__weraPage?.canApply).toBe(true));
    expect(seen).toHaveBeenCalled();
  });

  it('stays away on a site the user turned Wera off on', async () => {
    const sent = fakeChrome({ state: 'off' }, { 'wera.hiddenSites': { [location.hostname]: 1 } });
    document.body.innerHTML = posting;
    run(document, 5);
    await new Promise((r) => setTimeout(r, 40));
    expect(sent.some((m) => m.type === 'wera:panel-ensure')).toBe(false);
  });

  it('looks less and less often at a page with no job on it, and at once when it moves on', async () => {
    fakeChrome();
    const sees = vi.spyOn(document, 'querySelectorAll');
    document.body.innerHTML = '<h1>A shop</h1>';
    run(document, 2);
    const churn = async (ms: number) => {
      for (const end = Date.now() + ms; Date.now() < end;) {
        document.body.append(document.createElement('i'));
        await new Promise((r) => setTimeout(r, 1));
      }
    };
    await churn(60);
    const early = sees.mock.calls.length;
    await churn(120);
    const later = sees.mock.calls.length - early;
    // Twice the time, fewer looks.
    expect(later).toBeLessThan(early);
    at('/jobs/2');
    document.body.innerHTML = posting;
    await vi.waitFor(() => expect(window.__weraPage?.kind).toBe('posting'), { timeout: 200 });
    sees.mockRestore();
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
    at('/careers/apply');
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

  it('remembers the answers the user gave when they submit the form themselves', async () => {
    const sent = fakeChrome();
    at('/careers/apply');
    document.body.innerHTML = `<form><label for="fn">First name</label><input id="fn" value="Ada">
      <label for="em">Email</label><input id="em" type="email" value="ada@example.com">
      <label for="li">LinkedIn profile</label><input id="li" value="https://linkedin.com/in/ada">
      <label for="h">Which team interests you most?</label><select id="h"><option value="">Select</option><option selected>Data platform</option></select>
      <label for="w">What project are you proudest of, and why?</label><textarea id="w">The fleet scheduler I rebuilt: it cut idle time by a third.</textarea>
      <button type="button" id="send">Submit application</button></form>`;
    run(document, 5);
    await vi.waitFor(() => expect(sent.some((m) => m.type === 'wera:job-seen')).toBe(true));
    document.querySelector<HTMLButtonElement>('#send')!.click();
    await vi.waitFor(() => expect(sent.some((m) => m.type === 'wera:job-learn')).toBe(true));
    const learn = sent.find((m) => m.type === 'wera:job-learn') as unknown as { answers: { question: string; answer: string; kind: string }[] };
    expect(learn.answers).toEqual(expect.arrayContaining([
      expect.objectContaining({ question: 'Which team interests you most?', answer: 'Data platform', kind: 'choice' }),
      expect.objectContaining({ question: 'What project are you proudest of, and why?', kind: 'long' }),
    ]));
    // Details go to the application details, not the answers.
    expect(learn.answers.some((a) => /name|email|linkedin/i.test(a.question))).toBe(false);
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
