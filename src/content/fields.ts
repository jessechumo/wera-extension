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
  label: string;
  /** name, id and autocomplete hints, lowercased. */
  hints: string;
  autocomplete: string;
  inputType: string;
  required: boolean;
  el: HTMLElement;
  options: Option[];
}

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

function clean(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').replace(/\s*\*\s*$/, '').trim();
}

function textOf(el: Element | null, groupName?: string): string {
  if (!el) return '';
  const clone = el.cloneNode(true) as Element;
  if (groupName) {
    // The question, not its answers: drop each option's own label.
    clone.querySelectorAll('label').forEach((l) => {
      if (l.querySelector(`input[name="${CSS.escape(groupName)}"]`)) l.remove();
    });
    clone.querySelectorAll(`input[name="${CSS.escape(groupName)}"]`).forEach((i) => {
      if (i.id) clone.querySelector(`label[for="${CSS.escape(i.id)}"]`)?.remove();
    });
  }
  clone.querySelectorAll(`input, select, textarea, option, script, style, button, [aria-hidden="true"], ${LISTBOX}`).forEach((n) => n.remove());
  return clean(clone.textContent);
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

export function labelFor(el: HTMLElement, groupName?: string): string {
  const doc = scopeOf(el);
  const ids = el.getAttribute('aria-labelledby');
  if (ids) {
    const t = clean(ids.split(/\s+/).map((i) => doc.getElementById(i)?.textContent ?? '').join(' '));
    if (t) return t;
  }
  if (groupName) {
    const fs = el.closest('fieldset');
    const legend = fs?.querySelector('legend');
    if (legend && textOf(legend)) return textOf(legend);
    const group = el.closest('[role="radiogroup"], [role="group"]');
    const gl = group?.getAttribute('aria-labelledby');
    if (gl) {
      const t = clean(gl.split(/\s+/).map((i) => doc.getElementById(i)?.textContent ?? '').join(' '));
      if (t) return t;
    }
    if (group?.getAttribute('aria-label')) return clean(group.getAttribute('aria-label'));
  } else {
    if (el.id) {
      const l = doc.querySelector(`label[for="${CSS.escape(el.id)}"]`);
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

function isRequired(el: HTMLElement, label: string): boolean {
  return (
    (el as HTMLInputElement).required ||
    el.getAttribute('aria-required') === 'true' ||
    /\*\s*$/.test(label) ||
    /\(required\)/i.test(label)
  );
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
  let label = '';
  for (let n: Element | null = parent.parentElement, i = 0; n && i < 4 && !label; n = n.parentElement, i++) label = textOf(n).slice(0, 300);
  if (!label) return null;
  return {
    id: idFor(parent), kind: 'buttons', label, hints: '', autocomplete: '', inputType: 'buttons',
    required: isRequired(parent, label), el: parent,
    options: buttons.map((b) => ({ label: clean(b.textContent), value: clean(b.textContent), el: b })),
  };
}

/** All fillable fields in document order, radio and checkbox groups merged. */
export function collectFields(root: ParentNode): Field[] {
  const fields: Field[] = [];
  const groups = new Map<string, Field>();
  for (const node of deepQueryAll<HTMLElement>(root, `${FIELDS}, button`)) {
    if (node.matches(LISTBOX)) {
      if (isWrappingListbox(node) || node.getAttribute('aria-disabled') === 'true' || isHidden(node)) continue;
      const label = labelFor(node);
      fields.push({
        id: idFor(node), kind: 'listbox', label, hints: clean(`${node.getAttribute('name') ?? ''} ${node.id}`).toLowerCase(),
        autocomplete: '', inputType: 'listbox', required: isRequired(node, label), el: node, options: [],
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

    if ((type === 'radio' || type === 'checkbox') && input.name) {
      const key = `${type}:${input.name}`;
      const sameName = scopeOf(node).querySelectorAll(`input[type="${type}"][name="${CSS.escape(input.name)}"]`).length;
      if (type === 'radio' || sameName > 1) {
        let g = groups.get(key);
        if (!g) {
          const label = labelFor(node, input.name);
          g = {
            id: idFor(node), kind: type === 'radio' ? 'radio' : 'checkboxes', label, hints, autocomplete: '',
            inputType: type, required: isRequired(node, label), el: node, options: [],
          };
          groups.set(key, g);
          fields.push(g);
        }
        g.options.push({ label: optionLabel(input), value: input.value, el: input });
        continue;
      }
    }
    const raw = labelFor(node);
    const kind: FieldKind =
      node.tagName === 'SELECT' ? 'select'
      : node.tagName === 'TEXTAREA' ? 'textarea'
      : type === 'file' ? 'file'
      : type === 'checkbox' ? 'checkbox'
      : node.getAttribute('role') === 'combobox' || node.getAttribute('aria-autocomplete') === 'list' ? 'combobox'
      : 'text';
    fields.push({
      id: idFor(node),
      kind,
      label: raw,
      hints,
      autocomplete: (node.getAttribute('autocomplete') ?? '').toLowerCase(),
      inputType: type,
      required: isRequired(node, raw),
      el: node,
      options:
        kind === 'select'
          ? [...(node as HTMLSelectElement).options].map((o) => ({ label: clean(o.textContent), value: o.value, el: o }))
          : [],
    });
  }
  return fields;
}
