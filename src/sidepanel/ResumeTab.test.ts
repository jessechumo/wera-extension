import { describe, expect, it } from 'vitest';
import { resumeText } from './ResumeTab';

describe('resumeText', () => {
  it('renders a tailored resume as plain text', () => {
    const text = resumeText({
      headline: 'Site Reliability Engineer', summary: 'Keeps systems up.', skills: [{ group: 'Infra', items: ['Go', 'Kubernetes'] }],
      experience: [{ title: 'SRE Intern', company: 'Acme', dates: '2024', bullets: ['Cut deploy time by 40%'] }],
      projects: [], education: ['B.S. Computer Science, UT Austin'], changes: [], missing_keywords: [], dropped: [],
    }, 'Ada Lovelace');
    expect(text).toBe(
      'Ada Lovelace\nSite Reliability Engineer\n\nKeeps systems up.\n\nSKILLS\nInfra: Go, Kubernetes\n\nEXPERIENCE\nSRE Intern, Acme (2024)\n- Cut deploy time by 40%\n\nEDUCATION\nB.S. Computer Science, UT Austin',
    );
  });
});
