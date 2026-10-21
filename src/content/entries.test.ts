import { beforeEach, describe, expect, it } from 'vitest';
import type { FieldPlan, Profile } from '../shared/types';
import { addEntries, applyItems, planForm } from './plan';

const profile: Profile = {
  first_name: 'Jesse', last_name: 'Chumo', preferred_name: '', email: 'jesse@example.com', phone: '469 555 0101', address: '',
  city: 'Dallas', state: 'TX', postal_code: '', country: 'United States', linkedin: '', github: '', portfolio: '',
  current_company: 'Globex', current_title: 'Data Scientist', years_experience: '4', school: 'UT Dallas', degree: 'Master of Science',
  major: 'Business Analytics', graduation_year: '2024', gpa: '3.9', authorized_to_work: 'yes', needs_sponsorship: 'yes',
  willing_to_relocate: '', salary_expectation: '', start_date: '', how_heard: '', gender: 'Male', pronouns: '', race: 'Black or African American',
  hispanic: 'no', veteran: 'I am not a protected veteran', disability: 'No, I do not have a disability',
  experience: [
    { title: 'Data Scientist', company: 'Globex', location: 'Dallas, TX', start: '2024-06', current: true, description: 'Built churn models\nShipped dashboards' },
    { title: 'Data Analyst', company: 'Acme Analytics', location: 'Nairobi, Kenya', start: '2020-06', end: '2022-07', current: false, description: 'Cut costs 10%' },
  ],
  education: [
    { school: 'University of Texas at Dallas', degree: 'Master of Science', level: 'master', major: 'Business Analytics', start: '2022-08', end: '2024-05', gpa: '3.9' },
    { school: 'Moi University', degree: 'B.S.', level: 'bachelor', major: 'Computer Science', end: '2019' },
  ],
  skills: ['Python', 'SQL', 'Tableau'],
};

const by = (fields: FieldPlan[], label: string, entry?: number) => {
  const f = fields.find((x) => x.label.startsWith(label) && (entry === undefined || x.entry === entry));
  if (!f) throw new Error(`no field "${label}"${entry !== undefined ? ` in block ${entry}` : ''}: ${fields.map((x) => `${x.label}#${x.entry}`).join(', ')}`);
  return f;
};

// Workday's "My Experience" page: one block per job, split month/year date boxes.
const workdayJob = (n: number) => `
  <div data-automation-id="workExperience-${n}" role="group" aria-labelledby="we${n}">
    <h4 id="we${n}">Work Experience ${n}</h4>
    <div><label for="jt${n}">Job Title *</label><input id="jt${n}" data-automation-id="jobTitle"></div>
    <div><label for="co${n}">Company *</label><input id="co${n}" data-automation-id="company"></div>
    <div><label for="lo${n}">Location</label><input id="lo${n}" data-automation-id="location"></div>
    <div><input type="checkbox" id="cw${n}" data-automation-id="currentlyWorkHere"><label for="cw${n}">I currently work here</label></div>
    <div role="group" aria-label="From"><span>From *</span>
      <input aria-label="Month" placeholder="MM" data-automation-id="dateSectionMonth-input" id="fm${n}">
      <input aria-label="Year" placeholder="YYYY" data-automation-id="dateSectionYear-input" id="fy${n}"></div>
    <div role="group" aria-label="To"><span>To</span>
      <input aria-label="Month" placeholder="MM" data-automation-id="dateSectionMonth-input" id="tm${n}">
      <input aria-label="Year" placeholder="YYYY" data-automation-id="dateSectionYear-input" id="ty${n}"></div>
    <div><label for="rd${n}">Role Description</label><textarea id="rd${n}"></textarea></div>
  </div>`;

const WORKDAY = `<form>
  <h2>My Experience</h2>
  <section data-automation-id="workExperienceSection"><h3>Work Experience</h3>${workdayJob(1)}${workdayJob(2)}</section>
  <section data-automation-id="educationSection"><h3>Education</h3>
    <div data-automation-id="education-1">
      <div><label for="sc">School or University *</label><input id="sc"></div>
      <div><label for="dg">Degree *</label><select id="dg"><option value="">Select One</option><option>High School or Equivalent</option><option>Bachelors</option><option>Masters</option><option>Doctorate</option></select></div>
      <div><label for="fs">Field of Study</label><input id="fs"></div>
      <div><label for="gp">Overall Result (GPA)</label><input id="gp"></div>
      <div role="group" aria-label="From"><span>From</span><input aria-label="Year" placeholder="YYYY" id="ef"></div>
      <div role="group" aria-label="To (Actual or Expected)"><span>To (Actual or Expected)</span><input aria-label="Year" placeholder="YYYY" id="et"></div>
    </div>
  </section>
  <section><h3>Websites</h3><div><label for="li">LinkedIn</label><input id="li"></div></section>
</form>`;

describe('job and school blocks', () => {
  beforeEach(() => {
    document.body.innerHTML = WORKDAY;
  });

  it('fills each job block from the resume, in order, dates split as the boxes ask', () => {
    const { fields } = planForm(document, profile);
    expect(by(fields, 'Job Title', 0)).toMatchObject({ purpose: 'exp_title', value: 'Data Scientist', source: 'resume', note: 'First job on your resume' });
    expect(by(fields, 'Company', 0).value).toBe('Globex');
    expect(by(fields, 'Job Title', 1).value).toBe('Data Analyst');
    expect(by(fields, 'Company', 1).value).toBe('Acme Analytics');
    expect(by(fields, 'Location', 1).value).toBe('Nairobi, Kenya');
    // The job's own location, not the applicant's city.
    expect(by(fields, 'Location', 0).value).toBe('Dallas, TX');
    expect(by(fields, 'I currently work here', 0).value).toBe('yes');
    expect(by(fields, 'I currently work here', 1).value).toBe('');
    const months0 = fields.filter((f) => f.entry === 0 && f.label === 'Month');
    const years1 = fields.filter((f) => f.entry === 1 && f.label === 'Year');
    expect(months0.map((f) => [f.purpose, f.value])).toEqual([['exp_start', '06'], ['exp_end', '']]);
    expect(years1.map((f) => [f.purpose, f.value])).toEqual([['exp_start', '2020'], ['exp_end', '2022']]);
    expect(by(fields, 'Role Description', 1).value).toBe('Cut costs 10%');
  });

  it('fills the school block: degree by level from the dropdown, field of study, GPA, years', () => {
    const { fields } = planForm(document, profile);
    expect(by(fields, 'School or University')).toMatchObject({ purpose: 'edu_school', value: 'University of Texas at Dallas' });
    expect(by(fields, 'Degree')).toMatchObject({ purpose: 'edu_degree', value: 'Masters' });
    expect(by(fields, 'Field of Study').value).toBe('Business Analytics');
    expect(by(fields, 'Overall Result').value).toBe('3.9');
    const years = fields.filter((f) => f.purpose === 'edu_start' || f.purpose === 'edu_end');
    expect(years.map((f) => [f.purpose, f.value])).toEqual([['edu_start', '2022'], ['edu_end', '2024']]);
    // Outside the blocks, details stay details.
    expect(by(fields, 'LinkedIn').purpose).toBe('linkedin');
  });

  it('enters the planned values into the page', async () => {
    const { fields } = planForm(document, profile);
    const items = fields.filter((f) => f.value).map((f) => ({ id: f.id, value: f.value }));
    const out = await applyItems(document, items);
    expect(out.filter((r) => r.status !== 'filled')).toEqual([]);
    expect(document.querySelector<HTMLInputElement>('#jt2')!.value).toBe('Data Analyst');
    expect(document.querySelector<HTMLInputElement>('#fm1')!.value).toBe('06');
    expect(document.querySelector<HTMLInputElement>('#cw1')!.checked).toBe(true);
    expect(document.querySelector<HTMLSelectElement>('#dg')!.selectedOptions[0]!.textContent).toBe('Masters');
  });
});

describe('other layouts', () => {
  it('a Greenhouse-style education section with month dropdowns and a year box', () => {
    document.body.innerHTML = `<form><h3>Education</h3><div class="education">
      <label for="s">School</label><input id="s">
      <label for="d">Degree</label><select id="d"><option value="">Select</option><option>Associate's Degree</option><option>Bachelor's Degree</option><option>Master's Degree</option><option>Doctor of Philosophy (Ph.D.)</option></select>
      <label for="m">Discipline</label><input id="m">
      <label for="em">End date month</label><select id="em"><option value="">Month</option><option>Jan</option><option>Feb</option><option>Mar</option><option>Apr</option><option>May</option><option>Jun</option></select>
      <label for="ey">End date year</label><input id="ey" placeholder="YYYY">
    </div></form>`;
    const { fields } = planForm(document, profile);
    expect(by(fields, 'Degree').value).toBe("Master's Degree");
    expect(by(fields, 'Discipline').value).toBe('Business Analytics');
    expect(by(fields, 'End date month')).toMatchObject({ purpose: 'edu_end', value: 'May' });
    expect(by(fields, 'End date year').value).toBe('2024');
  });

  it('an employment history with month inputs and an MM/YYYY box', () => {
    document.body.innerHTML = `<form><fieldset><legend>Employment History</legend>
      <label for="e">Employer</label><input id="e"><label for="t">Position</label><input id="t">
      <label for="sd">Start date</label><input id="sd" type="month">
      <label for="ed">End date</label><input id="ed" placeholder="MM/YYYY">
      <label for="c">City</label><input id="c">
    </fieldset></form>`;
    const { fields } = planForm(document, { ...profile, experience: [profile.experience![1]!] });
    expect(by(fields, 'Employer').value).toBe('Acme Analytics');
    expect(by(fields, 'Position').value).toBe('Data Analyst');
    expect(by(fields, 'Start date').value).toBe('2020-06');
    expect(by(fields, 'End date').value).toBe('07/2022');
    expect(by(fields, 'City')).toMatchObject({ purpose: 'exp_location', value: 'Nairobi, Kenya' });
  });

  it('single "current employer" questions outside a block use the details', () => {
    document.body.innerHTML = `<form><label for="c">Current employer</label><input id="c"><label for="t">Current job title</label><input id="t">
      <label for="s">Skills</label><input id="s"></form>`;
    const { fields } = planForm(document, profile);
    expect(by(fields, 'Current employer')).toMatchObject({ purpose: 'current_company', value: 'Globex' });
    expect(by(fields, 'Current job title').value).toBe('Data Scientist');
    expect(by(fields, 'Skills')).toMatchObject({ purpose: 'skills', value: 'Python, SQL, Tableau' });
  });

  it('says when a block has no job on the resume to fill it', () => {
    document.body.innerHTML = `<form><section data-automation-id="workExperienceSection"><h3>Work Experience</h3>${workdayJob(1)}</section></form>`;
    const { fields } = planForm(document, { ...profile, experience: [] });
    expect(by(fields, 'Job Title')).toMatchObject({ value: '', note: 'your resume lists 0 jobs' });
  });
});

describe('Add buttons', () => {
  it('reports a section with fewer blocks than the resume, and adds them', async () => {
    document.body.innerHTML = `<form><section data-automation-id="workExperienceSection"><h3>Work Experience</h3><div id="list"></div><button type="button" id="add">Add</button></section></form>`;
    let n = 0;
    document.querySelector('#add')!.addEventListener('click', () => {
      n++;
      document.querySelector('#list')!.insertAdjacentHTML('beforeend', workdayJob(n));
      if (n === 1) document.querySelector('#add')!.textContent = 'Add Another';
    });
    expect(planForm(document, profile).adders).toEqual([{ section: 'experience', missing: 2 }]);
    expect(await addEntries(document, 'experience', 2, 5)).toBe(2);
    const plan = planForm(document, profile);
    expect(plan.adders).toEqual([]);
    expect(by(plan.fields, 'Job Title', 1).value).toBe('Data Analyst');
  });
});
