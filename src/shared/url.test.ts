import { describe, expect, it } from 'vitest';
import { siteOf } from './url';

describe('siteOf', () => {
  it.each([
    ['job-boards.greenhouse.io', 'greenhouse.io'],
    ['boards.greenhouse.io', 'greenhouse.io'],
    ['acme.wd5.myworkdayjobs.com', 'myworkdayjobs.com'],
    ['careers.acme.co.uk', 'acme.co.uk'],
    ['acme.com:8443', 'acme.com'],
    ['localhost', 'localhost'],
  ])('%s', (host, site) => expect(siteOf(host)).toBe(site));
});
