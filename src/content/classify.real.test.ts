// What real application forms ask, read off public Greenhouse, Lever and
// Ashby forms. A detail fills only what asks for just that detail: a wrong
// answer here is a false statement on someone's application.
import { describe, expect, it } from 'vitest';
import type { FieldPurpose, Profile } from '../shared/types';
import { classify } from './classify';
import { collectFields } from './fields';
import { planForm } from './plan';

type Kind = 'text' | 'textarea' | 'select' | 'radio' | 'combobox' | 'checkbox' | 'buttons';

function at(label: string, kind: Kind = 'text', options: string[] = []): FieldPurpose | null {
  const said = label.replace(/"/g, '&quot;');
  const html: Record<Kind, string> = {
    text: `<label for="f">${label}</label><input id="f">`,
    textarea: `<label for="f">${label}</label><textarea id="f"></textarea>`,
    select: `<label for="f">${label}</label><select id="f"><option value="">Select</option>${options.map((o) => `<option>${o}</option>`).join('')}</select>`,
    radio: `<fieldset><legend>${label}</legend>${options.map((o, i) => `<label><input type="radio" name="r" value="${i}">${o}</label>`).join('')}</fieldset>`,
    combobox: `<label for="f">${label}</label><input id="f" role="combobox">`,
    checkbox: `<label><input type="checkbox" id="f"> ${label}</label>`,
    buttons: `<div role="radiogroup" aria-label="${said}">${options.map((o) => `<div role="radio" aria-label="${o}">${o}</div>`).join('')}</div>`,
  };
  document.body.innerHTML = html[kind];
  return classify(collectFields(document)[0]!);
}

const YES_NO = ['Yes', 'No'];

const me = {
  first_name: 'Ada', last_name: 'Byrne', email: 'ada@example.com', phone: '469 555 0101', address: '12 Elm St', city: 'Dallas', state: 'TX', postal_code: '75080', country: 'United States',
  current_company: 'Globex', current_title: 'Data Scientist', years_experience: '6', school: 'University of Texas at Dallas', degree: 'Master of Science', major: 'Business Analytics',
  graduation_year: '2024', gpa: '3.9', authorized_to_work: 'yes', needs_sponsorship: 'no', willing_to_relocate: 'yes', salary_expectation: '140000', start_date: '2031-01-15', citizenship: 'United States',
  how_heard: 'Company website', veteran: 'I am not a protected veteran', experience: [{ title: 'Data Scientist', company: 'Globex', current: true }, { title: 'Analyst', company: 'Grand Rounds', current: false }],
} as Profile;

/** What Wera would enter from what it knows, before any AI. */
function proposed(label: string, kind: Kind, options: string[], opts = {}): string {
  at(label, kind, options);
  return planForm(document, me, opts).fields[0]!.value;
}

describe('what real forms ask', () => {
  it('reads a question through the abbreviations in it', () => {
    const asks = 'Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)?';
    expect(at(asks, 'radio', YES_NO)).toBe('needs_sponsorship');
    expect(proposed(asks, 'radio', YES_NO)).toBe('No');
    expect(at('Do you now or will you ever need sponsorship (i.e. a work visa)?', 'radio', YES_NO)).toBe('needs_sponsorship');
    expect(at('Are you legally authorized to work in the U.S. for any employer?', 'radio', YES_NO)).toBe('authorized_to_work');
    expect(proposed('Are you legally authorized to work in the U.S. for any employer?', 'radio', YES_NO)).toBe('Yes');
  });

  it('leaves to the AI what asks more than the detail it mentions', () => {
    for (const [label, kind, options] of [
      ['How many years of primary or urgent care experience do you have post residency?', 'radio', ['0-2', '3-5', '6+']],
      ['How many years of full time growth marketing experience do you have?', 'radio', ['0 - 4 years', '5+ years']],
      ['How many years of hands-on experience do you have performing month-end close activities?', 'radio', ['0-1', '2+']],
      ['How many years of experience do you have with Python?', 'select', ['1', '2', '3+']],
      ['Do you currently live within a commutable distance to our Sunnyvale location? Please note, you may visit the office.', 'radio', ['Yes, currently live within a commutable distance', 'No, but willing to relocate', 'No']],
      ['Shield AI provides technology, services, and support to the United States military and allied forces worldwide. Are you comfortable with this?', 'radio', YES_NO],
      ['Have you ever been directly employed by (1) any government or military entity, state-owned enterprise', 'buttons', YES_NO],
      ['What year did you graduate high school?', 'select', ['2010', '2011', '2012']],
      ['Please specify the grading scale used by your current school.', 'combobox', []],
      ['Astranis complies with U.S. Government space technology export regulations, therefore will you state whether you are a U.S. person', 'combobox', []],
      ['We’d love to learn more about your working preferences. Komodo Health strives to ensure that its employees in every state are supported', 'combobox', []],
      ['To which location are you applying to?', 'combobox', []],
      ['Which location are you applying for?', 'select', ['Remote, United States', 'New York']],
      ['This role requires you to be onsite in our Mexico City workspace ~2 days/week, are you open to this schedule?', 'radio', YES_NO],
      ['This position requires working onsite at our Redwood City, CA office five days a week. Are you able to do so?', 'radio', YES_NO],
      ['We work under a hybrid in-office model. Are you willing to work from our office location 3 days per week?', 'combobox', []],
      ['What Jam City locations are you interested in? Please select all that apply.', 'select', ['Burbank', 'Toronto']],
      ['Preferred Location (In Office)', 'select', ['Austin', 'Boston']],
      ['What degree are you currently pursuing?', 'radio', ['BS', 'MS', 'PhD']],
      ['Start Date at Current School:', 'select', ['2023', '2024']],
      ['Do you require relocation for this role?', 'radio', ['Yes, I require relocation', 'No']],
      ['Do you have plans to relocate within the next 12 months?', 'combobox', []],
      ['Are you currently located in, or willing to relocate to, the greater Chicago area and able to work on site?', 'combobox', []],
      ['What US time zone are you located in?', 'radio', ['Eastern', 'Central', 'Pacific']],
      ['Our compensation is standardized based on roles and responsibilities. This ensures equitable compensation for every employee.', 'combobox', []],
      ['US Export Control laws 2026: Do you hold an ADDITIONAL citizenship, nationality, or permanent residency?', 'combobox', []],
      ['Your authorization to work in the country where you live:', 'combobox', []],
      ['Are you proficient with Salesforce or a similar CRM?', 'radio', YES_NO],
    ] as [string, Kind, string[]][]) expect(proposed(label, kind, options), label).toBe('');
  });

  it('takes an open box for a question, not for the detail it mentions', () => {
    for (const [label, kind] of [
      ['School Minor:', 'textarea'],
      ['What is your country of birth?', 'text'],
      ['Do you have quota-carrying software sales experience?', 'text'],
      ['How are you using AI in your current role?', 'textarea'],
    ] as [string, Kind][]) expect(at(label, kind), label).toBe('question');
  });

  it('never takes a statement to accept for an answer', () => {
    for (const [label, kind] of [
      ["I confirm that I have read and acknowledged Code for America's posted salary information for this position", 'combobox'],
      ['By selecting "I agree," I understand that the information I have provided as part of this job application is true', 'combobox'],
      ['Do you consent to the use of an AI notetaker during your interviews?', 'combobox'],
      ["I have read and understand Tailscale's Candidate Privacy Policy and AI Guidelines", 'combobox'],
      ['Please read and acknowledge the following requirements for all jobs at Code for America:', 'combobox'],
      ['I understand', 'checkbox'],
    ] as [string, Kind][]) expect(at(label, kind), label).toBe('consent');
    expect(at('I understand that the information I submit will be used in accordance with the privacy policy', 'radio', ['Yes'])).toBe('consent');
  });

  it('still knows the plain questions', () => {
    for (const [label, kind, options, want] of [
      ['How many years of experience do you have?', 'text', [], 'years_experience'],
      ['Which state do you currently reside in?', 'combobox', [], 'state'],
      ['Which state do you currently live in?', 'select', ['Texas', 'Ohio'], 'state'],
      ['What is your primary state of residence?', 'select', ['Texas', 'Ohio'], 'state'],
      ['State you will be working from', 'combobox', [], 'state'],
      ['Current Address (Province - if applicable)', 'text', [], 'state'],
      ['Current Address (Country)', 'select', ['Canada'], 'country'],
      ['What is your current country of residence?', 'combobox', [], 'country'],
      ['Passport Country', 'text', [], 'citizenship'],
      ['What citizenships do you currently hold? Select all that apply.', 'combobox', [], 'citizenship'],
      ['What city and state are you located in?', 'text', [], 'location'],
      ['Where do you currently reside? (City, State)', 'text', [], 'location'],
      ['Please provide your current city and state.', 'text', [], 'location'],
      ['What is your current location (city, state and country)? Write anything to display the options.', 'combobox', [], 'location'],
      ['In which city and state do you currently reside? This information helps us align with our pre-determined pay ranges.', 'combobox', [], 'location'],
      ['Where are you currently located?', 'combobox', [], 'location'],
      ['What location do you intend to work from?', 'combobox', [], 'location'],
      ['Please list your city of residence.', 'text', [], 'city'],
      ['Are you currently located in the United States?', 'buttons', YES_NO, 'in_country'],
      ['Are you located in the area listed for this role?', 'combobox', [], 'in_country'],
      ['Please provide the name of your current (or most recent) company', 'text', [], 'current_company'],
      ['Current or most recent company?', 'text', [], 'current_company'],
      ['Did someone connected with Socket refer you for this role?', 'text', [], 'referral'],
      ['What date are you available to begin employment (Month and Year)', 'textarea', [], 'start_date'],
      ['Please share your soonest available start date:', 'text', [], 'start_date'],
      ['When can you start a new role?', 'text', [], 'start_date'],
      ['What is your annual salary expectation as Independent Contractor in USD?', 'textarea', [], 'salary_expectation'],
      ['What are your salary expectations?', 'text', [], 'salary_expectation'],
      ['What is your desired annual compensation?', 'text', [], 'salary_expectation'],
      ['Please provide your total cash compensation expectations for this role.', 'text', [], 'salary_expectation'],
      ['What is your minimum annual salary expectation?', 'select', ['$100k', '$150k'], 'salary_expectation'],
      ['Desired salary', 'text', [], 'salary_expectation'],
      ['How did you hear about us? LinkedIn, a friend, other', 'text', [], 'how_heard'],
      ['How did you hear about Huntress? Company page, job posting, event, somewhere else?', 'text', [], 'how_heard'],
      ['This position may require relocation. Are you willing to relocate for this role?', 'combobox', [], 'willing_to_relocate'],
      ['Are you willing to relocate?', 'combobox', [], 'willing_to_relocate'],
      ['Are you a veteran or active member of the United States Armed Forces?', 'combobox', [], 'veteran'],
      ['Are you a veteran/have you served in the military?', 'combobox', [], 'veteran'],
      ['Are you authorized to work in the United States?', 'radio', YES_NO, 'authorized_to_work'],
      ['Will you now or in the future require visa sponsorship to work in the United States?', 'radio', YES_NO, 'needs_sponsorship'],
      ['Are you eligible to work in the U.S. without the need of sponsorship now or in the future?', 'select', YES_NO, 'authorized_no_sponsorship'],
      ['Do you have a disability or chronic condition (physical, visual, auditory, cognitive, mental, emotional, or other)?', 'combobox', [], 'disability'],
      ['What is your highest level of education?', 'combobox', [], 'degree'],
      ['Highest Education Completed?', 'select', ['BS', 'MS'], 'degree'],
      ['School', 'combobox', [], 'school'],
      ['Select a university or college', 'combobox', [], 'school'],
      ['Which university are you currently attending or did you last attend?', 'select', ['MIT'], 'school'],
      ['What was your major field of study?', 'text', [], 'major'],
      ['School Major:', 'textarea', [], 'major'],
      ['When did you graduate, or when do you expect to graduate?', 'combobox', [], 'graduation_year'],
      ['Please indicate your overall GPA.', 'combobox', [], 'gpa'],
      ['Please state your full legal name:', 'text', [], 'full_name'],
    ] as [string, Kind, string[], FieldPurpose][]) expect(at(label, kind, options), label).toBe(want);
  });
});

describe('answers that depend on the job', () => {
  it('says the user may work where they live, not everywhere', () => {
    expect(proposed('Are you authorized to work in the United States?', 'radio', YES_NO)).toBe('Yes');
    expect(proposed('Are you authorized to work in Canada?', 'radio', YES_NO)).toBe('');
    expect(proposed('Are you legally authorized to work in the UK?', 'combobox', [])).toBe('');
    expect(proposed('Will you require sponsorship to work in Germany?', 'radio', YES_NO)).toBe('');
    // "The country where the job is": the job's location says which.
    expect(proposed('Are you authorized to work in the country where the job is located?', 'radio', YES_NO, { jobLocation: 'Austin, TX, United States' })).toBe('Yes');
    expect(proposed('Are you authorized to work in the country where the job is located?', 'radio', YES_NO, { jobLocation: 'Toronto, Ontario, Canada' })).toBe('');
    expect(proposed('Do you require sponsorship?', 'radio', YES_NO, { jobLocation: 'London, UK' })).toBe('');
    expect(proposed('Do you require sponsorship?', 'radio', YES_NO, { jobLocation: 'Remote' })).toBe('No');
  });

  it('knows the user\'s past employers, however many a question names', () => {
    expect(proposed('Have you previously worked for Grand Rounds, Included Health, or Doctor on Demand as a permanent or temporary employee?', 'radio', YES_NO, { company: 'Included Health' })).toBe('Yes');
    expect(proposed('Have you previously worked for FireFly as a permanent or temporary employee?', 'radio', YES_NO, { company: 'FireFly' })).toBe('No');
    // Whether an employer was a customer of this one is not on a resume.
    expect(proposed('Have you worked for an Entrata customer in the past 12 months?', 'radio', YES_NO, { company: 'Entrata' })).toBe('');
  });

  it('does not pick among several ways of saying yes', () => {
    expect(proposed('Are you willing to relocate?', 'radio', ['Yes, I already live nearby', 'Yes, I am willing to relocate', 'No'])).toBe('');
    expect(proposed('Are you willing to relocate?', 'radio', ['Yes, I am willing to relocate', 'No, I am not'])).toBe('Yes, I am willing to relocate');
  });
});

describe('uploads as real systems draw them', () => {
  const purposes = () => collectFields(document).map((f) => [f.label, classify(f)]);

  it('Rippling: its one resume field says it is read, and its test ids say what each takes', () => {
    document.body.innerHTML = `<form><div><div>Résumé*</div><label><input type="file" accept=".doc,.docx,.pdf" data-testid="input-resume"><span>Total 0 file selected Drop or select (.doc / .docx / .pdf)</span></label><p>The résumé will be parsed to fill in the application details.</p></div></form>`;
    expect(classify(collectFields(document)[0]!)).toBe('resume');
    document.body.innerHTML = `<form><div><label><input type="file" accept=".pdf" data-testid="input-cover_letter"><span>Drop or select (.doc / .docx / .pdf)</span></label></div></form>`;
    expect(classify(collectFields(document)[0]!)).toBe('cover_letter');
  });

  it('Breezy: skips the parser\'s dropzone, and finds the resume field under its heading', () => {
    document.body.innerHTML = `<div><h3>Fill in with Resume</h3><p>Upload your resume to fill in the data automatically</p><div><input type="file" aria-label="Upload a file" data-testid="public-resume-parser-dropzone"></div></div>
      <section><div>RESUME*</div><div><div><input type="file" aria-label="Upload a file"><span>Click to upload a file or drag and drop .pdf, .doc</span></div></div></section>`;
    expect(purposes().map(([, p]) => p)).toEqual([null, 'resume']);
  });

  it('Ashby: "Autofill from resume" is not the resume field', () => {
    document.body.innerHTML = `<div><label for="a">Autofill from resume</label><p>Upload your resume here to autofill key application fields.</p><input id="a" type="file"></div>`;
    expect(purposes()[0]![1]).toBeNull();
  });

  it('a web component\'s upload reads the heading outside it', () => {
    document.body.innerHTML = `<section><h3>Cover letter</h3><x-drop></x-drop></section>`;
    const root = document.querySelector('x-drop')!.attachShadow({ mode: 'open' });
    root.innerHTML = `<input type="file" aria-label="Choose a file or drop it here">`;
    expect(purposes()[0]).toEqual(['Cover letter', 'cover_letter']);
  });

  it('a dropdown named "Select" for screen readers reads the question beside it', () => {
    document.body.innerHTML = `<div><div>Do you require sponsorship now or in the future to work in the US</div><div role="combobox" aria-label="Select" tabindex="0">Select</div></div>`;
    expect(purposes()[0]).toEqual(['Do you require sponsorship now or in the future to work in the US', 'needs_sponsorship']);
  });

  it('leaves other names to the user', () => {
    expect(at('First Name (Other)')).toBeNull();
    expect(at('Other names you have used')).toBeNull();
  });
});

describe('labels that do not say', () => {
  it('reads the question over a lone tick box labelled "Yes"', () => {
    document.body.innerHTML = `<li><div class="q"><div>Are you comfortable with this schedule? ✱</div></div><ul><li><label><input type="checkbox" name="c" value="Yes"><span>Yes</span></label></li></ul></li>`;
    const [f] = collectFields(document);
    expect(f!.label).toBe('Are you comfortable with this schedule?');
    expect(f!.required).toBe(true);
  });

  it('keeps what a tick box says for itself', () => {
    document.body.innerHTML = `<div><p>Job 1</p><label><input type="checkbox" name="c"> I currently work here</label></div>`;
    expect(collectFields(document)[0]!.label).toBe('I currently work here');
  });

  it('reads a bare "I understand" with the statement it accepts', () => {
    document.body.innerHTML = `<li><div>All offers depend on a background check.</div><label><input type="checkbox" name="u"> I understand</label></li>`;
    const [f] = collectFields(document);
    expect(f!.label).toBe('All offers depend on a background check. I understand');
    expect(classify(f!)).toBe('consent');
  });

  it('reads the title over an upload labelled by its button', () => {
    document.body.innerHTML = `<div role="group" aria-labelledby="t"><div id="t">Cover Letter</div><label for="cover">Attach</label><input id="cover" type="file"></div>`;
    expect(collectFields(document)[0]!.label).toBe('Cover Letter');
  });
});
