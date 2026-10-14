import { describe, expect, it } from 'vitest';
import { formFrameOrigins } from './frames';

describe('formFrameOrigins', () => {
  it('finds embedded application forms on other sites, not videos, captchas or same-site frames', () => {
    document.body.innerHTML = `
      <iframe id="grnhse_iframe" src="https://job-boards.greenhouse.io/embed/job_app?for=acme&token=123"></iframe>
      <iframe src="https://careers.acme-partner.com/apply/123" width="800" height="900"></iframe>
      <iframe src="https://www.youtube.com/embed/abc" width="560" height="315"></iframe>
      <iframe src="https://www.google.com/recaptcha/api2/anchor" width="304" height="78"></iframe>
      <iframe src="https://jobs.lever.co/acme/1/apply" width="1" height="1"></iframe>
      <iframe src="/apply/123"></iframe>`;
    expect(formFrameOrigins(document)).toEqual(['https://job-boards.greenhouse.io', 'https://careers.acme-partner.com']);
  });
});
