import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Applicant } from '../shared/types';
import { classify } from './classify';
import { collectFields } from './fields';
import { fillForm, formatFor, matchOption, parseDate, searchText, valueFor } from './fill';

const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__', name), 'utf8');

const ada: Applicant = {
  first_name: 'Ada', last_name: 'Lovelace', preferred_name: '', email: 'ada@example.com', phone: '(512) 555-0142',
  address: '', city: 'Austin', state: 'TX', postal_code: '', country: 'United States', linkedin: 'https://linkedin.com/in/ada',
  github: 'https://github.com/ada', portfolio: '', current_company: 'Acme', current_title: 'SRE Intern', years_experience: '1',
  school: 'UT Austin', degree: 'B.S.', major: 'Computer Science', graduation_year: '2025', gpa: '', authorized_to_work: 'yes',
  needs_sponsorship: 'yes', willing_to_relocate: 'yes', salary_expectation: '', start_date: '', how_heard: 'Company website',
  gender: 'decline', pronouns: '', race: 'decline', hispanic: 'decline', veteran: 'decline', disability: 'decline',
};

const resume = { name: 'Ada_Lovelace_Resume.pdf', base64: btoa('%PDF-1.4 fake') };

describe('field labels and purposes', () => {
  beforeEach(() => {
    document.body.innerHTML = fixture('lever.html');
  });

  it('labels Lever-style fields from their wrappers and classifies them', () => {
    const got = collectFields(document).map((f) => [f.label.replace(/✱/g, '').trim(), f.kind, classify(f)]);
    expect(got).toEqual([
      ['Resume/CV', 'file', 'resume'],
      ['Full name', 'text', 'full_name'],
      ['Email', 'text', 'email'],
      ['Phone', 'text', 'phone'],
      ['Current company', 'text', 'current_company'],
      ['LinkedIn URL', 'text', 'linkedin'],
      ['GitHub URL', 'text', 'github'],
      ['Will you now or in the future require visa sponsorship to work in the US?', 'radio', 'needs_sponsorship'],
      ['Why do you want to work at Acme?', 'textarea', 'question'],
      ['Additional information', 'textarea', 'question'],
      ['Gender', 'select', 'gender'],
      ['Veteran status', 'select', 'veteran'],
      ['I agree to the privacy policy', 'checkbox', 'consent'],
    ]);
  });
});

describe('fillForm', () => {
  it('fills a Lever form without overwriting, ticking consent or submitting', async () => {
    document.body.innerHTML = fixture('lever.html');
    let submitted = false;
    document.querySelector('form')!.addEventListener('submit', () => (submitted = true));
    const out = await fillForm(document, ada, { resume });
    const by = (label: string) => out.find((r) => r.label.startsWith(label))!;

    const q = (sel: string) => document.querySelector<HTMLInputElement>(sel)!;
    expect(q('[name="name"]').value).toBe('Ada Lovelace');
    expect(q('[name="email"]').value).toBe('ada@example.com');
    expect(q('[name="urls[GitHub]"]').value).toBe('https://github.com/ada');
    expect(q('[name="org"]').value).toBe('Already Typed Inc');
    expect(by('Current company').status).toBe('already');
    expect(q('input[value="Yes"]').checked).toBe(true);
    expect(q('input[type=file]').files?.[0]?.name).toBe('Ada_Lovelace_Resume.pdf');
    expect(q('[name="eeo[gender]"]').value).toBe('Decline to self-identify');
    expect(document.querySelector<HTMLSelectElement>('[name="eeo[veteran]"]')!.selectedOptions[0]!.textContent).toBe("I don't wish to answer");
    expect(q('[name="consent"]').checked).toBe(false);
    expect(by('I agree').status).toBe('review');
    expect(by('Why do you want').status).toBe('question');
    expect(submitted).toBe(false);
    expect(q('[name="email"]').hasAttribute('data-wera-filled')).toBe(true);
  });

  it('fills a Greenhouse form: autocomplete hints, yes/no selects, states, radios', async () => {
    document.body.innerHTML = fixture('greenhouse.html');
    const out = await fillForm(document, ada, { resume });
    const val = (id: string) => (document.getElementById(id) as HTMLInputElement).value;
    expect(val('first_name')).toBe('Ada');
    expect(val('last_name')).toBe('Lovelace');
    expect(val('phone')).toBe('(512) 555-0142');
    expect(val('q1')).toBe('1'); // authorized: yes
    expect(val('q2')).toBe('0'); // authorized without sponsorship: no (needs sponsorship)
    expect(val('q4')).toBe('TX');
    expect(document.querySelector<HTMLInputElement>('input[name=hispanic][value=decline]')!.checked).toBe(true);
    // Salary is not in the details: left for the person.
    expect(val('q3')).toBe('');
    expect(out.find((r) => r.label.startsWith('What are your salary'))!.note).toMatch(/not in your application details/);
    // A hidden honeypot is never touched.
    expect(val('honeypot')).toBe('');
    expect(out.some((r) => r.label.includes('website_hp'))).toBe(false);
  });

  it('picks options in custom dropdowns', async () => {
    document.body.innerHTML = fixture('greenhouse.html');
    const input = document.getElementById('loc') as HTMLInputElement;
    input.addEventListener('input', () => {
      document.getElementById('loc-list')!.innerHTML =
        '<li role="option">Austin, Texas, United States</li><li role="option">Boston, Massachusetts</li>';
    });
    let picked = '';
    document.getElementById('loc-list')!.addEventListener('click', (e) => (picked = (e.target as HTMLElement).textContent ?? ''));
    const out = await fillForm(document, ada, {});
    expect(picked).toBe('Austin, Texas, United States');
    expect(out.find((r) => r.label.startsWith('Location'))!.status).toBe('filled');
  });

  it('fills fields inside open shadow roots (web-component forms)', async () => {
    document.body.innerHTML = '<apply-form></apply-form>';
    const shadow = document.querySelector('apply-form')!.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <label for="fn">First name</label><input id="fn">
      <label for="em">Email address</label><input id="em">
      <fieldset><legend>Do you require visa sponsorship?</legend>
        <label><input type="radio" name="sp" value="y"> Yes</label><label><input type="radio" name="sp" value="n"> No</label></fieldset>`;
    const out = await fillForm(document, ada, {});
    expect(shadow.querySelector<HTMLInputElement>('#fn')!.value).toBe('Ada');
    expect(shadow.querySelector<HTMLInputElement>('#em')!.value).toBe('ada@example.com');
    expect(shadow.querySelector<HTMLInputElement>('input[value=y]')!.checked).toBe(true);
    expect(out.filter((r) => r.status === 'filled')).toHaveLength(3);
    // The outline style lives in the shadow root, where it applies.
    expect(shadow.getElementById('wera-fill-style')).not.toBeNull();
  });

  it('asks for review when a required value is missing', async () => {
    document.body.innerHTML = fixture('lever.html');
    const out = await fillForm(document, { ...ada, email: '' }, {});
    const email = out.find((r) => r.label.startsWith('Email'))!;
    expect(email.status).toBe('review');
    expect(out.find((r) => r.purpose === 'resume')!.note).toMatch(/upload your resume/);
  });
});

describe('fillForm on harder forms', () => {
  it('fills fields that appear or load after an earlier answer', async () => {
    document.body.innerHTML = `
      <label for="country">Country</label>
      <select id="country"><option value="">Select</option><option value="US">United States</option><option value="CA">Canada</option></select>
      <label for="state">State</label><select id="state"><option value="">Select</option></select>
      <label for="auth">Will you require visa sponsorship?</label>
      <select id="auth"><option value="">Select</option><option>Yes</option><option>No</option></select>
      <div id="more"></div>`;
    // The page loads states for the chosen country, and asks a follow-up after "Yes".
    document.getElementById('country')!.addEventListener('change', () => setTimeout(() => {
      document.getElementById('state')!.innerHTML = '<option value="">Select</option><option value="TX">Texas</option><option value="CA">California</option>';
    }, 20));
    document.getElementById('auth')!.addEventListener('change', (e) => {
      if ((e.target as HTMLSelectElement).value === 'Yes') {
        document.getElementById('more')!.innerHTML = '<label for="cur">What is your current work authorization status (if yes)?</label><input id="cur" name="authorized_to_work">';
      }
    });
    const out = await fillForm(document, ada, { settle: 60 });
    const val = (id: string) => (document.getElementById(id) as HTMLInputElement).value;
    expect(val('country')).toBe('US');
    expect(val('state')).toBe('TX');
    expect(val('auth')).toBe('Yes');
    expect(out.map((r) => r.label)).toEqual(['Country', 'State', 'Will you require visa sponsorship?', expect.stringMatching(/current work authorization/)]);
    expect(out.find((r) => r.label === 'State')!.status).toBe('filled');
  });

  it('shapes dates and numbers, and reports values a field refuses', async () => {
    document.body.innerHTML = `
      <label for="start">Earliest start date</label><input id="start" type="date">
      <label for="pay">Desired salary</label><input id="pay" type="number">
      <label for="grad">Graduation date</label><input id="grad" placeholder="MM/DD/YYYY">`;
    const out = await fillForm(document, { ...ada, start_date: 'November 3, 2026', salary_expectation: '$120k', graduation_year: '2025-05-15' }, {});
    expect((document.getElementById('start') as HTMLInputElement).value).toBe('2026-11-03');
    expect((document.getElementById('pay') as HTMLInputElement).value).toBe('120000');
    expect((document.getElementById('grad') as HTMLInputElement).value).toBe('05/15/2025');

    document.body.innerHTML = '<label for="start">Earliest start date</label><input id="start" type="date">';
    const again = await fillForm(document, { ...ada, start_date: 'Immediately' }, {});
    expect(again[0]).toMatchObject({ status: 'review', note: expect.stringMatching(/doesn't fit/) });
    expect(out.every((r) => r.status === 'filled')).toBe(true);
  });

  it('opens Workday-style button dropdowns and picks by meaning', async () => {
    document.body.innerHTML = `
      <div data-automation-id="formField-state"><label id="st-l">State</label>
        <button id="st" aria-haspopup="listbox" aria-labelledby="st-l">Select One</button></div>
      <div data-automation-id="formField-country"><label id="co-l">Country</label>
        <button id="co" aria-haspopup="listbox" aria-labelledby="co-l">United States of America</button></div>`;
    const st = document.getElementById('st')!;
    st.addEventListener('click', () => {
      const ul = document.createElement('ul');
      ul.setAttribute('role', 'listbox');
      ul.innerHTML = '<li role="option">California</li><li role="option">Texas</li>';
      ul.addEventListener('click', (e) => {
        st.textContent = (e.target as HTMLElement).textContent;
        ul.remove();
      });
      document.body.appendChild(ul);
    });
    const out = await fillForm(document, ada, {});
    expect(st.textContent).toBe('Texas');
    expect(out.find((r) => r.label === 'State')).toMatchObject({ status: 'filled', value: 'Texas' });
    // One that already shows a choice is left alone.
    expect(out.find((r) => r.label === 'Country')!.status).toBe('already');
  });

  it('answers Yes/No button pairs and ticks a lone yes box', async () => {
    document.body.innerHTML = `
      <div class="_fieldEntry"><label>Are you legally authorized to work in the US?</label>
        <div class="_yesno"><button type="button" class="_option">Yes</button><button type="button" class="_option">No</button></div></div>
      <div class="_fieldEntry"><label>Do you require sponsorship?</label>
        <div class="_yesno"><button type="button" class="_option">Yes</button><button type="button" class="_option _active_x1">No</button></div></div>
      <label><input type="checkbox" name="relocate"> I am willing to relocate</label>`;
    document.querySelectorAll('._yesno button').forEach((b) => b.addEventListener('click', () => b.classList.add('_active_x1')));
    const out = await fillForm(document, ada, {});
    const [yes] = document.querySelectorAll<HTMLButtonElement>('._yesno button');
    expect(yes!.className).toContain('_active');
    expect(out.find((r) => r.label.startsWith('Are you legally'))).toMatchObject({ status: 'filled', value: 'Yes' });
    expect(out.find((r) => r.label.startsWith('Do you require'))!.status).toBe('already');
    expect(document.querySelector<HTMLInputElement>('[name=relocate]')!.checked).toBe(true);
  });

  it('leaves a chosen react-select alone and clears a search that found nothing', async () => {
    document.body.innerHTML = `
      <div><label for="g">Gender</label><div class="select__control"><div class="select__single-value">Woman</div>
        <input id="g" role="combobox" aria-autocomplete="list"></div></div>
      <div><label for="sch">School</label><div class="select__control"><input id="sch" role="combobox" aria-autocomplete="list"></div></div>`;
    const out = await fillForm(document, ada, {});
    expect(out.find((r) => r.label === 'Gender')!.status).toBe('already');
    expect(out.find((r) => r.label === 'School')).toMatchObject({ status: 'review', note: 'pick the matching option' });
    expect((document.getElementById('sch') as HTMLInputElement).value).toBe('');
  });
});

describe('values and options', () => {
  it('reads dates and shapes values for fields', () => {
    expect(parseDate('2026-11-03')?.getDate()).toBe(3);
    expect(parseDate('11/03/2026')?.getMonth()).toBe(10);
    expect(parseDate('Nov 3, 2026')?.getFullYear()).toBe(2026);
    expect(parseDate('2 weeks notice')).toBeNull();
    const num = Object.assign(document.createElement('input'), { type: 'number' });
    expect(formatFor(num, '3+ years', 'years_experience')).toBe('3');
    expect(formatFor(num, 'open', 'salary_expectation')).toBeNull();
    expect(searchText('TX', 'state')).toBe('Texas');
    expect(searchText('USA', 'country')).toBe('United States');
    expect(searchText('decline', 'gender')).toBe('');
  });

  it('reads yes and no from sentence answers', () => {
    const opts = (labels: string[]) => labels.map((l) => ({ label: l, value: l }));
    const auth = opts(['Select...', 'I am authorized to work in the US', 'I am not authorized to work in the US']);
    expect(matchOption(auth, 'yes', 'authorized_to_work')?.label).toBe('I am authorized to work in the US');
    expect(matchOption(auth, 'no', 'authorized_to_work')?.label).toBe('I am not authorized to work in the US');
    const sp = opts(["I won't require sponsorship", 'I will require sponsorship', 'Prefer not to say']);
    expect(matchOption(sp, 'yes', 'needs_sponsorship')?.label).toBe('I will require sponsorship');
  });


  it('derives combined values', () => {
    expect(valueFor('full_name', ada)).toBe('Ada Lovelace');
    expect(valueFor('location', ada)).toBe('Austin, TX');
    expect(valueFor('location', { ...ada, country: 'Kenya', city: 'Nairobi', state: '' })).toBe('Nairobi, Kenya');
    expect(valueFor('authorized_no_sponsorship', { ...ada, needs_sponsorship: 'no' })).toBe('yes');
    expect(valueFor('authorized_no_sponsorship', { ...ada, authorized_to_work: '' })).toBe('');
  });

  it('matches options by meaning', () => {
    const opts = (labels: string[]) => labels.map((l) => ({ label: l, value: l }));
    expect(matchOption(opts(['Select...', 'USA', 'Canada']), 'United States', 'country')?.label).toBe('USA');
    expect(matchOption(opts(['Texas', 'Utah']), 'TX', 'state')?.label).toBe('Texas');
    expect(matchOption(opts(['Yes, I will require sponsorship', 'No']), 'yes', 'needs_sponsorship')?.label).toBe('Yes, I will require sponsorship');
    expect(matchOption(opts(['Man', 'Woman', 'I prefer not to say']), 'decline', 'gender')?.label).toBe('I prefer not to say');
    expect(matchOption(opts(['Man', 'Woman']), 'decline', 'gender')).toBeNull();
  });
});
