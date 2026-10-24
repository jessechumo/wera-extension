// What Wera works out on real forms (each case is from a live Greenhouse,
// Lever, Ashby or Recruitee form, cut down): labels as people read them,
// questions answered from what the user already told Wera, and lists
// matched by meaning.
import { describe, expect, it } from 'vitest';
import type { Profile } from '../shared/types';
import { classify } from './classify';
import { collectFields } from './fields';
import { peekOptions } from './fill';
import { planForm } from './plan';

const alex: Profile = {
  first_name: 'Alex', last_name: 'Rivera', preferred_name: '', email: 'alex@example.com', phone: '(214) 555-0182',
  address: '123 Main St', address_line2: 'Apt 4', city: 'Dallas', state: 'TX', postal_code: '75201', country: 'United States',
  linkedin: '', github: '', portfolio: '', current_company: 'Acme Corp', current_title: 'Engineer', years_experience: '5',
  school: '', degree: '', major: '', graduation_year: '', gpa: '', authorized_to_work: 'yes', needs_sponsorship: 'no',
  willing_to_relocate: 'yes', salary_expectation: '', start_date: '', how_heard: 'LinkedIn', languages: 'English, Spanish',
  citizenship: 'United States', gender: 'Male', pronouns: 'he/him', transgender: 'no', sexual_orientation: 'Heterosexual or straight',
  race: 'White', hispanic: 'yes', veteran: 'I am not a protected veteran', disability: 'No, I do not have a disability',
  experience: [{ title: 'Engineer', company: 'Acme Corp', current: true }, { title: 'Intern', company: 'Globex, Inc.', current: false }],
};

const plan = (html: string, company = '') => {
  document.body.innerHTML = html;
  return planForm(document, alex, { company });
};
const byLabel = (p: ReturnType<typeof plan>, label: string) => p.fields.find((f) => f.label.startsWith(label))!;

describe('labels as a person reads them', () => {
  it('leaves out hidden status text and reads the ✱ marker as required (Lever)', () => {
    document.body.innerHTML = `<div class="application-question"><div class="application-label">Current location<span class="required">✱</span></div>
      <div class="application-field"><input name="location" type="text">
        <div class="dropdown-no-results" style="display:none">No location found. Try entering a different location</div>
        <div class="dropdown-loading-results" style="display:none">Loading</div></div></div>`;
    const [f] = collectFields(document);
    expect(f!.label).toBe('Current location');
    expect(f!.required).toBe(true);
  });

  it('reads a fieldset of separately named tick boxes as one question (Ashby)', () => {
    document.body.innerHTML = `<fieldset><label class="heading" for="q1">How did you hear about this opportunity? (select all that apply)</label>
      <div><span><input type="checkbox" id="c0" name="LinkedIn"></span><label for="c0">LinkedIn</label></div>
      <div><span><input type="checkbox" id="c1" name="Glassdoor"></span><label for="c1">Glassdoor</label></div>
      <div><span><input type="checkbox" id="c2" name="Notion Blog"></span><label for="c2">Notion Blog</label></div></fieldset>`;
    const fields = collectFields(document);
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({ kind: 'checkboxes', label: 'How did you hear about this opportunity? (select all that apply)' });
    expect(fields[0]!.options.map((o) => o.label)).toEqual(['LinkedIn', 'Glassdoor', 'Notion Blog']);
    expect(byLabel(plan(document.body.innerHTML), 'How did you hear')).toMatchObject({ purpose: 'how_heard', value: 'LinkedIn' });
  });

  it('reads a label an input names even when that label is hidden (ARIA allows it)', () => {
    document.body.innerHTML = `<span id="l" hidden>Preferred pronouns</span><input aria-labelledby="l">`;
    expect(collectFields(document)[0]!.label).toBe('Preferred pronouns');
  });

  it('reads a radio group\'s question from the fieldset around an untitled inner group', () => {
    document.body.innerHTML = `<fieldset><legend>Are you willing to relocate?</legend><div role="radiogroup">
      <label><input type="radio" name="rel" value="y">Yes</label><label><input type="radio" name="rel" value="n">No</label></div></fieldset>`;
    expect(collectFields(document)[0]).toMatchObject({ kind: 'radio', label: 'Are you willing to relocate?' });
  });

  it('keeps consent boxes in a fieldset as their own questions', () => {
    document.body.innerHTML = `<fieldset><legend>Acknowledgements</legend>
      <label><input type="checkbox" name="a"> I agree to the privacy policy</label>
      <label><input type="checkbox" name="b"> I consent to SMS updates</label></fieldset>`;
    expect(collectFields(document).map((f) => f.kind)).toEqual(['checkbox', 'checkbox']);
  });
});

describe('questions answered from what the user told Wera', () => {
  it('picks "Hispanic or Latino" in one race and ethnicity list for a Hispanic user (Ashby, Lever)', () => {
    const p = plan(`<fieldset><legend>Race</legend>
      <label><input type="radio" name="race" value="h">Hispanic or Latino</label>
      <label><input type="radio" name="race" value="w">White (Not Hispanic or Latino)</label>
      <label><input type="radio" name="race" value="d">Decline to self-identify</label></fieldset>`);
    expect(byLabel(p, 'Race')).toMatchObject({ purpose: 'race', value: 'Hispanic or Latino', source: 'details' });
  });

  it('picks the race itself where the list has no Hispanic choice (asked separately)', () => {
    const p = plan(`<label for="r">Race</label><select id="r"><option value="">Select...</option><option>Asian</option><option>White</option><option>Two or More Races</option></select>`);
    expect(byLabel(p, 'Race').value).toBe('White');
  });

  it('answers "Have you worked here before?" from the resume, only about this company', () => {
    const html = `<fieldset><legend>Have you ever been previously employed by Spotify?</legend>
      <label><input type="checkbox" name="prev" value="no">No</label><label><input type="checkbox" name="prev" value="i">Yes - Intern</label>
      <label><input type="checkbox" name="prev" value="f">Yes - Full Time Employment</label></fieldset>
      <label for="g">Have you previously worked at or consulted for Globex?</label><select id="g"><option></option><option>Yes</option><option>No</option></select>
      <label for="x">Have you ever worked for a government agency?</label><select id="x"><option></option><option>Yes</option><option>No</option></select>`;
    expect(byLabel(plan(html, 'Spotify'), 'Have you ever been previously employed')).toMatchObject({ purpose: 'previously_employed', value: 'No' });
    expect(byLabel(plan(html, 'Globex'), 'Have you previously worked at')).toMatchObject({ value: 'Yes' });
    // Not about this company: the AI (or the user) answers it, with no "not in your details" note.
    const other = byLabel(plan(html, 'Globex'), 'Have you ever worked for a government');
    expect([other.value, other.note]).toEqual(['', undefined]);
  });

  it('answers "Are you located in / a citizen of <country>?" from the details', () => {
    const p = plan(`<label for="a">Are you currently located in the US?</label><select id="a"><option></option><option>Yes</option><option>No</option></select>
      <fieldset><legend>Are you a Singapore citizen?</legend><label><input type="radio" name="sg" value="y">Yes</label><label><input type="radio" name="sg" value="n">No</label></fieldset>
      <label for="b">Are you currently located in the Bay Area?</label><select id="b"><option></option><option>Yes</option><option>No</option></select>`);
    expect(byLabel(p, 'Are you currently located in the US')).toMatchObject({ purpose: 'in_country', value: 'Yes' });
    expect(byLabel(p, 'Are you a Singapore citizen')).toMatchObject({ purpose: 'citizen_of', value: 'No' });
    const bay = byLabel(p, 'Are you currently located in the Bay Area');
    expect([bay.value, bay.note]).toEqual(['', undefined]);
  });

  it('answers the LGBTQ+ question from orientation and gender identity, as self-identification', () => {
    const p = plan(`<label for="l">I consider myself a member of the LGBTQ+ community.</label><select id="l"><option></option><option>Yes</option><option>No</option><option>I prefer not to answer</option></select>`);
    expect(byLabel(p, 'I consider myself')).toMatchObject({ purpose: 'lgbtq', group: 'self_id', value: 'No' });
  });

  it('ticks the lone box that is the user\'s self-identification answer (Workday disability)', () => {
    const p = plan(`<div data-automation-id="formField-disabilityStatus"><label><input type="checkbox" name="d1"> Yes, I have a disability (or previously had a disability)</label></div>
      <div data-automation-id="formField-disabilityStatus"><label><input type="checkbox" name="d2"> No, I do not have a disability and have not had one in the past</label></div>`);
    expect(p.fields.map((f) => [f.purpose, f.value])).toEqual([['disability', ''], ['disability', 'yes']]);
  });

  it('falls back from the city to the country for a list of countries, and the state code to its name', () => {
    const p = plan(`<label for="l">What is your location?</label><select id="l"><option value="">Select</option><option>Mexico</option><option>United States</option></select>
      <label for="s">State</label><select id="s"><option value="">Select</option><option>Tennessee</option><option>Texas</option></select>`);
    expect(byLabel(p, 'What is your location')).toMatchObject({ purpose: 'location', value: 'United States' });
    expect(byLabel(p, 'State').value).toBe('Texas');
  });

  it('puts the whole address in a form\'s only address box, and the street alone beside city and state boxes', () => {
    expect(byLabel(plan(`<label for="a">Address</label><input id="a">`), 'Address').value).toBe('123 Main St, Apt 4, Dallas, TX 75201');
    const p = plan(`<label for="a">Address</label><input id="a"><label for="c">City</label><input id="c">`);
    expect(byLabel(p, 'Address').value).toBe('123 Main St');
  });

  it('ticks every language the user speaks in a list of them (Lever)', () => {
    const p = plan(`<fieldset><legend>Language Skill(s) (Check all that apply)</legend>
      <label><input type="checkbox" name="lang" value="en">English (ENG)</label><label><input type="checkbox" name="lang" value="es">Spanish (SPA)</label>
      <label><input type="checkbox" name="lang" value="fr">French (FRA)</label></fieldset>`);
    expect(byLabel(p, 'Language Skill')).toMatchObject({ purpose: 'languages', value: 'English (ENG) | Spanish (SPA)' });
  });

  it('reads "where will you work from" and a preferred work location as places, not remote or hybrid', () => {
    const p = plan(`<label for="a">Where do you plan on working from (for payroll tax purposes)?</label><input id="a" role="combobox">
      <label for="b">What is your preferred work location?</label><select id="b"><option>Amsterdam</option><option>Sofia</option></select>`);
    expect(byLabel(p, 'Where do you plan')).toMatchObject({ purpose: 'location', value: 'Dallas, TX || Texas || United States' });
    // None of the offices is the user's city: left for the AI to pick from the list.
    expect(byLabel(p, 'What is your preferred work location')).toMatchObject({ purpose: 'location', value: '' });
  });
});

describe('what Wera leaves alone', () => {
  it('never attaches the resume to an upload that would fill the form itself (Ashby)', () => {
    document.body.innerHTML = `<div><label>Autofill from resume</label><p>Upload your resume here to autofill key application fields.</p><input type="file" id="af"></div>
      <label for="r">Resume</label><input type="file" id="r">`;
    expect(collectFields(document).map(classify)).toEqual([null, 'resume']);
  });

  it('leaves consent choices and referrals to the user', () => {
    const p = plan(`<fieldset><legend>SMS</legend><label><input type="radio" name="sms" value="y">Yes - I consent to receiving SMS text messages</label>
      <label><input type="radio" name="sms" value="n">No - I do not consent to receiving SMS text messages</label></fieldset>
      <label for="r">Has someone at Linear referred you for this role? If so, please include their name here:</label><input id="r">`);
    expect(byLabel(p, 'SMS')).toMatchObject({ purpose: 'consent', value: '' });
    expect(byLabel(p, 'Has someone at Linear')).toMatchObject({ purpose: 'referral', value: '', note: 'only you know who referred you' });
  });
});

describe('dropdown choices', () => {
  it('reads a custom dropdown\'s choices by opening it, and closes it again without picking', async () => {
    document.body.innerHTML = `<label id="lb">How do you assess your English?</label><button aria-haspopup="listbox" aria-labelledby="lb" aria-controls="menu">Select...</button>
      <ul id="menu" role="listbox" hidden></ul>`;
    const btn = document.querySelector('button')!;
    const menu = document.querySelector('ul')!;
    btn.addEventListener('click', () => {
      menu.hidden = false;
      menu.innerHTML = '<li role="option">Native</li><li role="option">Fluent</li><li role="option">Basic</li>';
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') menu.hidden = true;
    });
    const [f] = collectFields(document);
    expect(await peekOptions([f!], 300)).toEqual({ [f!.id]: ['Native', 'Fluent', 'Basic'] });
    expect(menu.hidden).toBe(true);
    expect(btn.textContent).toBe('Select...');
  });
});
