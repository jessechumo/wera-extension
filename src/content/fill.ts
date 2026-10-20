import type { Applicant, FieldPurpose, FillResult } from '../shared/types';
import { classify } from './classify';
import { collectFields, isHidden, isPressed, listboxValue, scopeOf, type Field, type Option } from './fields';

const US_STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};
const US_NAMES = ['united states', 'united states of america', 'usa', 'us', 'u.s.', 'u.s.a.'];
const DECLINE = /decline|prefer not|don.?t wish|do not wish|not to (say|answer|disclose|identify|self-identify)|rather not|choose not/;

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+]+/g, ' ').trim();

/** The value Wera would enter for a purpose, from the applicant details. */
export function valueFor(p: FieldPurpose, a: Applicant): string {
  switch (p) {
    case 'full_name':
      return [a.first_name, a.last_name].filter(Boolean).join(' ');
    case 'preferred_name':
      return a.preferred_name || a.first_name;
    case 'location':
      return [a.city, a.state, a.country && !US_NAMES.includes(norm(a.country)) ? a.country : ''].filter(Boolean).join(', ');
    case 'authorized_no_sponsorship':
      if (!a.authorized_to_work || !a.needs_sponsorship) return '';
      return a.authorized_to_work === 'yes' && a.needs_sponsorship === 'no' ? 'yes' : 'no';
    case 'resume':
    case 'cover_letter':
    case 'question':
    case 'consent':
      return '';
    default:
      return a[p] ?? '';
  }
}

// On normalized text, where "don't" reads "don t".
const NEGATED = /\b(not|no|never|cannot)\b|n t\b/;

/** Picks the option that means value, or null. */
export function matchOption(options: Option[], value: string, purpose: FieldPurpose | null): Option | null {
  const real = options.filter((o) => norm(o.label) !== '' && !/^(select|choose|please select|--)/i.test(o.label.trim()));
  if (!value) return null;
  const v = norm(value);
  if (v === 'decline') return real.find((o) => DECLINE.test(o.label.toLowerCase())) ?? null;
  if (v === 'yes' || v === 'no') {
    const direct = real.find((o) => new RegExp(`^${v}\\b`).test(norm(o.label)));
    if (direct) return direct;
    // "I am authorized..." / "I am not authorized...": the one without a negation means yes.
    const answers = real.filter((o) => !DECLINE.test(o.label.toLowerCase()));
    if (answers.length === 2) {
      const neg = answers.map((o) => NEGATED.test(norm(o.label)));
      if (neg[0] !== neg[1]) return answers[neg.indexOf(v === 'no')] ?? null;
    }
    return null;
  }
  const wanted = new Set([v]);
  if (purpose === 'country' && US_NAMES.includes(v)) US_NAMES.forEach((n) => wanted.add(norm(n)));
  if (purpose === 'state') {
    const up = value.trim().toUpperCase();
    if (US_STATES[up]) wanted.add(norm(US_STATES[up]));
    for (const [abbr, name] of Object.entries(US_STATES)) if (norm(name) === v) wanted.add(abbr.toLowerCase());
  }
  return (
    real.find((o) => wanted.has(norm(o.label)) || wanted.has(norm(o.value))) ??
    real.find((o) => [...wanted].some((w) => w.length > 2 && norm(o.label).startsWith(w))) ??
    real.find((o) => [...wanted].some((w) => w.length > 3 && norm(o.label).includes(w))) ??
    null
  );
}

/** What to type into a searchable dropdown so the right option shows: full names, not codes. */
export function searchText(value: string, purpose: FieldPurpose | null): string {
  const v = norm(value);
  if (v === 'decline') return '';
  if (v === 'yes' || v === 'no') return v === 'yes' ? 'Yes' : 'No';
  if (purpose === 'state' && US_STATES[value.trim().toUpperCase()]) return US_STATES[value.trim().toUpperCase()]!;
  if (purpose === 'country' && US_NAMES.includes(v)) return 'United States';
  return value;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** A date in the value ("2026-11-01", "11/01/2026", "November 1, 2026"), or null ("Immediately", "2 weeks"). */
export function parseDate(value: string): Date | null {
  const t = value.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
  m = /^([a-z]+)\.? (\d{1,2}),? (\d{4})$/i.exec(t);
  const month = m ? MONTHS.findIndex((x) => x.startsWith(m[1]!.toLowerCase().slice(0, 3))) : -1;
  if (m && month >= 0) return new Date(Number(m[3]), month, Number(m[2]));
  return null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The value in the shape the field takes: ISO dates for date inputs, the
 * placeholder's order for "MM/DD/YYYY" boxes, digits for number inputs
 * ("$120k" becomes 120000). Null when it cannot be entered there.
 */
export function formatFor(el: HTMLInputElement | HTMLTextAreaElement, value: string, purpose: FieldPurpose | null): string | null {
  const type = el instanceof HTMLInputElement ? el.type : 'textarea';
  if (type === 'date' || type === 'month') {
    const d = parseDate(value);
    if (!d) return null;
    return type === 'month' ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}` : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  if (type === 'number') {
    const m = /(\d[\d,]*(?:\.\d+)?)\s*(k)?/i.exec(value);
    if (!m) return null;
    const n = Number(m[1]!.replace(/,/g, '')) * (m[2] ? 1000 : 1);
    return Number.isFinite(n) ? String(n) : null;
  }
  if (purpose === 'start_date' || purpose === 'graduation_year') {
    const ph = (el.getAttribute('placeholder') ?? '').toLowerCase();
    const d = /\b(mm|dd)\b.*\byyyy\b/.test(ph) ? parseDate(value) : null;
    if (d) return ph.indexOf('dd') < ph.indexOf('mm') ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
  }
  return value;
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
  const ref = el.getAttribute('aria-controls') || el.getAttribute('aria-owns');
  const lists: ParentNode[] = [];
  const own = ref ? scope.getElementById(ref) ?? el.ownerDocument.getElementById(ref) : null;
  if (own) lists.push(own);
  else lists.push(...el.ownerDocument.querySelectorAll('[role="listbox"]'), scope);
  for (const list of lists) {
    const nodes = [...list.querySelectorAll<HTMLElement>('[role="option"]')].filter((o) => o.getAttribute('aria-disabled') !== 'true' && !isHidden(o));
    if (nodes.length) return nodes.map((node) => ({ label: (node.textContent ?? '').trim(), value: '', node }));
  }
  return [];
}

/** Waits up to ~1s for an option that means value to show, then picks it. */
async function pickOpen(el: HTMLElement, value: string, purpose: FieldPurpose | null): Promise<string | null> {
  for (let i = 0; i < 12; i++) {
    await wait(80);
    const options = openOptions(el);
    const hit = matchOption(options, value, purpose) as (Option & { node: HTMLElement }) | null;
    if (hit) {
      press(hit.node);
      return hit.label;
    }
  }
  return null;
}

/** react-select and friends show the choice beside the input, which stays empty. */
export function comboboxChoice(el: HTMLInputElement): string {
  if (el.value.trim()) return el.value.trim();
  let n: Element | null = el.parentElement;
  for (let i = 0; n && i < 4; i++, n = n.parentElement) {
    if (n.querySelectorAll('input, select, textarea').length > 1) break; // reached a neighbour's field
    const shown = n.querySelector('[class*="singleValue"], [class*="single-value"], [class*="SingleValue"]');
    if (shown?.textContent?.trim()) return shown.textContent.trim();
  }
  return '';
}

/** Searchable dropdowns: type, then pick the option that appears; else list everything and look. */
async function fillCombobox(el: HTMLInputElement, value: string, purpose: FieldPurpose | null): Promise<string | null> {
  for (const typed of [...new Set([searchText(value, purpose), ''])]) {
    setNativeValue(el, typed);
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    const got = await pickOpen(el, value, purpose);
    if (got) return got;
  }
  // Leave no half-typed search behind.
  setNativeValue(el, '');
  escape(el);
  return null;
}

/** Dropdowns that are buttons (Workday) or ARIA comboboxes: open, then pick. */
async function fillListbox(el: HTMLElement, value: string, purpose: FieldPurpose | null): Promise<string | null> {
  el.focus?.();
  press(el);
  const got = await pickOpen(el, value, purpose);
  if (!got) escape(el);
  return got;
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

export interface FillOptions {
  resume?: { name: string; base64: string };
  coverLetter?: string;
  /** Rounds over the form: answers can reveal fields ("If yes...") or load options (states after country). */
  passes?: number;
  /** How long to let the page react between rounds, in ms. */
  settle?: number;
}

/** Outcomes worth another try once the page has reacted (options may have loaded). Dropdowns that are slow to search are not retried. */
const RETRY = /^no (option|choice) matches/;

/**
 * Fills every field Wera understands from the applicant details. It never
 * overwrites what is already filled, never ticks consent boxes and never
 * submits; filled fields are outlined green and ones to check amber.
 * After a round that changed something it looks again for fields that
 * just appeared or options that just loaded.
 */
export async function fillForm(root: ParentNode, a: Applicant, opts: FillOptions = {}): Promise<FillResult[]> {
  const results = new Map<string, FillResult>();
  const passes = opts.passes ?? 3;
  for (let pass = 0; pass < passes; pass++) {
    let changed = false;
    for (const f of collectFields(root)) {
      const prev = results.get(f.id);
      if (prev && !(prev.status === 'review' && RETRY.test(prev.note ?? ''))) continue;
      const purpose = classify(f);
      const res: FillResult = { id: f.id, label: f.label.slice(0, 160), purpose, status: 'skipped', required: f.required };
      const max = (f.el as HTMLTextAreaElement).maxLength;
      if (purpose === 'question' && max > 0) res.maxLength = max;
      try {
        await fillOne(f, purpose, a, opts, res);
      } catch (e) {
        res.status = 'review';
        res.note = `could not fill: ${String(e)}`;
      }
      results.set(f.id, res);
      if (res.status === 'filled') {
        changed = true;
        mark(f.el, 'filled');
      } else if (res.status === 'review' || (res.status !== 'already' && f.required)) {
        mark(f.el, 'review');
      }
    }
    if (!changed) break;
    if (pass < passes - 1) await wait(opts.settle ?? 300);
  }
  // In page order, including fields that appeared on a later round.
  const order = new Map(collectFields(root).map((f, i) => [f.id, i]));
  return [...results.values()].sort((x, y) => (order.get(x.id) ?? 1e9) - (order.get(y.id) ?? 1e9));
}

async function fillOne(f: Field, purpose: FieldPurpose | null, a: Applicant, opts: FillOptions, res: FillResult) {
  if (purpose === null) return;
  if (purpose === 'consent') {
    res.status = 'review';
    res.note = 'agree yourself after reading it';
    return;
  }
  if (purpose === 'question') {
    res.status = 'question';
    return;
  }
  if (purpose === 'resume') {
    if (f.kind !== 'file') return;
    const input = f.el as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      res.status = 'already';
      return;
    }
    if (!opts.resume) {
      res.status = 'review';
      res.note = 'upload your resume in Wera to attach it';
      return;
    }
    attachFile(input, base64ToFile(opts.resume.base64, opts.resume.name));
    res.status = 'filled';
    res.value = opts.resume.name;
    return;
  }
  if (purpose === 'cover_letter') {
    if (f.kind === 'textarea' && opts.coverLetter && !(f.el as HTMLTextAreaElement).value) {
      setNativeValue(f.el as HTMLTextAreaElement, opts.coverLetter);
      res.status = 'filled';
      res.value = 'cover letter';
    } else {
      res.status = 'review';
      res.note = 'write or attach your cover letter';
    }
    return;
  }

  const value = valueFor(purpose, a);
  if (!value) {
    res.status = f.required ? 'review' : 'skipped';
    res.note = 'not in your application details';
    return;
  }
  await enterValue(f, purpose, value, res);
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
      if (el.value.trim() && (!overwrite || el.value === value)) {
        res.status = 'already';
        res.value = el.value;
        return;
      }
      const shaped = formatFor(el, value, purpose);
      if (shaped == null) {
        res.status = 'review';
        res.note = `enter it yourself ("${value}" doesn't fit this field)`;
        return;
      }
      setNativeValue(el, shaped);
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
      const wanted = f.kind === 'checkboxes' ? value.split(/\s*\|\s*/).filter(Boolean) : [value];
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
      if (norm(value) !== 'yes') return;
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
