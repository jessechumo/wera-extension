import type { Applicant, FieldPurpose, FillResult } from '../shared/types';
import { classify } from './classify';
import { collectFields, type Field, type Option } from './fields';

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

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+]+/g, ' ').trim();

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

/** Picks the option that means value, or null. */
export function matchOption(options: Option[], value: string, purpose: FieldPurpose | null): Option | null {
  const real = options.filter((o) => norm(o.label) !== '' && !/^(select|choose|please select|--)/i.test(o.label.trim()));
  if (!value) return null;
  const v = norm(value);
  if (v === 'decline') return real.find((o) => DECLINE.test(o.label.toLowerCase())) ?? null;
  if (v === 'yes' || v === 'no') {
    return real.find((o) => new RegExp(`^${v}\\b`).test(norm(o.label))) ?? null;
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

/** Sets a value the way typing would, so React/Vue/Angular forms see it. */
export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto = Object.getPrototypeOf(el) as object;
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

const STYLE_ID = 'wera-fill-style';
function mark(el: HTMLElement, kind: 'filled' | 'review') {
  const doc = el.ownerDocument;
  if (!doc.getElementById(STYLE_ID)) {
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `[data-wera-filled]{outline:2px solid rgba(34,197,94,.55)!important;outline-offset:2px}
[data-wera-review]{outline:2px solid rgba(245,158,11,.7)!important;outline-offset:2px}`;
    doc.head?.appendChild(style);
  }
  el.removeAttribute('data-wera-filled');
  el.removeAttribute('data-wera-review');
  el.setAttribute(kind === 'filled' ? 'data-wera-filled' : 'data-wera-review', '');
}

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Custom dropdowns (react-select and friends): type, then pick the option that appears. */
async function fillCombobox(el: HTMLInputElement, value: string, purpose: FieldPurpose | null): Promise<boolean> {
  setNativeValue(el, value);
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  for (let i = 0; i < 6; i++) {
    await wait(80);
    const list = el.getAttribute('aria-controls') ? el.ownerDocument.getElementById(el.getAttribute('aria-controls')!) : null;
    const scope: ParentNode = list ?? el.ownerDocument;
    const options = [...scope.querySelectorAll<HTMLElement>('[role="option"]')].map((o) => ({ label: o.textContent ?? '', value: '', node: o }));
    const hit = matchOption(options, value, purpose) as (Option & { node?: HTMLElement }) | null;
    if (hit) {
      const node = options.find((o) => o.label === hit.label)?.node;
      node?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      node?.click();
      return true;
    }
  }
  return false;
}

function base64ToFile(b64: string, name: string): File {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type: 'application/pdf' });
}

function attachFile(input: HTMLInputElement, file: File) {
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

export interface FillOptions {
  resume?: { name: string; base64: string };
  coverLetter?: string;
}

/**
 * Fills every field Wera understands from the applicant details. It never
 * overwrites what is already filled, never ticks consent boxes and never
 * submits; filled fields are outlined green and ones to check amber.
 */
export async function fillForm(root: ParentNode, a: Applicant, opts: FillOptions = {}): Promise<FillResult[]> {
  const results: FillResult[] = [];
  for (const f of collectFields(root)) {
    const purpose = classify(f);
    const res: FillResult = { id: f.id, label: f.label.slice(0, 160), purpose, status: 'skipped', required: f.required };
    results.push(res);
    try {
      await fillOne(f, purpose, a, opts, res);
    } catch (e) {
      res.status = 'review';
      res.note = `could not fill: ${String(e)}`;
    }
    if (res.status === 'filled') mark(f.el, 'filled');
    else if (res.status === 'review' || (res.status !== 'already' && f.required)) mark(f.el, 'review');
  }
  return results;
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

  switch (f.kind) {
    case 'text':
    case 'textarea': {
      const el = f.el as HTMLInputElement;
      if (el.value.trim()) {
        res.status = 'already';
        return;
      }
      setNativeValue(el, value);
      res.status = 'filled';
      res.value = value;
      return;
    }
    case 'combobox': {
      const ok = await fillCombobox(f.el as HTMLInputElement, value, purpose);
      res.status = ok ? 'filled' : 'review';
      res.value = value;
      if (!ok) res.note = 'pick the matching option';
      return;
    }
    case 'select': {
      const sel = f.el as HTMLSelectElement;
      if (sel.value && sel.selectedIndex > 0) {
        res.status = 'already';
        return;
      }
      const hit = matchOption(f.options, value, purpose);
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
    case 'checkboxes': {
      if (f.options.some((o) => (o.el as HTMLInputElement).checked)) {
        res.status = 'already';
        return;
      }
      const hit = matchOption(f.options, value, purpose);
      if (!hit) {
        res.status = 'review';
        res.note = `no choice matches "${value}"`;
        return;
      }
      check(hit.el as HTMLInputElement);
      res.status = 'filled';
      res.value = hit.label;
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
