// A Workday application page as the extension meets it: data-automation-id
// fields, button dropdowns whose list pops up at the end of the page,
// "prompt" search boxes that search on Enter and show the pick as a pill,
// split month/year date boxes, and Work Experience blocks with an Add
// button. Built from Workday's markup; behaviors are wired by wireWorkday.

const dropdown = (id: string, label: string, options: string[]) => `
  <div data-automation-id="formField-${id}"><label for="${id}">${label}<abbr>*</abbr></label>
    <button type="button" id="${id}" aria-haspopup="listbox" data-automation-id="${id}Dropdown" data-options="${options.join('|')}">Select One</button></div>`;

const prompt = (id: string, label: string, options: string[]) => `
  <div data-automation-id="formField-${id}" data-uxi-widget-type="multiselect"><label for="${id}">${label}</label>
    <div data-automation-id="multiselectInputContainer"><div data-automation-id="selectedItemList"></div>
      <input id="${id}" data-automation-id="searchBox" placeholder="Search" data-options="${options.join('|')}"></div></div>`;

const date = (label: string) => `
  <div data-automation-id="formField-${label.toLowerCase()}Date"><label>${label}</label>
    <div data-automation-id="dateInputWrapper">
      <input role="spinbutton" aria-label="Month" placeholder="MM" data-automation-id="dateSectionMonth-input">
      <input role="spinbutton" aria-label="Year" placeholder="YYYY" data-automation-id="dateSectionYear-input"></div></div>`;

export const workdayJob = (n: number) => `
  <div data-automation-id="workExperience-${n}" role="group" aria-labelledby="wh-${n}"><h4 id="wh-${n}">Work Experience ${n}</h4>
    <div><label for="jt-${n}">Job Title<abbr>*</abbr></label><input id="jt-${n}" data-automation-id="jobTitle"></div>
    <div><label for="co-${n}">Company<abbr>*</abbr></label><input id="co-${n}" data-automation-id="company"></div>
    <div><input type="checkbox" id="cw-${n}" data-automation-id="currentlyWorkHere"><label for="cw-${n}">I currently work here</label></div>
    ${date('From')}${date('To')}
    <div><label for="rd-${n}">Role Description</label><textarea id="rd-${n}" data-automation-id="description"></textarea></div></div>`;

export const WORKDAY = `<div data-automation-id="applyFlowPage">
  <h2 data-automation-id="pageHeader">My Information</h2>
  ${dropdown('country', 'Country', ['Canada', 'United States of America', 'Kenya'])}
  ${prompt('source', 'How Did You Hear About Us?', ['LinkedIn', 'Company Website', 'Indeed'])}
  <fieldset><legend>Have you previously worked for Acme?</legend>
    <label><input type="radio" name="prev" value="1">Yes</label><label><input type="radio" name="prev" value="0">No</label></fieldset>
  <div><label for="fn">First Name<abbr>*</abbr></label><input id="fn" data-automation-id="legalNameSection_firstName"></div>
  <div><label for="ln">Last Name<abbr>*</abbr></label><input id="ln" data-automation-id="legalNameSection_lastName"></div>
  <div><label for="city">City</label><input id="city" data-automation-id="addressSection_city"></div>
  ${dropdown('state', 'State', ['California', 'Texas', 'Washington'])}
  <div><label for="em">Email</label><input id="em" data-automation-id="email"></div>
  ${dropdown('phoneType', 'Phone Device Type', ['Landline', 'Mobile'])}
  ${prompt('phoneCode', 'Country Phone Code', ['Canada (+1)', 'United States of America (+1)', 'Kenya (+254)'])}
  <div><label for="ph">Phone Number<abbr>*</abbr></label><input id="ph" data-automation-id="phone-number"></div>
  <h3>Work Experience</h3>
  <div data-automation-id="workExperienceSection"><div id="jobs"></div><button type="button" data-automation-id="Add" id="addJob">Add</button></div>
  <h3>Education</h3>
  <div data-automation-id="educationSection">
    <div data-automation-id="education-1">
      ${prompt('school', 'School or University', ['University of Texas at Austin', 'The University of Texas at Dallas'])}
      ${dropdown('degree', 'Degree', ['High School Diploma', "Bachelor's Degree", "Master's Degree"])}
    </div>
  </div>
  ${dropdown('gender', 'Gender', ['Male', 'Female', 'I do not wish to answer'])}
  <button type="button" data-automation-id="pageFooterNextButton">Save and Continue</button>
</div>`;

/** Wires the page the way Workday behaves. */
export function wireWorkday(doc: Document) {
  // Button dropdowns: a list pops up at the end of the page; a click picks.
  for (const b of doc.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="listbox"]')) {
    b.addEventListener('click', () => {
      doc.querySelectorAll('[data-automation-widget="wd-popup"]').forEach((p) => p.remove());
      const pop = doc.createElement('div');
      pop.setAttribute('data-automation-widget', 'wd-popup');
      pop.innerHTML = `<ul role="listbox">${b.dataset.options!.split('|').map((o) => `<li role="option"><div>${o}</div></li>`).join('')}</ul>`;
      pop.querySelectorAll('li').forEach((li) => li.addEventListener('click', () => {
        b.textContent = li.textContent;
        pop.remove();
      }));
      doc.body.append(pop);
    });
  }
  // Prompts: Enter searches; the result list shows under the box; a click adds a pill and clears the box.
  for (const input of doc.querySelectorAll<HTMLInputElement>('input[data-automation-id="searchBox"]')) {
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const container = input.closest('[data-uxi-widget-type="multiselect"]')!;
      container.querySelector('[data-automation-id="promptResults"]')?.remove();
      const q = input.value.toLowerCase();
      const res = doc.createElement('div');
      res.setAttribute('data-automation-id', 'promptResults');
      for (const o of input.dataset.options!.split('|').filter((x) => !q || x.toLowerCase().includes(q))) {
        const opt = doc.createElement('div');
        opt.setAttribute('data-automation-id', 'promptOption');
        opt.setAttribute('data-automation-label', o);
        opt.textContent = o;
        opt.addEventListener('click', () => {
          container.querySelector('[data-automation-id="selectedItemList"]')!.innerHTML = `<div data-automation-id="selectedItem">${o}</div>`;
          input.value = '';
          res.remove();
        });
        res.append(opt);
      }
      container.append(res);
    });
  }
  // Add: a new Work Experience block.
  let n = 0;
  doc.querySelector('#addJob')!.addEventListener('click', () => {
    doc.querySelector('#jobs')!.insertAdjacentHTML('beforeend', workdayJob(++n));
  });
}
