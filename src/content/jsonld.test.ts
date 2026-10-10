import { describe, expect, it } from 'vitest';
import { readJobPosting } from './jsonld';
import { mainText } from './text';

const page = (ld: unknown) =>
  `<html><head><title>Job</title><script type="application/ld+json">${JSON.stringify(ld).replace(/<\//g, '<\\/')}</script></head><body><main><h1>Job</h1></main></body></html>`;

function load(html: string) {
  document.documentElement.innerHTML = new DOMParser().parseFromString(html, 'text/html').documentElement.innerHTML;
}

describe('readJobPosting', () => {
  it('reads a schema.org JobPosting (Lever/Greenhouse style)', () => {
    load(page({
      '@context': 'http://schema.org', '@type': 'JobPosting', title: 'Engineer, Data Platform',
      hiringOrganization: { '@type': 'Organization', name: 'Belvedere Trading' },
      jobLocation: [{ '@type': 'Place', address: { addressLocality: 'Chicago', addressRegion: 'Illinois', addressCountry: 'US' } }],
      employmentType: 'Full-Time', // as Lever writes it
      baseSalary: { '@type': 'MonetaryAmount', currency: 'USD', value: { minValue: 150000, maxValue: 200000, unitText: 'YEAR' } },
      description: '<p>Build <b>dashboards</b>.</p><ul><li>Python</li><li>SQL</li></ul><script>alert(1)</script>',
    }));
    const d = readJobPosting(document, 'https://jobs.lever.co/x/1')!;
    expect(d).toMatchObject({
      company: 'Belvedere Trading', title: 'Engineer, Data Platform', location: 'Chicago, Illinois, US',
      employment_type: 'full_time', salary: '$150,000 - 200,000 per year', source: 'page-data', url: 'https://jobs.lever.co/x/1',
    });
    expect(d.description).toBe('Build dashboards.\n\n- Python\n- SQL');
  });

  it('finds postings inside @graph and marks remote jobs', () => {
    load(page({
      '@graph': [
        { '@type': 'WebPage', name: 'x' },
        { '@type': ['JobPosting'], title: 'SRE', hiringOrganization: 'Acme', jobLocationType: 'TELECOMMUTE', description: 'Run things.' },
      ],
    }));
    expect(readJobPosting(document, 'u')).toMatchObject({ company: 'Acme', work_mode: 'remote', location: 'Remote' });
  });

  it('ignores pages without a posting and malformed blocks', () => {
    document.head.innerHTML = '<script type="application/ld+json">{not json</script><script type="application/ld+json">{"@type":"Organization"}</script>';
    expect(readJobPosting(document, 'u')).toBeNull();
  });
});

describe('mainText', () => {
  it('prefers the main region and drops navigation, forms and scripts', () => {
    document.body.innerHTML = `<nav>Home Jobs About</nav><main><h1>Site Reliability Engineer</h1><p>${'Keep things running. '.repeat(30)}</p>
      <form><label>Name<input></label></form><script>evil()</script></main><footer>Privacy</footer>`;
    const t = mainText(document);
    expect(t.startsWith('Site Reliability Engineer')).toBe(true);
    expect(t).not.toMatch(/Home Jobs|Privacy|evil|Name/);
  });
});
