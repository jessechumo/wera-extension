// Filling a form's fields the way a person does, in the page's own
// widgets: typing (so React, Vue and Angular see it), opening dropdowns
// and picking the choice that means the value, ticking boxes, attaching
// files, and checking each value took. What to enter comes from
// values.ts; which choice means it, from match.ts.
import type { FieldPurpose, FillResult } from '../shared/types';
import { isHidden, isPressed, isWorkdayPrompt, listboxValue, promptChoice, scopeOf, type Field, type Option } from './fields';
import { isPlaceholderOption, matchOption, searchText } from './match';
import { norm } from './places';
import { alternatives, choicesOf, firstChoice, formatFor } from './values';

/** Types a search into a dropdown's box: input only, no change or blur (which would close and clear the list). */
function typeSearch(el: HTMLInputElement, value: string) {
  // The native setter, called on el (see setNativeValue).
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
  // Some boxes search on a typed character's key events, not on input (Lever's location).
  const key = value.slice(-1);
  if (key) for (const type of ['keydown', 'keypress', 'keyup']) el.dispatchEvent(new KeyboardEvent(type, { key, code: `Key${key.toUpperCase()}`, bubbles: true }));
}

/** Sets a value the way typing would, so React/Vue/Angular forms see it. */
export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto = Object.getPrototypeOf(el) as object;
  // The prototype's native setter, called on el: it bypasses the
  // framework's own value tracking so the events below register.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  el.focus?.();
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true }));
}

function check(input: HTMLInputElement) {
  if (input.checked) return;
  input.click(); // fires the events frameworks listen for
  if (!input.checked) {
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

/** A click as a pointer makes it: some widgets open or pick on mousedown, others on click. */
export function press(el: HTMLElement) {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  el.click();
}

function escape(el: HTMLElement) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

const STYLE_ID = 'wera-fill-style';
export function mark(el: HTMLElement, kind: 'filled' | 'review') {
  // A shadow root needs its own copy of the outline style.
  const scope = scopeOf(el);
  if (!scope.getElementById(STYLE_ID)) {
    const style = el.ownerDocument.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `[data-wera-filled]{outline:2px solid rgba(34,197,94,.55)!important;outline-offset:2px}
[data-wera-review]{outline:2px solid rgba(245,158,11,.7)!important;outline-offset:2px}`;
    (scope instanceof ShadowRoot ? scope : scope.head)?.appendChild(style);
  }
  el.removeAttribute('data-wera-filled');
  el.removeAttribute('data-wera-review');
  el.setAttribute(kind === 'filled' ? 'data-wera-filled' : 'data-wera-review', '');
}

export function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** The visible options of an open dropdown: its own list when it names one, else any listbox on the page. */
function openOptions(el: HTMLElement): (Option & { node: HTMLElement })[] {
  const scope = scopeOf(el);
  const doc = el.ownerDocument;
  const ref = el.getAttribute('aria-controls') || el.getAttribute('aria-owns');
  const lists: ParentNode[] = [];
  const own = ref ? scope.getElementById(ref) ?? doc.getElementById(ref) : null;
  if (own) lists.push(own);
  else {
    // The list beside the field (a Workday prompt's results), then the newest popup
    // (Workday adds it at the end of the page), then any list on the page.
    const field = el.closest('[data-uxi-widget-type], [data-automation-id^="formField"]');
    if (field) lists.push(field);
    lists.push(...[...doc.querySelectorAll('[data-automation-widget="wd-popup"]')].reverse(), ...[...doc.querySelectorAll('[role="listbox"]')].reverse(), scope);
  }
  for (const list of lists) {
    const nodes = [...list.querySelectorAll<HTMLElement>('[role="option"], [data-automation-id="promptOption"]')].filter((o) => o.getAttribute('aria-disabled') !== 'true' && !isHidden(o));
    if (nodes.length) return nodes.map((node) => ({ label: (node.textContent ?? '').trim(), value: '', node }));
  }
  return [];
}

/** Whether an open list says it has nothing for the search (react-select's "No options", "No results found"). */
function saysNoOptions(el: HTMLElement): boolean {
  const ref = el.getAttribute('aria-controls') || el.getAttribute('aria-owns');
  const scopes: ParentNode[] = [];
  const own = ref ? scopeOf(el).getElementById(ref) ?? el.ownerDocument.getElementById(ref) : null;
  if (own) scopes.push(own);
  let n: HTMLElement | null = el.parentElement;
  for (let i = 0; n && i < 5; i++, n = n.parentElement) scopes.push(n);
  return scopes.some((sc) => [...sc.querySelectorAll<HTMLElement>('[class*="no-options"], [class*="noOptions"], [class*="no-results"], [class*="menu-notice"]')]
    .some((m) => !isHidden(m) && /^no (options|results|matches)|nothing found/i.test((m.textContent ?? '').trim())));
}

/** Waits up to ~2s (lists that search as you type load late) for an option that means value to show, then picks it. */
async function pickOpen(el: HTMLElement, value: string, purpose: FieldPurpose | null): Promise<string | null> {
  const start = Date.now();
  let shownSince = 0;
  while (Date.now() - start < 2000) {
    await wait(50);
    const options = openOptions(el);
    const hit = matchOption(options, value, purpose) as (Option & { node: HTMLElement }) | null;
    if (hit) {
      press(hit.node);
      return hit.label;
    }
    // A list that has shown its choices for a while without this one does not have it
    // ("Loading..." and "Searching..." rows are not choices yet).
    const real = options.filter((o) => !/^(loading|searching)\b/i.test(o.label));
    // The list says it has nothing for this search ("No options"): no point waiting.
    if (!real.length && saysNoOptions(el)) return null;
    if (!real.length) shownSince = 0;
    else if (!shownSince) shownSince = Date.now();
    else if (Date.now() - shownSince > 500) return null;
  }
  return null;
}

/** react-select and friends show the choice beside the input, which stays empty. */
export function comboboxChoice(el: HTMLInputElement): string {
  if (isWorkdayPrompt(el)) return promptChoice(el);
  if (el.value.trim()) return el.value.trim();
  let n: Element | null = el.parentElement;
  for (let i = 0; n && i < 4; i++, n = n.parentElement) {
    if (n.querySelectorAll('input, select, textarea').length > 1) break; // reached a neighbour's field
    const shown = n.querySelector('[class*="singleValue"], [class*="single-value"], [class*="SingleValue"]');
    if (shown?.textContent?.trim()) return shown.textContent.trim();
  }
  return '';
}

/**
 * Focus as the page sees it. The user is clicking in Wera's side panel,
 * so the page itself has no focus and focus() alone fires no events;
 * dropdowns that open only once focused (react-select) need them.
 */
export function focusField(el: HTMLElement) {
  el.focus?.();
  if (!el.ownerDocument.hasFocus()) {
    el.dispatchEvent(new FocusEvent('focus'));
    el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  }
}

/** The arrow key a person presses to open a list: down and up, since some open on keyup (Greenhouse). */
function arrowDown(el: HTMLElement) {
  for (const type of ['keydown', 'keyup']) {
    el.dispatchEvent(new KeyboardEvent(type, { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, which: 40, bubbles: true, cancelable: true }));
  }
}

/** Searchable dropdowns: type, then pick the option that appears; else list everything and look. */
async function fillCombobox(el: HTMLInputElement, value: string, purpose: FieldPurpose | null): Promise<string | null> {
  // A long answer ("No, I do not have a disability") is rarely worded the same in the list:
  // look through the whole list first, then search. Each alternative is searched in turn.
  const searches = alternatives(value).map((alt) => searchText(alt, purpose));
  const prompt = isWorkdayPrompt(el);
  const typedFirst = searches.length === 1 && searches[0]!.length <= 24;
  for (const typed of [...new Set(typedFirst ? [searches[0]!, ''] : ['', ...searches])]) {
    focusField(el);
    typeSearch(el, typed);
    // A Workday prompt searches when Enter is pressed; elsewhere Enter would pick the first choice.
    if (prompt) for (const type of ['keydown', 'keyup']) el.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
    else arrowDown(el);
    const got = await pickOpen(el, value, purpose);
    if (got) return got;
  }
  // Leave no half-typed search behind.
  typeSearch(el, '');
  escape(el);
  return null;
}

/** Dropdowns that are buttons (Workday) or ARIA comboboxes: open, then pick. */
async function fillListbox(el: HTMLElement, value: string, purpose: FieldPurpose | null): Promise<string | null> {
  focusField(el);
  press(el);
  const got = await pickOpen(el, value, purpose);
  if (!got) escape(el);
  return got;
}

/**
 * The choices custom dropdowns offer, read by opening each and closing it
 * again (nothing is picked), so the AI can answer from the real list.
 * Workday's prompts search instead of listing, and are left out.
 */
export async function peekOptions(fields: Field[], wait_ = 900): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  for (const f of fields) {
    if ((f.kind !== 'listbox' && f.kind !== 'combobox') || isWorkdayPrompt(f.el)) continue;
    focusField(f.el);
    if (f.kind === 'combobox') {
      typeSearch(f.el as HTMLInputElement, '');
      arrowDown(f.el);
    } else press(f.el);
    let labels: string[] = [];
    for (let t = 0; t < wait_ && !labels.length; t += 60) {
      await wait(60);
      labels = openOptions(f.el).map((o) => o.label).filter((l) => l && !/^(loading|searching)\b/i.test(l) && !isPlaceholderOption(l));
    }
    escape(f.el);
    f.el.blur?.();
    if (labels.length) out[f.id] = [...new Set(labels)].slice(0, 120);
    await wait(60);
  }
  return out;
}

export function base64ToFile(b64: string, name: string): File {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type: 'application/pdf' });
}

export function attachFile(input: HTMLInputElement, file: File) {
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

// Text boxes that suggest places as you type (Lever's location, Google Places): a suggestion must be picked.
const SUGGESTING = new Set<FieldPurpose>(['location', 'city']);
const SUGGESTIONS = '[role="option"], .dropdown-location, [class*="suggestion"] li, [class*="suggestion-item"], [class*="autocomplete"] li, [class*="results"]:not([class*="no-results"]):not([class*="loading"]) > div, .pac-item';
// "Loading...", "No results": what a list shows instead of suggestions.
const NOT_A_SUGGESTION = /loading|no-results|empty|spinner/i;

/** Suggestions showing beside a text box (in its field, or Google's list at the end of the page). */
function suggestionsNear(el: HTMLElement): (Option & { node: HTMLElement })[] {
  const scopes: ParentNode[] = [];
  let n: HTMLElement | null = el.parentElement;
  for (let i = 0; n && i < 3; i++, n = n.parentElement) scopes.push(n);
  scopes.push(...el.ownerDocument.querySelectorAll('.pac-container'));
  for (const scope of scopes) {
    const nodes = [...scope.querySelectorAll<HTMLElement>(SUGGESTIONS)].filter((o) => o !== el && !o.contains(el) && !isHidden(o) && (o.textContent ?? '').trim()
      && !NOT_A_SUGGESTION.test(`${o.className} ${o.parentElement?.className ?? ''}`) && !/^(loading|searching)\b/i.test((o.textContent ?? '').trim()));
    if (nodes.length) return nodes.map((node) => ({ label: (node.textContent ?? '').replace(/\s+/g, ' ').trim(), value: '', node }));
  }
  return [];
}

/**
 * Whether a text box suggests as you type (so a suggestion must be
 * picked): it says so (aria), or its name or the list beside it does.
 * Plain boxes are filled at once instead of waiting for a list.
 */
export function looksSuggesting(el: HTMLInputElement): boolean {
  if (el.getAttribute('aria-autocomplete') || el.getAttribute('role') === 'combobox' || el.getAttribute('aria-haspopup')) return true;
  if (/location|autocomplete|typeahead|places|suggest|geo/i.test(`${el.className} ${el.id} ${el.name} ${el.getAttribute('data-qa') ?? ''}`)) return true;
  // A list in the box's own wrapper (one holding no other field), as Lever has.
  let n: HTMLElement | null = el.parentElement;
  for (let i = 0; n && i < 3 && n.querySelectorAll('input, select, textarea').length === 1; i++, n = n.parentElement) {
    if (n.querySelector('[class*="dropdown"], [class*="autocomplete"], [class*="suggest"], [class*="results"], [role="listbox"]')) return true;
  }
  return !!el.ownerDocument.querySelector('.pac-container');
}

/** Types into a suggesting box and picks the suggestion that means value; null when none shows. */
async function pickSuggestion(el: HTMLInputElement, value: string, purpose: FieldPurpose | null): Promise<string | null> {
  focusField(el);
  // Search by the place's first part ("Dallas" for "Dallas, TX"), then pick the full match.
  const search = value.split(',')[0]!.trim();
  typeSearch(el, search);
  arrowDown(el);
  for (let i = 0; i < 40; i++) {
    await wait(100);
    const found = suggestionsNear(el);
    // A slow site may have missed the first search: ask once more.
    if (!found.length && i === 20) typeSearch(el, search);
    if (!found.length) continue;
    const hit = (matchOption(found, value, purpose) ?? found.find((o) => norm(o.label).startsWith(norm(value.split(',')[0]!)))) as (Option & { node: HTMLElement }) | null;
    // The list may still be filling in: keep looking until time runs out.
    if (!hit) continue;
    press(hit.node);
    await wait(80);
    return el.value.trim() || hit.label;
  }
  return null;
}

/**
 * Enters one value into a field of any kind and records the outcome in
 * res. A field that already holds something is left alone unless
 * overwrite (the user approved this value for it). Checkboxes take
 * several choices separated by " | ".
 */
export async function enterValue(f: Field, purpose: FieldPurpose | null, value: string, res: FillResult, overwrite = false) {
  switch (f.kind) {
    case 'text':
    case 'textarea': {
      const el = f.el as HTMLInputElement;
      value = firstChoice(value);
      if (el.value.trim() && (!overwrite || el.value === value)) {
        res.status = 'already';
        res.value = el.value;
        return;
      }
      if (purpose && SUGGESTING.has(purpose) && f.kind === 'text' && looksSuggesting(el)) {
        const picked = await pickSuggestion(el, value, purpose);
        if (picked) {
          res.status = 'filled';
          res.value = picked;
          return;
        }
      }
      const shaped = formatFor(el, value, purpose);
      if (shaped == null) {
        res.status = 'review';
        res.note = `enter it yourself ("${value}" doesn't fit this field)`;
        return;
      }
      setNativeValue(el, shaped);
      // Date part boxes (Workday's month and year) also listen for the digits being typed.
      if (el.getAttribute('role') === 'spinbutton') {
        for (const key of shaped) for (const type of ['keydown', 'keypress', 'keyup']) el.dispatchEvent(new KeyboardEvent(type, { key, code: /\d/.test(key) ? `Digit${key}` : key, bubbles: true }));
      }
      // The page may refuse a value (a date box, a mask): check it took.
      if (!el.value.trim()) {
        res.status = 'review';
        res.note = `the form didn't accept "${shaped}"`;
        return;
      }
      res.status = 'filled';
      res.value = el.value;
      return;
    }
    case 'combobox': {
      const el = f.el as HTMLInputElement;
      const shown = comboboxChoice(el);
      if (shown && (!overwrite || norm(shown) === norm(value))) {
        res.status = 'already';
        res.value = shown;
        return;
      }
      const got = await fillCombobox(el, value, purpose);
      res.status = got ? 'filled' : 'review';
      res.value = got ?? value;
      if (!got) res.note = 'pick the matching option';
      return;
    }
    case 'listbox': {
      const shown = listboxValue(f.el);
      if (shown && (!overwrite || norm(shown) === norm(value))) {
        res.status = 'already';
        res.value = shown;
        return;
      }
      const got = await fillListbox(f.el, value, purpose);
      res.status = got ? 'filled' : 'review';
      res.value = got ?? value;
      if (!got) res.note = 'pick the matching option';
      return;
    }
    case 'select': {
      const sel = f.el as HTMLSelectElement;
      const hit = matchOption(f.options, value, purpose);
      if (sel.value && sel.selectedIndex > 0 && (!overwrite || hit?.value === sel.value)) {
        res.status = 'already';
        res.value = sel.options[sel.selectedIndex]?.textContent?.trim() ?? sel.value;
        return;
      }
      if (!hit) {
        res.status = 'review';
        res.note = `no option matches "${value}"`;
        return;
      }
      setNativeValue(sel, hit.value);
      res.status = 'filled';
      res.value = hit.label;
      return;
    }
    case 'radio':
    case 'checkboxes':
    case 'buttons': {
      const chosen = (o: Option) => (f.kind === 'buttons' ? isPressed(o.el!) : (o.el as HTMLInputElement).checked);
      const wanted = f.kind === 'checkboxes' ? choicesOf(value, purpose) : [value];
      const hits = wanted.map((w) => matchOption(f.options, w, purpose)).filter((o): o is Option => o != null);
      if (f.options.some(chosen) && (!overwrite || (hits.length > 0 && hits.every(chosen)))) {
        res.status = 'already';
        res.value = f.options.filter(chosen).map((o) => o.label).join(' | ');
        return;
      }
      if (!hits.length) {
        res.status = 'review';
        res.note = `no choice matches "${value}"`;
        return;
      }
      for (const hit of hits) {
        if (chosen(hit)) continue;
        if (f.kind === 'buttons') press(hit.el!);
        else check(hit.el as HTMLInputElement);
      }
      res.status = 'filled';
      res.value = hits.map((o) => o.label).join(' | ');
      return;
    }
    case 'checkbox': {
      // A lone box ("I am willing to relocate"): ticked for yes, left alone for no.
      const box = f.el as HTMLInputElement;
      if (box.checked) {
        res.status = 'already';
        res.value = 'yes';
        return;
      }
      if (norm(firstChoice(value)) !== 'yes') return;
      check(box);
      res.status = 'filled';
      res.value = 'yes';
      return;
    }
    default:
      return;
  }
}

/** Puts text into one field (an AI-drafted answer or a cover letter). */
export function insertText(el: HTMLElement | null, text: string): boolean {
  if (!el || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false;
  setNativeValue(el, text);
  mark(el, 'filled');
  return true;
}
