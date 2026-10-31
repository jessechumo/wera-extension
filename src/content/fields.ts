// Finds the fillable fields of an application form and the human label of
// each, the way a person reading the page would.

// listbox: a dropdown that is not a <select> (Workday's buttons, MUI); buttons: a Yes/No button pair (Ashby).
export type FieldKind = 'text' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'checkboxes' | 'file' | 'combobox' | 'listbox' | 'buttons';

export interface Option {
  label: string;
  value: string;
  el?: HTMLElement;
}

export interface Field {
  id: string;
  kind: FieldKind;
  /** What a person reads as its label: nothing hidden, and nothing aimed at AI tools. */
  label: string;
  /** name, id and autocomplete hints, lowercased. */
  hints: string;
  autocomplete: string;
  inputType: string;
  required: boolean;
  el: HTMLElement;
  options: Option[];
  /** The repeating section it sits in (a job or school block), if any. */
  section?: Section | null;
  /** The field is itself a trap: Wera leaves it to the user. */
  trap?: Trap;
  /** What its label said to AI tools, taken out of the label above. */
  said?: Trap[];
}

import { labelTrap, decoyName, scrub, type Trap } from '../shared/traps';
import { sectionOf, type Section } from './entries';
import { boxConcealed, boxOutOfReach, outOfSight, textConcealed } from './hidden';

const ID_ATTR = 'data-wera-id';
let seq = 0;

function idFor(el: Element): string {
  let id = el.getAttribute(ID_ATTR);
  if (!id) {
    id = `w${++seq}`;
    el.setAttribute(ID_ATTR, id);
  }
  return id;
}

/** The root and every open shadow root inside it (web-component forms such as SmartRecruiters'). */
export function allRoots(root: ParentNode): ParentNode[] {
  const out: ParentNode[] = [root];
  for (let i = 0; i < out.length; i++) {
    for (const el of out[i]!.querySelectorAll('*')) {
      if (el.shadowRoot) out.push(el.shadowRoot);
    }
  }
  return out;
}

/** querySelectorAll across the root and its open shadow roots, in order. */
export function deepQueryAll<T extends Element = Element>(root: ParentNode, selector: string): T[] {
  return allRoots(root).flatMap((r) => [...r.querySelectorAll<T>(selector)]);
}

/** The document or shadow root an element lives in: where its label and ids are. */
export function scopeOf(el: Element): Document | ShadowRoot {
  const r = el.getRootNode();
  return r instanceof ShadowRoot ? r : el.ownerDocument;
}

export function byId(root: ParentNode, id: string): HTMLElement | null {
  return deepQueryAll<HTMLElement>(root, `[${ID_ATTR}="${CSS.escape(id)}"]`)[0] ?? null;
}

/** Whitespace collapsed. */
function clean(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

/** A required marker at the end of a label: "*", "✱", "(required)". */
const MARKER = /\s*(\*|✱|\(required\))+\s*$/i;

/** A label without its required marker. */
export function stripMarker(label: string): string {
  return label.replace(MARKER, '').trim();
}

// Never part of a label: the controls themselves, scripts, and what screen readers skip.
const NOT_LABEL = new Set(['INPUT', 'SELECT', 'TEXTAREA', 'OPTION', 'SCRIPT', 'STYLE', 'BUTTON', 'SVG', 'TEMPLATE', 'NOSCRIPT']);

/**
 * The text a person reads in el: hidden parts (a "Loading..." or "No
 * results" message, an upload's status) and controls left out. For a
 * radio group (groupName), the options' own labels are left out too.
 */
function textOf(el: Element | null, groupName?: string): string {
  if (!el) return '';
  const view = el.ownerDocument.defaultView;
  const scope = scopeOf(el);
  const optionLabels = new Set<Element>();
  if (groupName) {
    for (const i of scope.querySelectorAll<HTMLInputElement>(`input[name="${CSS.escape(groupName)}"]`)) {
      const l = i.closest('label') ?? (i.id ? scope.querySelector(`label[for="${CSS.escape(i.id)}"]`) : null);
      if (l) optionLabels.add(l);
    }
  }
  const out: string[] = [];
  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) {
      // Read at the text itself: a parent's "font-size: 0" is a layout trick its children undo.
      const p = n.parentElement;
      if (!p || !view || !textConcealed(p, view.getComputedStyle(p))) out.push(n.textContent ?? '');
      return;
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return;
    const e = n as HTMLElement;
    if (NOT_LABEL.has(e.tagName.toUpperCase()) || optionLabels.has(e) || e.hidden || e.getAttribute('aria-hidden') === 'true') return;
    if (e.matches(`[role="radio"], [role="option"], [role="listbox"], ${LISTBOX}`)) return;
    const style = view?.getComputedStyle(e);
    if (style && boxConcealed(style)) return;
    for (const c of e.childNodes) walk(c);
    // Blocks read as separate words ("Phone" + "Required" is not "PhoneRequired").
    if (style && style.display !== 'inline' && style.display !== '') out.push(' ');
  };
  walk(el);
  return clean(out.join(''));
}

/** Hidden by the page (not just off-screen). File inputs are often hidden behind a drop zone, so callers skip this check for them. */
export function isHidden(el: Element): boolean {
  for (let n: Element | null = el; n; n = n.parentElement ?? (n.parentNode instanceof ShadowRoot ? n.parentNode.host : null)) {
    if ((n as HTMLElement).hidden || n.getAttribute('aria-hidden') === 'true') return true;
    const style = n.ownerDocument.defaultView?.getComputedStyle(n);
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return true;
  }
  return false;
}

const CONTROLS = 'input, select, textarea';
// Dropdowns built from other elements; ones wrapping a real input are left to it.
const LISTBOX = 'button[aria-haspopup="listbox"], [role="combobox"]:not(input):not(select), [role="button"][aria-haspopup="listbox"]';
const FIELDS = `${CONTROLS}, ${LISTBOX}`;

/** The nearest ancestor (up to 5 levels) holding only this control (or its radio group), so its text is this field's label. */
function wrapper(el: Element, groupName?: string): Element | null {
  const groupSize = groupName ? scopeOf(el).querySelectorAll(`input[name="${CSS.escape(groupName)}"]`).length : 1;
  let best: Element | null = null;
  let n = el.parentElement;
  for (let i = 0; n && i < 6; i++, n = n.parentElement) {
    const controls = [...n.querySelectorAll(FIELDS)].filter((c) => (c as HTMLInputElement).type !== 'hidden' && !isWrappingListbox(c));
    const members = groupName ? controls.filter((c) => (c as HTMLInputElement).name === groupName).length : 1;
    const others = controls.filter((c) => (groupName ? (c as HTMLInputElement).name !== groupName : c !== el));
    if (others.length > 0) break;
    best = n;
    // Stop at a field container, once it holds the whole radio group.
    if ((n.tagName === 'FIELDSET' || n.tagName === 'LI') && members >= groupSize) break;
  }
  return best;
}

/** The text of the elements an aria-labelledby names (they may be hidden themselves: ARIA allows it). */
function labelledBy(scope: Document | ShadowRoot, ids: string | null): string {
  if (!ids) return '';
  return clean(ids.split(/\s+/).map((i) => {
    const el = scope.getElementById(i);
    return textOf(el) || clean(el?.textContent);
  }).join(' '));
}

/** A question's title over a group of choices: its legend, a label of the group itself (Ashby), or its ARIA name. */
function groupTitle(group: Element): string {
  const scope = scopeOf(group);
  const legend = group.querySelector(':scope > legend') ?? (group.tagName === 'FIELDSET' ? group.querySelector('legend') : null);
  if (legend && textOf(legend)) return textOf(legend);
  // Not any option's label: one with no control in it that points at none inside the group.
  const title = [...group.querySelectorAll<HTMLLabelElement>(':scope > label')]
    .find((l) => !l.querySelector(CONTROLS) && !(l.htmlFor && group.querySelector(`#${CSS.escape(l.htmlFor)}`)));
  if (title && textOf(title)) return textOf(title);
  return labelledBy(scope, group.getAttribute('aria-labelledby')) || clean(group.getAttribute('aria-label'));
}

/** A field's label as the page shows it, required marker ("*") included. */
function rawLabel(el: HTMLElement, groupName?: string): string {
  const scope = scopeOf(el);
  const by = labelledBy(scope, el.getAttribute('aria-labelledby'));
  if (by) return by;
  if (groupName) {
    // The nearest group with a title (a fieldset's legend may sit outside an untitled inner group).
    const GROUP = 'fieldset, [role="radiogroup"], [role="group"]';
    for (let g = el.closest(GROUP), i = 0; g && i < 3; g = g.parentElement?.closest(GROUP) ?? null, i++) {
      const title = groupTitle(g);
      if (title) return title;
    }
  } else {
    if (el.id) {
      const l = scope.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l && textOf(l)) return textOf(l);
    }
    const parentLabel = el.closest('label');
    if (parentLabel && textOf(parentLabel)) return textOf(parentLabel);
    if (el.getAttribute('aria-label')) return clean(el.getAttribute('aria-label'));
  }
  const w = wrapper(el, groupName);
  const wt = textOf(w, groupName);
  if (wt) return wt.slice(0, 300);
  return clean(el.getAttribute('placeholder')) || clean((el as HTMLInputElement).name).replace(/[_\-[\]]+/g, ' ');
}

/** A field's label, the way a person reads it (without the required marker). */
export function labelFor(el: HTMLElement, groupName?: string): string {
  return stripMarker(rawLabel(el, groupName));
}

function optionLabel(input: HTMLInputElement): string {
  if (input.id) {
    const l = scopeOf(input).querySelector(`label[for="${CSS.escape(input.id)}"]`);
    if (l) return textOf(l);
  }
  const parent = input.closest('label');
  if (parent) return textOf(parent);
  const next = input.nextElementSibling;
  return clean(next?.textContent) || clean(input.value);
}

/** Required by the page, or marked so in its label as shown ("Email *", "Phone ✱", "(required)"). */
function isRequired(el: HTMLElement, raw: string): boolean {
  return (el as HTMLInputElement).required || el.getAttribute('aria-required') === 'true' || MARKER.test(raw) || /\(required\)/i.test(raw);
}

/** A combobox element around a real input (ARIA 1.1 style): the input is the field. */
function isWrappingListbox(el: Element): boolean {
  return el.tagName !== 'INPUT' && el.tagName !== 'SELECT' && el.tagName !== 'TEXTAREA' && !!el.querySelector(CONTROLS);
}

const PLACEHOLDER = /^(select|choose|please (select|choose)|--|pick)/i;

/** The value a custom dropdown shows, or '' while it shows its placeholder. */
export function listboxValue(el: HTMLElement): string {
  const t = clean(el.textContent);
  return t && !PLACEHOLDER.test(t) ? t : '';
}

const PRESSED = /(^|[\s_-])(active|selected|checked|pressed)/i;

/** Whether a choice button looks chosen. */
export function isPressed(b: HTMLElement): boolean {
  return ['aria-pressed', 'aria-checked', 'aria-selected'].some((a) => b.getAttribute(a) === 'true') || PRESSED.test(b.className);
}

/** A Yes/No button pair (Ashby asks yes/no questions this way), starting at its Yes button. */
function yesNoButtons(button: HTMLElement): Field | null {
  if (!/^yes$/i.test(clean(button.textContent))) return null;
  const parent = button.parentElement;
  if (!parent) return null;
  const buttons = [...parent.children].filter((c): c is HTMLElement => c.tagName === 'BUTTON');
  if (buttons.length !== 2 || buttons[0] !== button || !/^no$/i.test(clean(buttons[1]!.textContent))) return null;
  let raw = '';
  for (let n: Element | null = parent.parentElement, i = 0; n && i < 4 && !raw; n = n.parentElement, i++) raw = textOf(n).slice(0, 300);
  if (!raw) return null;
  return {
    id: idFor(parent), kind: 'buttons', ...named(parent, raw), hints: '', autocomplete: '', inputType: 'buttons', el: parent,
    options: buttons.map((b) => ({ label: clean(b.textContent), value: clean(b.textContent), el: b })),
  };
}

/** Workday's "prompt": a search box that lists matches on Enter and shows the pick as a pill beside it. */
export function isWorkdayPrompt(el: Element): boolean {
  return el.getAttribute('data-automation-id') === 'searchBox' || !!el.closest('[data-uxi-widget-type="multiselect"], [data-automation-id="multiselectInputContainer"]');
}

/** The pill(s) a Workday prompt shows for what is picked ('' when none). */
export function promptChoice(el: Element): string {
  const box = el.closest('[data-uxi-widget-type="multiselect"], [data-automation-id^="formField"]') ?? el.parentElement;
  return [...(box?.querySelectorAll('[data-automation-id="selectedItem"]') ?? [])].map((p) => (p.textContent ?? '').trim()).filter(Boolean).join(' | ');
}

/**
 * Raw label -> the field's label and whether it is required, with what
 * the label said to AI tools taken out. A label that was nothing else, or
 * that asks what only the person can answer, makes the field a trap.
 */
function named(el: HTMLElement, raw: string): { label: string; required: boolean; said?: Trap[]; trap?: Trap } {
  const { clean, traps } = scrub(raw);
  const label = stripMarker(clean);
  const out = { label, required: isRequired(el, raw), ...(traps.length ? { said: traps } : {}) };
  const kind = labelTrap(label);
  if (kind) return { ...out, trap: { kind, text: label.slice(0, 220) } };
  // Only words for AI tools: there is no question here to answer.
  if (traps.length && !/[a-z]{3}/i.test(label)) return { ...out, trap: { kind: traps[0]!.kind, text: traps[0]!.text } };
  return out;
}

/** Whether a person sees the control's label: a decoy's label is hidden along with it. */
function labelInSight(el: HTMLElement): boolean {
  const scope = scopeOf(el);
  const label = (el.id ? scope.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null) ?? el.closest('label') ?? wrapper(el);
  return !!label && !outOfSight(label) && !!textOf(label);
}

/**
 * Whether a control is there for programs only: named for it, or out of
 * a person's sight (widgets hide their real input too, but beside a label
 * that shows). Honeypots catch bots by being filled.
 */
function isDecoy(el: HTMLElement, hints: string): boolean {
  if (decoyName(hints)) return true;
  return (outOfSight(el) || boxOutOfReach(el)) && !labelInSight(el);
}

/** An option a person can pick; one that speaks to AI tools is no option, and is noted. */
function realOption(label: string, disabled: boolean, found?: Trap[]): boolean {
  const { traps } = scrub(label);
  if (traps.length) found?.push(...traps);
  return !traps.length && !disabled;
}

// A tick box that agrees to something is its own question, never one choice of a list.
const AGREES = /\b(i agree|agree|consent|acknowledge|certify|confirm)\b/i;

/**
 * Lone tick boxes that answer one question together: a fieldset (or ARIA
 * group) of boxes, each with its own name, under one title (Ashby's
 * "How did you hear about us? (select all that apply)").
 */
function mergeTickGroups(fields: Field[]): Field[] {
  const byGroup = new Map<Element, Field[]>();
  for (const f of fields) {
    const g = f.kind === 'checkbox' ? f.el.closest('fieldset, [role="group"]') : null;
    if (g) byGroup.set(g, [...(byGroup.get(g) ?? []), f]);
  }
  const replaced = new Map<Field, Field | null>();
  for (const [group, boxes] of byGroup) {
    if (boxes.length < 2 || boxes.some((b) => AGREES.test(b.label))) continue;
    // Only tick boxes in it: a fieldset that also holds text boxes is a section of the form, not one question.
    const others = [...group.querySelectorAll<HTMLInputElement>(FIELDS)].filter((c) => c.type !== 'hidden' && !boxes.some((b) => b.el === c));
    const raw = others.length ? '' : groupTitle(group);
    if (!raw) continue;
    const first = boxes[0]!;
    replaced.set(first, {
      id: first.id, kind: 'checkboxes', ...named(first.el, raw), hints: first.hints, autocomplete: '', inputType: 'checkbox', el: first.el,
      options: boxes.map((b) => ({ label: b.label, value: (b.el as HTMLInputElement).value, el: b.el })),
    });
    for (const b of boxes.slice(1)) replaced.set(b, null);
  }
  return replaced.size ? fields.flatMap((f) => (replaced.has(f) ? (replaced.get(f) ? [replaced.get(f)!] : []) : [f])) : fields;
}

/**
 * All fillable fields in document order, radio and checkbox groups
 * merged. Decoys are left out (found hears of them), so nothing can fill
 * them.
 */
export function collectFields(root: ParentNode, found?: Trap[]): Field[] {
  const fields: Field[] = [];
  const groups = new Map<string, Field>();
  for (const node of deepQueryAll<HTMLElement>(root, `${FIELDS}, button`)) {
    if (node.matches(LISTBOX)) {
      if (isWrappingListbox(node) || node.getAttribute('aria-disabled') === 'true' || isHidden(node)) continue;
      fields.push({
        id: idFor(node), kind: 'listbox', ...named(node, rawLabel(node)), hints: clean(`${node.getAttribute('name') ?? ''} ${node.id}`).toLowerCase(),
        autocomplete: '', inputType: 'listbox', el: node, options: [],
      });
      continue;
    }
    if (node.tagName === 'BUTTON') {
      const pair = isHidden(node) ? null : yesNoButtons(node);
      if (pair) fields.push(pair);
      continue;
    }
    const input = node as HTMLInputElement;
    const type = (input.type || 'text').toLowerCase();
    if (['hidden', 'submit', 'button', 'reset', 'image', 'search', 'password'].includes(type)) continue;
    if (input.disabled || input.readOnly) continue;
    if (type !== 'file' && isHidden(node)) continue;
    const hints = clean(`${input.name} ${node.id} ${node.getAttribute('autocomplete') ?? ''}`).toLowerCase();
    if (type !== 'file' && isDecoy(node, hints)) {
      found?.push({ kind: 'decoy_field', text: labelFor(node).slice(0, 80) || input.name || 'a hidden box' });
      continue;
    }

    if ((type === 'radio' || type === 'checkbox') && input.name) {
      const key = `${type}:${input.name}`;
      const sameName = scopeOf(node).querySelectorAll(`input[type="${type}"][name="${CSS.escape(input.name)}"]`).length;
      if (type === 'radio' || sameName > 1) {
        let g = groups.get(key);
        if (!g) {
          g = {
            id: idFor(node), kind: type === 'radio' ? 'radio' : 'checkboxes', ...named(node, rawLabel(node, input.name)), hints, autocomplete: '',
            inputType: type, el: node, options: [],
          };
          groups.set(key, g);
          fields.push(g);
        }
        const said = optionLabel(input);
        if (realOption(said, input.disabled, found)) g.options.push({ label: said, value: input.value, el: input });
        continue;
      }
    }
    const kind: FieldKind =
      node.tagName === 'SELECT' ? 'select'
      : node.tagName === 'TEXTAREA' ? 'textarea'
      : type === 'file' ? 'file'
      : type === 'checkbox' ? 'checkbox'
      : node.getAttribute('role') === 'combobox' || node.getAttribute('aria-autocomplete') === 'list' || isWorkdayPrompt(node) ? 'combobox'
      : 'text';
    fields.push({
      id: idFor(node),
      kind,
      ...named(node, rawLabel(node)),
      hints,
      autocomplete: (node.getAttribute('autocomplete') ?? '').toLowerCase(),
      inputType: type,
      el: node,
      options:
        kind === 'select'
          ? [...(node as HTMLSelectElement).options].filter((o) => realOption(clean(o.textContent), o.disabled && !!o.value, found)).map((o) => ({ label: clean(o.textContent), value: o.value, el: o }))
          : [],
    });
  }
  // Radio groups drawn without radio inputs (Workday, design systems): role="radiogroup" of role="radio".
  for (const group of deepQueryAll<HTMLElement>(root, '[role="radiogroup"]')) {
    if (group.querySelector('input[type="radio"]') || isHidden(group)) continue;
    const radios = [...group.querySelectorAll<HTMLElement>('[role="radio"]')].filter((r) => !isHidden(r) && r.getAttribute('aria-disabled') !== 'true');
    if (radios.length < 2) continue;
    fields.push({
      id: idFor(group), kind: 'buttons', ...named(group, groupTitle(group) || rawLabel(group)), hints: clean(`${group.getAttribute('name') ?? ''} ${group.id}`).toLowerCase(), autocomplete: '', inputType: 'radiogroup',
      el: group,
      options: radios.map((r) => ({ label: clean(r.getAttribute('aria-label') || r.textContent), value: clean(r.getAttribute('aria-label') || r.textContent), el: r })),
    });
  }
  const out = mergeTickGroups(fields).filter((f) => {
    if (f.trap?.kind !== 'decoy_field') return true;
    found?.push(f.trap);
    return false;
  });
  for (const f of out) f.section = sectionOf(f.el);
  return out;
}
