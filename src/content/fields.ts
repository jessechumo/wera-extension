// Finds the fillable fields of an application form and the human label of
// each, the way a person reading the page would.

export type FieldKind = 'text' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'checkboxes' | 'file' | 'combobox';

export interface Option {
  label: string;
  value: string;
  el?: HTMLInputElement | HTMLOptionElement;
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

export function byId(root: ParentNode, id: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[${ID_ATTR}="${CSS.escape(id)}"]`);
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
  clone.querySelectorAll('input, select, textarea, option, script, style, button, [aria-hidden="true"]').forEach((n) => n.remove());
  return clean(clone.textContent);
}

/** Hidden by the page (not just off-screen). File inputs are often hidden behind a drop zone, so callers skip this check for them. */
export function isHidden(el: Element): boolean {
  for (let n: Element | null = el; n; n = n.parentElement) {
    if ((n as HTMLElement).hidden || n.getAttribute('aria-hidden') === 'true') return true;
    const style = n.ownerDocument.defaultView?.getComputedStyle(n);
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return true;
  }
  return false;
}

const CONTROLS = 'input, select, textarea';

/** The nearest ancestor (up to 5 levels) holding only this control (or its radio group), so its text is this field's label. */
function wrapper(el: Element, groupName?: string): Element | null {
  const groupSize = groupName ? el.ownerDocument.querySelectorAll(`input[name="${CSS.escape(groupName)}"]`).length : 1;
  let best: Element | null = null;
  let n = el.parentElement;
  for (let i = 0; n && i < 6; i++, n = n.parentElement) {
    const controls = [...n.querySelectorAll(CONTROLS)].filter((c) => (c as HTMLInputElement).type !== 'hidden');
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
  const doc = el.ownerDocument;
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
    const l = input.ownerDocument.querySelector(`label[for="${CSS.escape(input.id)}"]`);
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

/** All fillable fields in document order, radio and checkbox groups merged. */
export function collectFields(root: ParentNode): Field[] {
  const fields: Field[] = [];
  const groups = new Map<string, Field>();
  for (const node of root.querySelectorAll<HTMLElement>(CONTROLS)) {
    const input = node as HTMLInputElement;
    const type = (input.type || 'text').toLowerCase();
    if (['hidden', 'submit', 'button', 'reset', 'image', 'search', 'password'].includes(type)) continue;
    if (input.disabled || input.readOnly) continue;
    if (type !== 'file' && isHidden(node)) continue;
    const hints = clean(`${input.name} ${node.id} ${node.getAttribute('autocomplete') ?? ''}`).toLowerCase();

    if ((type === 'radio' || type === 'checkbox') && input.name) {
      const key = `${type}:${input.name}`;
      const sameName = root.querySelectorAll(`input[type="${type}"][name="${CSS.escape(input.name)}"]`).length;
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
