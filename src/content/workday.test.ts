import { beforeEach, describe, expect, it } from 'vitest';
import type { Profile } from '../shared/types';
import { WORKDAY, wireWorkday } from './__fixtures__/workday';
import { addEntries, applyItems, planForm } from './plan';

const profile: Profile = {
  first_name: 'Jesse', last_name: 'Chumo', preferred_name: '', email: 'jesse@example.com', phone: '469 555 0101', address: '',
  city: 'Dallas', state: 'TX', postal_code: '', country: 'United States', linkedin: '', github: '', portfolio: '',
  current_company: 'Globex', current_title: 'Data Scientist', years_experience: '4', school: 'University of Texas at Dallas', degree: 'Master of Science',
  major: 'Business Analytics', graduation_year: '2024', gpa: '', authorized_to_work: 'yes', needs_sponsorship: 'yes', willing_to_relocate: '',
  salary_expectation: '', start_date: '', how_heard: 'Company website', gender: 'Male', pronouns: '', race: '', hispanic: '', veteran: '', disability: '',
  experience: [
    { title: 'Data Scientist', company: 'Globex', start: '2024-06', current: true, description: 'Built models' },
    { title: 'Data Analyst', company: 'Acme', start: '2020-06', end: '2022-07', current: false, description: 'Dashboards' },
  ],
  education: [{ school: 'University of Texas at Dallas', degree: 'Master of Science', level: 'master', major: 'Business Analytics', end: '2024-05' }],
  skills: [],
};

const $ = <T extends HTMLElement = HTMLInputElement>(sel: string) => document.querySelector<T>(sel)!;
const pill = (id: string) => $(`#${id}`).closest('[data-uxi-widget-type="multiselect"]')!.querySelector('[data-automation-id="selectedItem"]')?.textContent;

describe('a Workday application', () => {
  beforeEach(() => {
    document.body.innerHTML = WORKDAY;
    wireWorkday(document);
  });

  it('adds blocks for the resume\'s jobs, then fills every field it has an answer for', async () => {
    const first = planForm(document, profile);
    expect(first.adders).toEqual([{ section: 'experience', missing: 2 }]);
    expect(await addEntries(document, 'experience', 2, 5)).toBe(2);

    const { fields } = planForm(document, profile);
    const items = fields.filter((f) => f.value && f.group !== 'consent').map((f) => ({ id: f.id, value: f.value }));
    const out = await applyItems(document, items);
    expect(out.filter((r) => r.status !== 'filled').map((r) => `${r.label}: ${r.note}`)).toEqual([]);

    expect($('#country').textContent).toBe('United States of America');
    expect(pill('source')).toBe('Company Website');
    expect($('#fn').value).toBe('Jesse');
    expect($('#city').value).toBe('Dallas');
    expect($('#state').textContent).toBe('Texas');
    expect($('#phoneType').textContent).toBe('Mobile');
    expect(pill('phoneCode')).toBe('United States of America (+1)');
    expect($('#ph').value).toBe('469 555 0101');
    expect($('#jt-1').value).toBe('Data Scientist');
    expect($('#jt-2').value).toBe('Data Analyst');
    expect($('#cw-1').checked).toBe(true);
    const months = [...document.querySelectorAll<HTMLInputElement>('[data-automation-id="dateSectionMonth-input"]')].map((i) => i.value);
    const years = [...document.querySelectorAll<HTMLInputElement>('[data-automation-id="dateSectionYear-input"]')].map((i) => i.value);
    expect(months).toEqual(['06', '', '06', '07']);
    expect(years).toEqual(['2024', '', '2020', '2022']);
    expect(pill('school')).toBe('The University of Texas at Dallas');
    expect($('#degree').textContent).toBe("Master's Degree");
    expect($('#gender').textContent).toBe('Male');
    // Wera never presses Save and Continue for the user here.
    expect(document.querySelectorAll('[data-automation-widget="wd-popup"]')).toHaveLength(0);
  });
});
