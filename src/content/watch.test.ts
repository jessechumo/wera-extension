import { describe, expect, it, vi } from 'vitest';
import { formSignature, looksSubmitted, submittedAddress, watchPage } from './watch';

describe('looksSubmitted', () => {
  it.each([
    ['Thank you for applying to Acme!', true],
    ['Your application has been submitted.', true],
    ["We've received your application and will be in touch.", true],
    ['Apply for this job', false],
    ['Thank you for your interest. Apply below.', false],
  ])('%s', (text, want) => expect(looksSubmitted(text)).toBe(want));
});

describe('submittedAddress', () => {
  it.each([
    ['https://job-boards.greenhouse.io/acme/jobs/1/confirmation', true],
    ['https://jobs.lever.co/acme/2f1c3b0e/thanks', true],
    ['https://acme.com/careers/thank-you?job=1', true],
    ['https://acme.com/application-submitted', true],
    ['https://acme.com/careers/sre/apply', false],
    ['https://acme.com/blog/success-stories', false],
  ])('%s', (url, want) => expect(submittedAddress(url)).toBe(want));
});

describe('watchPage', () => {
  it('reports a new form step and a confirmation once', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<form><label>First name <input name="first_name"></label><label>Last name <input name="last_name"></label><label>Email <input type="email" name="email"></label></form>`;
    const events: unknown[] = [];
    const stop = watchPage(document, (e) => events.push(e), 100);
    expect(formSignature(document).count).toBe(3);

    // Step 2 replaces the form.
    document.body.innerHTML = `<form><label>Phone <input type="tel" name="phone"></label><label>LinkedIn <input name="linkedin"></label></form>`;
    await vi.advanceTimersByTimeAsync(150);
    expect(events).toEqual([{ type: 'wera:form-changed', fields: 2 }]);

    document.body.innerHTML = `<h1>Thank you for applying!</h1>`;
    await vi.advanceTimersByTimeAsync(150);
    document.body.innerHTML = `<h1>Thank you for applying! See you.</h1>`;
    await vi.advanceTimersByTimeAsync(150);
    expect(events.filter((e) => (e as { type: string }).type === 'wera:submitted')).toHaveLength(1);
    stop();
    vi.useRealTimers();
  });

  it('reports when a single-page site moves to another page', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<main>Job 1</main>';
    const events: unknown[] = [];
    const stop = watchPage(document, (e) => events.push(e), 100);
    history.pushState({}, '', '/jobs/2');
    document.body.innerHTML = '<main>Job 2</main>';
    await vi.advanceTimersByTimeAsync(150);
    expect(events).toEqual([{ type: 'wera:navigated', url: expect.stringMatching(/\/jobs\/2$/) }]);
    stop();
    history.replaceState({}, '', '/');
    vi.useRealTimers();
  });
});
