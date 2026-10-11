import { describe, expect, it, vi } from 'vitest';
import { formSignature, looksSubmitted, watchPage } from './watch';

describe('looksSubmitted', () => {
  it.each([
    ['Thank you for applying to Acme!', true],
    ['Your application has been submitted.', true],
    ["We've received your application and will be in touch.", true],
    ['Apply for this job', false],
    ['Thank you for your interest. Apply below.', false],
  ])('%s', (text, want) => expect(looksSubmitted(text)).toBe(want));
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
});
