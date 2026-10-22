import { beforeEach, describe, expect, it } from 'vitest';
import type { Profile } from '../shared/types';
import { WORKDAY, WORKDAY_ACCOUNT, WORKDAY_NEW, wireWorkday, wireWorkdayNew } from './__fixtures__/workday';
import { findNext } from './next';
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

  it('adds blocks for the resume\'s jobs, then fills every field it has an answer for', { timeout: 20_000 }, async () => {
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

describe('a newer Workday application', () => {
  beforeEach(() => {
    document.body.innerHTML = WORKDAY_NEW;
    wireWorkdayNew(document);
  });

  it('reads fields by their Workday names, and knows the step and the way forward', () => {
    const plan = planForm(document, { ...profile, skills: ['Python', 'SQL', 'Rust'] });
    const by = (label: string) => plan.fields.find((f) => f.label.startsWith(label))!;
    expect(by('First Name').purpose).toBe('first_name');
    expect(by('Last Name').value).toBe('Chumo');
    expect(by('How Did You Hear').purpose).toBe('how_heard');
    expect(by('Type to Add Skills')).toMatchObject({ purpose: 'skills', value: 'Python, SQL, Rust' });
    expect(by('Have you previously worked').kind).toBe('buttons');
    expect(by('Have you previously worked').options).toEqual(['Yes', 'No']);
    expect(plan.fields.filter((f) => f.purpose === 'today')).toHaveLength(3);
    expect(plan.site).toBe('Workday');
    expect(plan.step).toEqual({ name: 'My Experience', index: 2, total: 4 });
    expect(findNext(document)?.label).toBe('Save and Continue');
  });

  it('picks from a menu of categories, adds skills one by one, dates today, and answers a drawn radio group', { timeout: 20_000 }, async () => {
    const plan = planForm(document, profile);
    const id = (label: string) => plan.fields.find((f) => f.label.startsWith(label))!.id;
    const today = new Date();
    const out = await applyItems(document, [
      { id: id('How Did You Hear'), value: 'Social Media > LinkedIn' },
      { id: id('Type to Add Skills'), value: 'Python, SQL, Rust' },
      { id: id('Have you previously worked'), value: 'No' },
      ...plan.fields.filter((f) => f.purpose === 'today').map((f) => ({ id: f.id, value: f.value })),
    ]);
    expect(out.map((r) => `${r.status} ${r.value ?? r.note}`)).toEqual(['filled LinkedIn', 'filled Python, SQL', 'filled No', expect.stringMatching(/^filled/), expect.stringMatching(/^filled/), expect.stringMatching(/^filled/)]);
    const pills = (sel: string) => [...document.querySelector(sel)!.closest('[data-uxi-widget-type]')!.querySelectorAll('[data-automation-id="selectedItem"]')].map((p) => p.textContent);
    expect(pills('#source--source')).toEqual(['LinkedIn']);
    // Rust is not a choice on this form: left out, the rest picked.
    expect(pills('#skills--skills')).toEqual(['Python', 'SQL']);
    expect(document.querySelector('[role="radio"][aria-checked="true"]')?.textContent).toBe('No');
    const parts = [...document.querySelectorAll<HTMLInputElement>('[data-automation-id^="dateSection"]')].map((i) => i.value);
    expect(parts).toEqual([String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0'), String(today.getFullYear())]);
  });

  it('finds a source by searching it too', { timeout: 20_000 }, async () => {
    const plan = planForm(document, profile);
    const f = plan.fields.find((x) => x.purpose === 'how_heard')!;
    const [r] = await applyItems(document, [{ id: f.id, value: 'LinkedIn' }]);
    expect(r).toMatchObject({ status: 'filled', value: 'LinkedIn' });
  });
});

describe('a Workday account page', () => {
  it('says what to do first, and fills only the email', () => {
    document.body.innerHTML = WORKDAY_ACCOUNT;
    const plan = planForm(document, profile);
    expect(plan.gate).toMatch(/Create one here/);
    expect(plan.fields.map((f) => [f.purpose, f.value])).toEqual([['email', 'jesse@example.com']]);
  });
});
