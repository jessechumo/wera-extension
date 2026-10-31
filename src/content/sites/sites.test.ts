import { describe, expect, it } from 'vitest';
import { collectFields } from '../fields';
import { ashby } from './ashby';
import { greenhouse } from './greenhouse';
import { lever } from './lever';
import type { Site } from './index';
import { jobvite } from './jobvite';
import { workable } from './workable';
import { workday } from './workday';

/** What a site's rules make of each field on a page, by label. */
function read(site: Site, html: string): Record<string, string | null | undefined> {
  document.body.innerHTML = html;
  return Object.fromEntries(collectFields(document).map((f) => [f.label || f.el.getAttribute('name') || f.el.id, site.purpose?.(f)]));
}

describe('site rules', () => {
  it('Workable: its job and school blocks are left to the user', () => {
    expect(workable.noBlocks).toBe(true);
    expect(workable.matches({ location: { hostname: 'apply.workable.com' } } as Document)).toBe(true);
    expect(workable.matches({ location: { hostname: 'jobs.lever.co' } } as Document)).toBe(false);
  });

  it('Workday: the way on after Apply is to fill it by hand, which Wera does', () => {
    document.body.innerHTML = '<a data-automation-id="autofillWithResume">Autofill with Resume</a><a data-automation-id="applyManually">Apply Manually</a>';
    expect(workday.applyChoice?.(document)?.textContent).toBe('Apply Manually');
    document.body.innerHTML = '<p>Posting</p>';
    expect(workday.applyChoice?.(document)).toBeNull();
  });

  it('Jobvite: the upload inputs sit in unnamed popups, matched to their Add buttons by order', () => {
    document.body.innerHTML = `
      <h3 id="h">Add Resume*</h3><button jv-add-attachment attachment-label="Resume" aria-labelledby="h">Select</button>
      <button jv-add-attachment attachment-label="Cover Letter">Add Cover Letter</button>
      <div role="dialog" aria-label="Attachment Options" class="ng-hide"><div><input id="file-input-0" type="file"></div></div>
      <div role="dialog" aria-label="Attachment Options" class="ng-hide"><div><input id="file-input-1" type="file"></div></div>`;
    expect(collectFields(document).map((f) => jobvite.purpose?.(f))).toEqual(['resume', 'cover_letter']);
  });

  it('Greenhouse job boards: its own field names, its education blocks, and the phone box\'s country picker left alone', () => {
    expect(read(greenhouse, `
      <label for="first_name">First Name</label><input id="first_name">
      <label for="preferred_name">Preferred First Name</label><input id="preferred_name">
      <label for="country">Country</label><input id="country" role="combobox">
      <label for="iti-0__search-input">Search</label><input id="iti-0__search-input" role="combobox">
      <label for="school--0">School</label><input id="school--0" role="combobox">
      <label for="start-year--0">Start year</label><input id="start-year--0">
      <label for="question_8692471006">LinkedIn Profile URL</label><input id="question_8692471006">`)).toEqual({
      'First Name': 'first_name', 'Preferred First Name': 'preferred_name', Country: 'country', Search: null,
      School: 'edu_school', 'Start year': 'edu_start',
      // The employer's own question: Wera's general rules read its label.
      'LinkedIn Profile URL': undefined,
    });
  });

  it('Lever: full name, current company, links and EEO by name, the cover letter in Additional information', () => {
    expect(read(lever, `
      <label>Full name<input name="name"></label><label>Current company<input name="org"></label>
      <label>LinkedIn URL<input name="urls[LinkedIn]"></label><label>Other website<input name="urls[Other]"></label>
      <label>Gender<select name="eeo[gender]"><option>Male</option></select></label>
      <label>Additional information<textarea name="comments"></textarea></label>
      <label>Card<input name="cards[abc][field0]"></label>`)).toEqual({
      'Full name': 'full_name', 'Current company': 'current_company', 'LinkedIn URL': 'linkedin', 'Other website': null,
      Gender: 'gender', 'Additional information': 'cover_letter', Card: undefined,
    });
  });

  it('Ashby: a group titled by its own label is named by it, not by its options\' descriptions', () => {
    document.body.innerHTML = `<fieldset><label for="_systemfield_eeoc_race">Race</label>
      <div><ul><li><p><strong>Hispanic or Latino</strong> - A person of Cuban, Mexican, Puerto Rican origin.</p></li></ul></div>
      <div><input type="radio" id="r0" name="x__systemfield_eeoc_race"><label for="r0">Hispanic or Latino</label></div>
      <div><input type="radio" id="r1" name="x__systemfield_eeoc_race"><label for="r1">White</label></div></fieldset>`;
    const [f] = collectFields(document);
    expect(f!.label).toBe('Race');
    expect(f!.options.map((o) => o.label)).toEqual(['Hispanic or Latino', 'White']);
  });

  it('Ashby: its system fields, EEO radio groups included', () => {
    expect(read(ashby, `
      <label for="_systemfield_name">Name</label><input id="_systemfield_name" name="_systemfield_name">
      <fieldset><legend>Gender</legend>
        <label><input type="radio" name="2095bc0c__systemfield_eeoc_gender" value="m">Male</label>
        <label><input type="radio" name="2095bc0c__systemfield_eeoc_gender" value="f">Female</label></fieldset>
      <label for="u1">How did you hear about this job?</label><input id="u1" name="07431658-0249">`)).toEqual({
      Name: 'full_name', Gender: 'gender', 'How did you hear about this job?': undefined,
    });
  });

  it('Workday: both naming schemes, and dates by the block they sit in', () => {
    expect(read(workday, `
      <div data-automation-id="formField-legalNameSection_firstName"><label for="a">First Name</label><input id="a" data-automation-id="legalNameSection_firstName"></div>
      <div data-automation-id="formField-phoneNumber--countryPhoneCode"><label for="b">Country Phone Code</label><input id="phoneNumber--countryPhoneCode" data-automation-id="searchBox"></div>
      <div data-automation-id="formField-phoneNumber--extension"><label for="c">Phone Extension</label><input id="phoneNumber--extension"></div>
      <div data-automation-id="workExperience-1"><div data-automation-id="formField-startDate"><label>From</label>
        <input aria-label="Month" data-automation-id="dateSectionMonth-input"></div></div>`)).toEqual({
      'First Name': 'first_name', 'Country Phone Code': 'phone_code', 'Phone Extension': null, Month: 'exp_start',
    });
  });
});
