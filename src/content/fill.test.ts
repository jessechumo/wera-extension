import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Applicant } from '../shared/types';
import { classify } from './classify';
import { collectFields } from './fields';
import { autofill as fillForm } from '../test/autofill';
import { matchOption, searchText } from './match';
import { formatFor, parseDate, valueFor } from './values';

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

describe('address search boxes', () => {
  const me = { ...ada, address: '500 Market Street', address_line2: '', city: 'San Francisco', state: 'CA', postal_code: '94105' };

  /** A search box like Teamtailor's, listing what a place search would for what is typed. */
  function searchBox(places: (typed: string) => string[]) {
    document.body.innerHTML = `<div><label for="a">Address</label><input id="a" role="combobox" autocomplete="street-address" aria-autocomplete="list"><ul role="listbox"></ul></div>`;
    const box = document.getElementById('a') as HTMLInputElement;
    const list = document.querySelector('ul')!;
    const typed: string[] = [];
    box.addEventListener('input', () => {
      typed.push(box.value);
      list.innerHTML = box.value ? places(box.value).map((p) => `<li role="option">${p}</li>`).join('') : '';
      list.querySelectorAll('li').forEach((li) => li.addEventListener('click', () => { box.value = li.textContent!; list.innerHTML = ''; }));
    });
    return { box, typed };
  }

  it('never takes a namesake street in another town', async () => {
    const { box } = searchBox(() => ['500 Market Street, Rochdale, OL12 8QW, United Kingdom', '500 Market Street, Philadelphia, PA 19106, USA']);
    const out = await fillForm(document, me, {});
    expect(out.find((r) => r.label === 'Address')).toMatchObject({ status: 'review', note: 'pick the matching option' });
    expect(box.value).toBe('');
  });

  it('takes the applicant\'s own, however the street is written', async () => {
    const { box, typed } = searchBox(() => ['500 Market St, Rochdale, OL12 8QW, United Kingdom', '500 Market St, San Francisco, CA 94105, USA']);
    const out = await fillForm(document, me, {});
    expect(box.value).toBe('500 Market St, San Francisco, CA 94105, USA');
    expect(out.find((r) => r.label === 'Address')!.status).toBe('filled');
    expect(typed.some((t) => t.includes('San Francisco'))).toBe(true); // the town helps the search too
  });

  it('settles for the town when the box only knows towns', async () => {
    const { box } = searchBox((t) => (t.startsWith('San Francisco') ? ['San Francisco, CA, USA'] : []));
    await fillForm(document, me, {});
    expect(box.value).toBe('San Francisco, CA, USA');
  });
});

describe('degrees', () => {
  const opt = (...labels: string[]) => labels.map((label) => ({ label, value: label }));
  // Greenhouse's list, as on Stripe's form.
  const list = opt("Associate's Degree", "Bachelor's Degree", 'Doctor of Medicine (M.D.)', 'Doctor of Pharmacy (Pharm.D.)', 'Doctor of Philosophy (Ph.D.)', "Engineer's Degree", 'High School', 'Juris Doctor (J.D.)', 'Master of Business Administration (M.B.A.)', "Master's Degree", 'Other');
  const picks = (value: string, options = list) => matchOption(options, value, 'edu_degree')?.label ?? null;

  it('never calls one degree another: a PhD is no M.D.', () => {
    expect(picks('PhD')).toBe('Doctor of Philosophy (Ph.D.)');
    expect(picks('Doctor of Philosophy')).toBe('Doctor of Philosophy (Ph.D.)');
    expect(picks('MD')).toBe('Doctor of Medicine (M.D.)');
    expect(picks('JD')).toBe('Juris Doctor (J.D.)');
    expect(picks('Master of Science')).toBe("Master's Degree");
    expect(picks('MBA')).toBe('Master of Business Administration (M.B.A.)');
    expect(picks('B.S. in Computer Science')).toBe("Bachelor's Degree");
  });

  it('tells degrees of a level apart when the list names them', () => {
    const named = opt('Bachelor of Arts (B.A.)', 'Bachelor of Science (B.S.)', 'Master of Arts (M.A.)', 'Master of Business Administration (M.B.A.)', 'Master of Science (M.S.)');
    expect(picks('Master of Science', named)).toBe('Master of Science (M.S.)');
    expect(picks('MS', named)).toBe('Master of Science (M.S.)');
    expect(picks('BS Computer Science', named)).toBe('Bachelor of Science (B.S.)');
    expect(picks('Bachelor of Arts', named)).toBe('Bachelor of Arts (B.A.)');
  });

  it('asks when the list has only other degrees of the level, or names several and the value none', () => {
    expect(picks('PhD', opt('Doctor of Medicine (M.D.)', 'Juris Doctor (J.D.)'))).toBeNull();
    expect(picks('MBA', opt('Master of Arts (M.A.)', 'Master of Science (M.S.)'))).toBeNull();
    expect(picks("Master's", opt('Master of Arts (M.A.)', 'Master of Science (M.S.)'))).toBeNull();
  });

  it('tries the degree itself before its level', () => {
    expect(picks('PhD || Doctorate')).toBe('Doctor of Philosophy (Ph.D.)');
    expect(picks('PhD || Doctorate', opt('Doctorate', 'Masters'))).toBe('Doctorate');
  });

  it('takes a list that says only the level', () => {
    expect(picks('PhD', opt('Doctorate', 'Masters', 'Bachelors'))).toBe('Doctorate');
    expect(picks('Master of Science', opt('Doctorate', 'Masters', 'Bachelors'))).toBe('Masters');
    expect(picks("Bachelor's", opt('Associate', 'Bachelor of Science (B.S.)'))).toBe('Bachelor of Science (B.S.)');
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
    // A place box takes the first; a list of states or of countries the ones after.
    expect(valueFor('location', ada)).toBe('Austin, TX || Texas || United States');
    expect(valueFor('location', { ...ada, country: 'Kenya', city: 'Nairobi', state: '' })).toBe('Nairobi, Kenya || Kenya');
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

describe('options by meaning', () => {
  const opts = (labels: string[]) => labels.map((label) => ({ label, value: label }));
  const pick = (labels: string[], value: string, purpose: Parameters<typeof matchOption>[2]) => matchOption(opts(labels), value, purpose)?.label ?? null;

  it('gender, however the form words it, never "Female" for male', () => {
    expect(pick(['Man', 'Woman', 'Non-binary', 'I prefer not to say'], 'Male', 'gender')).toBe('Man');
    expect(pick(['Female', 'Male', 'Decline To Self Identify'], 'Male', 'gender')).toBe('Male');
    expect(pick(['Female', 'Male (he/him)'], 'Male', 'gender')).toBe('Male (he/him)');
    expect(pick(['Woman', 'Man'], 'Female', 'gender')).toBe('Woman');
    expect(pick(['Male', 'Female', 'Genderqueer / Non-binary'], 'Non-binary', 'gender')).toBe('Genderqueer / Non-binary');
  });

  it('declining, in the many ways forms say it', () => {
    for (const d of ['Decline To Self Identify', 'I don\'t wish to answer', 'I do not want to answer', 'Prefer not to disclose', 'Choose not to disclose', 'Not Declared', 'I wish not to answer']) {
      expect(pick(['Male', 'Female', d], 'decline', 'gender'), d).toBe(d);
    }
  });

  it('race, sexual orientation and Hispanic origin', () => {
    expect(pick(['White (Not Hispanic or Latino)', 'Black or African American (Not Hispanic or Latino)', 'Two or More Races (Not Hispanic or Latino)'], 'Black or African American', 'race'))
      .toBe('Black or African American (Not Hispanic or Latino)');
    expect(pick(['Asian (United States of America)', 'White (United States of America)'], 'White', 'race')).toBe('White (United States of America)');
    expect(pick(['Multiracial', 'Asian'], 'Two or more races', 'race')).toBe('Multiracial');
    expect(pick(['Straight / Heterosexual', 'Gay', 'Lesbian', 'Bisexual'], 'Heterosexual or straight', 'sexual_orientation')).toBe('Straight / Heterosexual');
    expect(pick(['Hispanic or Latino', 'Not Hispanic or Latino', 'Decline to self-identify'], 'no', 'hispanic')).toBe('Not Hispanic or Latino');
  });

  it('veteran and disability statements as Greenhouse, Lever and Workday word them', () => {
    const vet = ['I am not a protected veteran', 'I identify as one or more of the classifications of protected veteran', "I don't wish to answer"];
    expect(pick(vet, 'I am not a protected veteran', 'veteran')).toBe('I am not a protected veteran');
    expect(pick(vet, 'I am a protected veteran', 'veteran')).toBe('I identify as one or more of the classifications of protected veteran');
    expect(pick(['I am not a veteran', 'I am a veteran, but not a protected veteran', 'I am a protected veteran'], 'I am not a protected veteran', 'veteran')).toBe('I am not a veteran');
    const dis = ['Yes, I have a disability (or previously had a disability)', "No, I don't have a disability and have not had one in the past", 'I do not want to answer'];
    expect(pick(dis, 'No, I do not have a disability', 'disability')).toBe("No, I don't have a disability and have not had one in the past");
    expect(pick(dis, 'Yes, I have a disability', 'disability')).toBe('Yes, I have a disability (or previously had a disability)');
    expect(pick(dis, 'decline', 'disability')).toBe('I do not want to answer');
  });

  it('degrees by level, months and ranges of years', () => {
    expect(pick(["Bachelor's Degree", "Master's Degree", 'MBA', 'PhD'], 'Master of Science', 'degree')).toBe("Master's Degree");
    expect(pick(['High School', 'Associates', 'Bachelors', 'Masters'], 'B.S.', 'degree')).toBe('Bachelors');
    expect(pick(['BA', 'BS', 'MS', 'PhD'], 'Doctor of Philosophy', 'degree')).toBe('PhD');
    expect(pick(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'], 'May', 'exp_start')).toBe('May');
    expect(pick(['01', '02', '03', '04', '05', '06'], 'March', 'edu_end')).toBe('03');
    const years = ['Less than 1 year', '1-2 years', '3-5 years', '6-10 years', '10+ years'];
    expect(pick(years, '4', 'years_experience')).toBe('3-5 years');
    expect(pick(years, '0', 'years_experience')).toBe('Less than 1 year');
    expect(pick(years, '12', 'years_experience')).toBe('10+ years');
  });

  it('whole words only when nothing else matches', () => {
    expect(pick(['Data Science', 'Computer Science and Engineering'], 'Computer Science', 'major')).toBe('Computer Science and Engineering');
    expect(pick(['Female'], 'male', 'how_heard')).toBeNull();
  });
});

describe('phone parts', () => {
  it('fills the device type and the country code beside the number', async () => {
    document.body.innerHTML = `<form>
      <label for="t">Phone Device Type</label><select id="t"><option value="">Select One</option><option>Landline</option><option>Mobile</option></select>
      <label for="c">Country Phone Code</label><select id="c"><option value="">Select One</option><option>Canada (+1)</option><option>United States of America (+1)</option></select>
      <label for="n">Phone Number</label><input id="n"></form>`;
    const out = await fillForm(document, { ...ada, phone: '469 555 0101', country: 'United States' }, {});
    expect(out.map((r) => [r.purpose, r.value])).toEqual([['phone_type', 'Mobile'], ['phone_code', 'United States of America (+1)'], ['phone', '469 555 0101']]);
  });
});

describe('names worded differently', () => {
  const opts = (labels: string[]) => labels.map((label) => ({ label, value: label }));
  it('finds the school in a long list, and stays out of a tie', () => {
    const list = opts(['Texas A&M University', 'The University of Texas at Austin', 'The University of Texas at Dallas', 'University of Dallas']);
    expect(matchOption(list, 'University of Texas at Dallas', 'school')?.label).toBe('The University of Texas at Dallas');
    expect(matchOption(opts(['University of Texas - Dallas', 'Dallas College']), 'University of Texas at Dallas', 'edu_school')?.label).toBe('University of Texas - Dallas');
    expect(matchOption(opts(['Texas Tech (Dallas)', 'Texas State Dallas']), 'University of Texas at Dallas', 'school')).toBeNull();
  });

  it('reads the questions real forms ask', () => {
    const at = (label: string, kind = 'text') => {
      document.body.innerHTML = kind === 'select' ? `<label for="x">${label}</label><select id="x"><option>Yes</option><option>No</option></select>` : `<label for="x">${label}</label><input id="x">`;
      return classify(collectFields(document)[0]!);
    };
    expect(at('Are you subject to any employment agreements and/or post-employment restrictions with your current employer?', 'select')).toBeNull();
    expect(at('Name Pronunciation | How do you pronounce your name?')).toBe('question');
    expect(at('Will you now or in the future require sponsorship for employment visa status?', 'select')).toBe('needs_sponsorship');
    expect(at('Please tell us how you heard about this opportunity.')).toBe('how_heard');
    expect(at("What's the name you'd prefer us to use throughout the interview process?")).toBe('preferred_name');
    expect(at('Are you legally authorized to work in the country for which you are applying?', 'select')).toBe('authorized_to_work');
    document.body.innerHTML = '<label>Attach<input type="file" id="cover_letter" name="cover_letter"></label>';
    expect(classify(collectFields(document)[0]!)).toBe('cover_letter');
  });
});

describe('more questions from real forms', () => {
  const first = (html: string) => {
    document.body.innerHTML = html;
    return classify(collectFields(document)[0]!);
  };
  it('tells essays, tick boxes and race lists from details', () => {
    expect(first('<label for="a">How are you using AI today in your current role? If applicable, show us.</label><textarea id="a"></textarea>')).toBe('question');
    expect(first('<label><input type="checkbox" id="li"> LinkedIn</label>')).toBeNull();
    expect(first(`<fieldset><legend>Race</legend><p>Hispanic or Latino - A person of Cuban, Mexican...</p>
      <label><input type="radio" name="r" value="1">Hispanic or Latino</label><label><input type="radio" name="r" value="2">White (Not Hispanic or Latino)</label>
      <label><input type="radio" name="r" value="3">Black or African American (Not Hispanic or Latino)</label><label><input type="radio" name="r" value="4">Asian (Not Hispanic or Latino)</label></fieldset>`)).toBe('race');
    expect(first('<label for="x">X</label><input id="x">')).toBe('twitter');
    expect(first('<label for="l">Legal Name (if different than above)</label><input id="l">')).toBeNull();
    expect(first('<label for="c">Cover letter</label><textarea id="c"></textarea>')).toBe('cover_letter');
  });
});

describe('never the opposite answer', () => {
  it('leaves a veteran question when no option means "not a protected veteran"', () => {
    const robinhood = ['I am on active duty', 'I have never served in the military', 'I identify as a protected veteran', 'I identify as a non-protected veteran', "I don't wish to answer"]
      .map((label) => ({ label, value: label }));
    expect(matchOption(robinhood, 'I am not a protected veteran', 'veteran')).toBeNull();
  });
});

describe('boxes that suggest places', () => {
  it('types the city and picks the matching suggestion (Lever)', async () => {
    document.body.innerHTML = `<form><label>Current location <div class="application-field"><input class="location-input" id="loc" name="location">
      <div class="dropdown-container"><div class="dropdown-results"></div></div></div></label></form>`;
    const input = document.querySelector<HTMLInputElement>('#loc')!;
    const results = document.querySelector('.dropdown-results')!;
    input.addEventListener('input', () => {
      results.innerHTML = input.value ? ['Dallas, TX, USA', 'Dallas, OR, USA'].map((t, i) => `<div class="dropdown-location" id="l${i}">${t}</div>`).join('') : '';
      results.querySelectorAll('.dropdown-location').forEach((d) => d.addEventListener('click', () => { input.value = d.textContent!; results.innerHTML = ''; }));
    });
    const out = await fillForm(document, { ...ada, city: 'Dallas', state: 'TX', country: 'United States' }, {});
    expect(out[0]).toMatchObject({ purpose: 'location', status: 'filled', value: 'Dallas, TX, USA' });
  });
});

describe('places', () => {
  const opts = (labels: string[]) => labels.map((label) => ({ label, value: label }));
  it('picks the right Dallas', () => {
    const list = opts(['Dallas, Georgia, United States', 'Dallas, Texas, United States', 'Dallas, Oregon, United States']);
    expect(matchOption(list, 'Dallas, TX', 'location')?.label).toBe('Dallas, Texas, United States');
    expect(matchOption(opts(['Dallas, OR, USA', 'Dallas, TX, USA']), 'Dallas, TX', 'city')?.label).toBe('Dallas, TX, USA');
    expect(matchOption(list, 'Dallas, WA', 'location')).toBeNull();
  });
});

describe('not waiting for nothing', () => {
  it('fills a plain city box at once, and gives up quickly on a list without the answer', async () => {
    document.body.innerHTML = `<form><label for="c">City</label><input id="c">
      <label for="v">Veteran status</label><input id="v" role="combobox" aria-controls="vl"><div id="vl" role="listbox"></div></form>`;
    const input = document.querySelector<HTMLInputElement>('#v')!;
    input.addEventListener('keyup', () => {
      document.querySelector('#vl')!.innerHTML = '<div role="option">I am on active duty</div><div role="option">I have never served</div>';
    });
    const t0 = Date.now();
    const out = await fillForm(document, { ...ada, city: 'Dallas', veteran: 'I am not a protected veteran' }, { passes: 1 });
    expect(out.find((r) => r.purpose === 'city')).toMatchObject({ status: 'filled', value: 'Dallas' });
    expect(out.find((r) => r.purpose === 'veteran')).toMatchObject({ status: 'review' });
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});

describe('follow-ups and accents', () => {
  const first = (html: string) => {
    document.body.innerHTML = html;
    return classify(collectFields(document)[0]!);
  };
  it('leaves follow-up questions to the user and reads accented labels', () => {
    expect(first('<label for="e">If yes, please mention your CloudFactory email address.</label><input id="e" type="email">')).toBeNull();
    expect(first('<label for="r">Résumé*</label><input id="r" type="file">')).toBe('resume');
  });
});
