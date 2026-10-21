import { beforeEach, describe, expect, it } from 'vitest';
import type { Applicant, FieldPlan, FillResult } from '../shared/types';
import { classify } from './classify';
import { collectFields } from './fields';
import { findNext, invalidCount, pressNext } from './next';
import { applyItems, currentValue, highlight, LETTER, planForm, RESUME, snapshot } from './plan';

const ada: Applicant = {
  first_name: 'Ada', middle_name: 'King', last_name: 'Lovelace', preferred_name: '', email: 'ada@example.com', phone: '(512) 555-0142',
  address: '', city: 'Austin', state: 'TX', postal_code: '', country: 'United States', linkedin: 'https://linkedin.com/in/ada',
  github: '', portfolio: '', current_company: 'Acme', current_title: 'SRE Intern', years_experience: '1',
  school: 'UT Austin', degree: "Bachelor's", major: 'Computer Science', graduation_year: '2025', gpa: '', authorized_to_work: 'yes',
  needs_sponsorship: 'yes', willing_to_relocate: 'yes', salary_expectation: '', start_date: '', how_heard: 'Company website',
  over_18: 'yes', security_clearance: '', notice_period: '', work_preference: 'hybrid',
  gender: 'decline', pronouns: '', race: 'decline', hispanic: 'decline', veteran: 'decline', disability: 'decline',
  transgender: 'decline', sexual_orientation: 'decline',
};

const FORM = `<form id="f">
  <div class="field"><label for="fn">First name *</label><input id="fn" name="first_name" required></div>
  <div class="field"><label for="mn">Middle name</label><input id="mn" name="middle"></div>
  <div class="field"><label for="ln">Last name *</label><input id="ln" name="last_name" required value="Byron"></div>
  <div class="field"><label for="re">Resume *</label><input id="re" type="file" name="resume"></div>
  <div class="field"><label for="cl">Cover letter</label><textarea id="cl" name="cover"></textarea></div>
  <div class="field"><label for="sp">Will you now or in the future require visa sponsorship? *</label>
    <select id="sp" name="sponsor"><option value="">Select</option><option>Yes</option><option>No</option></select></div>
  <div class="field"><label for="o18">Are you at least 18 years of age?</label>
    <select id="o18"><option value="">Select</option><option>Yes</option><option>No</option></select></div>
  <div class="field"><label for="wp">Preferred work arrangement</label>
    <select id="wp"><option value="">Select</option><option>Remote</option><option>Hybrid</option><option>Onsite</option></select></div>
  <div class="field"><label for="np">What is your notice period?</label><input id="np" name="notice"></div>
  <div class="field"><label for="tools">Favorite tool</label><input id="tools" name="tool"></div>
  <fieldset><legend>Which clouds have you used?</legend>
    <label><input type="checkbox" name="cloud" value="aws"> AWS</label>
    <label><input type="checkbox" name="cloud" value="gcp"> GCP</label>
    <label><input type="checkbox" name="cloud" value="azure"> Azure</label>
  </fieldset>
  <fieldset><legend>Sexual orientation</legend>
    <label><input type="radio" name="so" value="h"> Heterosexual</label>
    <label><input type="radio" name="so" value="d"> I prefer not to say</label>
  </fieldset>
  <div class="field"><label for="why">Why do you want to join Fixture Robotics?</label><textarea id="why" name="why"></textarea></div>
  <label><input type="checkbox" id="agree"> I agree to the privacy policy</label>
  <button type="button">Back</button>
  <button type="button" id="next">Save and continue</button>
</form>`;

const byLabel = (plans: FieldPlan[], start: string) => plans.find((p) => p.label.startsWith(start))!;

describe('planForm', () => {
  beforeEach(() => {
    document.body.innerHTML = FORM;
  });

  it('proposes values with where they came from, and changes nothing', () => {
    const plan = planForm(document, ada, {
      answers: [{ question: 'What is your notice period? *', answer: 'Two weeks' }, { question: 'Why do you want to join Fixture Robotics?', answer: 'Robots.' }],
      resumeName: 'Ada.pdf', coverLetter: true,
    });
    const f = plan.fields;
    expect(byLabel(f, 'First name')).toMatchObject({ value: 'Ada', source: 'details', group: 'details', required: true, current: '' });
    expect(byLabel(f, 'Middle name')).toMatchObject({ value: 'King', purpose: 'middle_name' });
    expect(byLabel(f, 'Last name')).toMatchObject({ current: 'Byron', value: 'Lovelace' });
    expect(byLabel(f, 'Resume')).toMatchObject({ value: RESUME, source: 'resume', group: 'documents', note: 'Ada.pdf' });
    expect(byLabel(f, 'Cover letter')).toMatchObject({ value: LETTER, source: 'letter' });
    expect(byLabel(f, 'Will you now')).toMatchObject({ value: 'Yes', options: ['Yes', 'No'] });
    expect(byLabel(f, 'Are you at least 18')).toMatchObject({ value: 'Yes', purpose: 'over_18' });
    expect(byLabel(f, 'Preferred work')).toMatchObject({ value: 'Hybrid', purpose: 'work_preference' });
    expect(byLabel(f, 'What is your notice')).toMatchObject({ value: 'Two weeks', source: 'saved', purpose: 'notice_period' });
    expect(byLabel(f, 'Favorite tool')).toMatchObject({ value: '', source: null, group: 'other' });
    expect(byLabel(f, 'Sexual orientation')).toMatchObject({ value: 'I prefer not to say', group: 'self_id' });
    expect(byLabel(f, 'Why do you want')).toMatchObject({ value: 'Robots.', source: 'saved', group: 'questions' });
    expect(byLabel(f, 'I agree')).toMatchObject({ value: '', group: 'consent' });
    expect(plan.next).toMatchObject({ label: 'Save and continue', final: false });
    expect(plan.errors).toBe(0);
    expect(document.querySelector<HTMLInputElement>('#fn')!.value).toBe('');
  });

  it('notes what it cannot fill', () => {
    const plan = planForm(document, { ...ada, needs_sponsorship: '', work_preference: 'any' });
    expect(byLabel(plan.fields, 'Will you now')).toMatchObject({ value: '', note: 'not in your application details' });
    expect(byLabel(plan.fields, 'Preferred work')).toMatchObject({ value: '', note: 'no option matches "any"' });
    expect(byLabel(plan.fields, 'Resume')).toMatchObject({ value: '', note: 'upload your resume in Wera to attach it' });
    expect(byLabel(plan.fields, 'Cover letter').note).toBe('no cover letter for this job yet');
  });

  it('never proposes an earlier answer for self-identification', () => {
    const plan = planForm(document, { ...ada, sexual_orientation: '' }, { answers: [{ question: 'Sexual orientation', answer: 'Heterosexual' }] });
    expect(byLabel(plan.fields, 'Sexual orientation').value).toBe('');
  });
});

describe('applyItems', () => {
  beforeEach(() => {
    document.body.innerHTML = FORM;
  });

  it('fills exactly the approved values, overwriting, reporting each as it lands', async () => {
    const plan = planForm(document, ada, { resumeName: 'Ada.pdf', coverLetter: true });
    const id = (start: string) => byLabel(plan.fields, start).id;
    const seen: FillResult[] = [];
    const out = await applyItems(document, [
      { id: id('First name'), value: 'Ada' },
      { id: id('Last name'), value: 'Lovelace' },
      { id: id('Resume'), value: RESUME },
      { id: id('Cover letter'), value: LETTER },
      { id: id('Will you now'), value: 'No' },
      { id: id('Which clouds'), value: 'AWS | Azure' },
      { id: id('I agree'), value: 'yes' },
      { id: id('Favorite tool'), value: '' },
      { id: 'w-gone', value: 'x' },
    ], { resume: { name: 'Ada.pdf', base64: btoa('%PDF') }, coverLetter: 'Dear team, hire me.', onProgress: (r) => seen.push(r) });

    const q = <T extends HTMLElement = HTMLInputElement>(sel: string) => document.querySelector<T>(sel)!;
    expect(q('#fn').value).toBe('Ada');
    expect(q('#ln').value).toBe('Lovelace');
    expect(q('#re').files?.[0]?.name).toBe('Ada.pdf');
    expect(q<HTMLTextAreaElement>('#cl').value).toBe('Dear team, hire me.');
    expect(q<HTMLSelectElement>('#sp').value).toBe('No');
    expect([...document.querySelectorAll<HTMLInputElement>('[name=cloud]')].map((c) => c.checked)).toEqual([true, false, true]);
    expect(q('#agree').checked).toBe(false);
    expect(out.map((r) => r.status)).toEqual(['filled', 'filled', 'filled', 'filled', 'filled', 'filled', 'review', 'skipped', 'review']);
    expect(out.at(-1)!.note).toBe('this field is no longer on the page');
    expect(seen).toEqual(out);
    expect(q('#fn').hasAttribute('data-wera-filled')).toBe(true);
  });

  it('says when an approved value has no option, and when files are missing', async () => {
    const plan = planForm(document, ada);
    const id = (start: string) => byLabel(plan.fields, start).id;
    const out = await applyItems(document, [{ id: id('Will you now'), value: 'Perhaps' }, { id: id('Resume'), value: RESUME }, { id: id('Cover letter'), value: LETTER }]);
    expect(out.map((r) => [r.status, r.note])).toEqual([
      ['review', 'no option matches "Perhaps"'], ['review', 'no resume to attach'], ['review', 'write your cover letter first'],
    ]);
  });
});

describe('a cover letter upload', () => {
  beforeEach(() => {
    document.body.innerHTML = '<form><label for="cv">Cover letter</label><input id="cv" type="file" name="cover_letter"></form>';
  });

  it('is offered the letter as a PDF once one is written, and gets it attached', async () => {
    expect(planForm(document, ada).fields[0]).toMatchObject({ value: '', note: 'no cover letter for this job yet' });
    const [f] = planForm(document, ada, { coverLetter: true }).fields;
    expect(f).toMatchObject({ value: LETTER, source: 'letter', note: 'your cover letter for this job, as a PDF' });
    const [r] = await applyItems(document, [{ id: f!.id, value: LETTER }], { letterFile: { name: 'Ada_Cover_Letter.pdf', base64: btoa('%PDF-1.7') } });
    expect(r).toMatchObject({ status: 'filled', value: 'Ada_Cover_Letter.pdf' });
    expect(document.querySelector<HTMLInputElement>('#cv')!.files?.[0]?.name).toBe('Ada_Cover_Letter.pdf');
  });
});

describe('snapshot, current values and highlight', () => {
  it('reads what the user left in each field', () => {
    document.body.innerHTML = FORM;
    document.querySelector<HTMLInputElement>('#np')!.value = 'One month';
    document.querySelector<HTMLSelectElement>('#wp')!.value = 'Remote';
    document.querySelector<HTMLInputElement>('[name=cloud][value=gcp]')!.checked = true;
    document.querySelector<HTMLInputElement>('#agree')!.checked = true;
    const snap = snapshot(document);
    expect(snap.map((s) => [s.label.replace(/\s*\*$/, ''), s.value])).toEqual([
      ['Last name', 'Byron'], ['Preferred work arrangement', 'Remote'], ['What is your notice period?', 'One month'],
      ['Which clouds have you used?', 'GCP'], ['I agree to the privacy policy', 'yes'],
    ]);
    const np = collectFields(document).find((f) => classify(f) === 'notice_period')!;
    expect(currentValue(np)).toBe('One month');
    expect(highlight(document, np.id)).toBe(true);
    expect(highlight(document, 'nope')).toBe(false);
  });
});

describe('the Next button', () => {
  it('finds and presses Next, never Submit', () => {
    document.body.innerHTML = FORM;
    let pressed = 0;
    document.querySelector('#next')!.addEventListener('click', () => pressed++);
    expect(pressNext(document)).toEqual({ ok: true, label: 'Save and continue' });
    expect(pressed).toBe(1);

    document.body.innerHTML = '<form><input aria-invalid="true"><button type="button">Back</button><button type="submit">Submit application</button></form>';
    let submitted = false;
    document.querySelector('form')!.addEventListener('submit', (e) => { e.preventDefault(); submitted = true; });
    expect(findNext(document)).toMatchObject({ label: 'Submit application', final: true });
    expect(pressNext(document)).toEqual({ ok: false, label: 'Submit application', final: true });
    expect(submitted).toBe(false);
    expect(invalidCount(document)).toBe(1);

    document.body.innerHTML = '<button disabled>Next</button><button>Sign in</button>';
    expect(findNext(document)).toBeNull();
    expect(pressNext(document)).toEqual({ ok: false });

    document.body.innerHTML = '<div><button data-automation-id="bottom-navigation-next-button">Save and Continue</button></div>';
    expect(findNext(document)).toMatchObject({ final: false });
  });
});
