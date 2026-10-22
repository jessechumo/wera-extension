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

// A newer Workday tenant: ids like "name--legalName--firstName", a progress
// bar, a radio group drawn without radio inputs, "How did you hear" as a
// menu of categories, skills as several pills, and the self-identification
// form's split month/day/year date.
const prompt2 = (id: string, wrap: string, label: string) => `
  <div data-automation-id="formField-${wrap}" data-uxi-widget-type="multiselect"><label for="${id}">${label}</label>
    <div data-automation-id="multiselectInputContainer"><div data-automation-id="selectedItemList"></div>
      <input id="${id}" data-automation-id="searchBox" placeholder="Search"></div></div>`;

export const WORKDAY_NEW = `<div data-automation-id="applyFlowPage">
  <ol data-automation-id="progressBar">
    <li data-automation-id="progressBarCompletedStep">My Information</li>
    <li data-automation-id="progressBarActiveStep">current step 2 of 4 My Experience</li>
    <li data-automation-id="progressBarInactiveStep">Voluntary Disclosures</li>
    <li data-automation-id="progressBarInactiveStep">Review</li>
  </ol>
  <h2 data-automation-id="pageHeader">My Experience</h2>
  <div data-automation-id="formField-legalName--firstName"><label for="name--legalName--firstName">First Name</label><input id="name--legalName--firstName"></div>
  <div data-automation-id="formField-legalName--lastName"><label for="name--legalName--lastName">Last Name</label><input id="name--legalName--lastName"></div>
  <div data-automation-id="formField-candidateIsPreviousWorker">
    <div role="radiogroup" aria-labelledby="pw-l"><span id="pw-l">Have you previously worked for Acme?</span>
      <div role="radio" aria-checked="false" tabindex="0">Yes</div><div role="radio" aria-checked="false" tabindex="-1">No</div></div></div>
  ${prompt2('source--source', 'source', 'How Did You Hear About Us?')}
  ${prompt2('skills--skills', 'skills', 'Type to Add Skills')}
  <div data-automation-id="formField-selfIdentifiedDisabilityData--dateSignedOn"><label>Date</label>
    <div data-automation-id="dateInputWrapper">
      <input role="spinbutton" aria-label="Month" data-automation-id="dateSectionMonth-input">
      <input role="spinbutton" aria-label="Day" data-automation-id="dateSectionDay-input">
      <input role="spinbutton" aria-label="Year" data-automation-id="dateSectionYear-input"></div></div>
  <div data-automation-id="bottom-navigation"><button type="button" data-automation-id="bottom-navigation-previous-button">Back</button>
    <button type="button" data-automation-id="bottom-navigation-next-button">Save and Continue</button></div>
</div>`;

const SOURCES: Record<string, string[]> = { 'Job Board': ['Indeed', 'Glassdoor'], 'Social Media': ['LinkedIn', 'Twitter'], 'Company Website': [] };
const SKILLS = ['Python', 'SQL', 'Go', 'Tableau', 'Kubernetes'];

/** Wires the newer page the way Workday behaves. */
export function wireWorkdayNew(doc: Document) {
  // The radio group: a click checks one.
  const group = doc.querySelector('[role="radiogroup"]')!;
  for (const r of group.querySelectorAll('[role="radio"]')) {
    r.addEventListener('click', () => group.querySelectorAll('[role="radio"]').forEach((x) => x.setAttribute('aria-checked', String(x === r))));
  }
  const show = (input: HTMLInputElement, labels: string[], onPick: (l: string) => void) => {
    const box = input.closest('[data-uxi-widget-type="multiselect"]')!;
    box.querySelector('[data-automation-id="activeListContainer"]')?.remove();
    const list = doc.createElement('div');
    list.setAttribute('data-automation-id', 'activeListContainer');
    list.setAttribute('role', 'listbox');
    if (!labels.length) list.textContent = 'No Items.';
    for (const l of labels) {
      const o = doc.createElement('div');
      o.setAttribute('role', 'option');
      o.setAttribute('data-automation-label', l);
      o.textContent = l;
      o.addEventListener('click', () => onPick(l));
      list.append(o);
    }
    box.append(list);
  };
  const pillIn = (input: HTMLInputElement, l: string, many: boolean) => {
    const pills = input.closest('[data-uxi-widget-type="multiselect"]')!.querySelector('[data-automation-id="selectedItemList"]')!;
    const p = `<div data-automation-id="selectedItem">${l}</div>`;
    pills.innerHTML = many ? pills.innerHTML + p : p;
    input.value = '';
    input.closest('[data-uxi-widget-type="multiselect"]')!.querySelector('[data-automation-id="activeListContainer"]')?.remove();
  };
  // How did you hear: Enter on nothing lists the categories; a category opens its sources; a search lists matching sources.
  const source = doc.querySelector<HTMLInputElement>('#source--source')!;
  const pickSource = (l: string) => (SOURCES[l]?.length ? show(source, SOURCES[l], pickSource) : pillIn(source, l, false));
  source.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const q = source.value.toLowerCase();
    const leaves = Object.entries(SOURCES).flatMap(([cat, kids]) => (kids.length ? kids : [cat]));
    show(source, q ? leaves.filter((l) => l.toLowerCase().includes(q)) : Object.keys(SOURCES), pickSource);
  });
  // Skills: each pick adds a pill.
  const skills = doc.querySelector<HTMLInputElement>('#skills--skills')!;
  skills.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const q = skills.value.toLowerCase();
    show(skills, SKILLS.filter((s) => s.toLowerCase().includes(q)), (l) => pillIn(skills, l, true));
  });
}

/** The page Workday shows before an application when the user has no account for that company. */
export const WORKDAY_ACCOUNT = `<div data-automation-id="signInContent"><h2>Create Account</h2>
  <div data-automation-id="formField-email"><label for="em">Email Address</label><input id="em" data-automation-id="email" type="email"></div>
  <div><label for="pw">Password</label><input id="pw" type="password" data-automation-id="password"></div>
  <button data-automation-id="createAccountSubmitButton">Create Account</button></div>`;
