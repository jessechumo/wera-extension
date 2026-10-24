// Filling Workday's own widgets the way a person does, checking each took:
// button dropdowns (a list pops up at the end of the page, sometimes too
// long to show at once), "prompts" (a search box that lists matches on
// Enter, sometimes a menu of categories, and shows the pick as a pill),
// skills (one pill per skill) and split month/day/year date boxes.
import type { FieldPurpose } from '../../shared/types';
import { isHidden, isWorkdayPrompt, listboxValue, promptChoice, type Field, type Option } from '../fields';
import { focusField, setNativeValue, wait } from '../fill';
import { matchOption, searchText } from '../match';
import { norm } from '../places';

type Hit = Option & { node: HTMLElement };

/** Waits for fn to return something (checking every 60ms), up to ms. */
async function until<T>(fn: () => T | null | undefined | false, ms: number): Promise<T | null> {
  const end = Date.now() + ms;
  for (;;) {
    const got = fn();
    if (got) return got;
    if (Date.now() > end) return null;
    await wait(60);
  }
}

/** A click as a pointer makes it: Workday's widgets listen for pointer and mouse events, not just click. */
export function pointer(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  const at = { bubbles: true, cancelable: true, composed: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
  const Pointer = typeof PointerEvent === 'function' ? PointerEvent : MouseEvent;
  el.dispatchEvent(new Pointer('pointerdown', { ...at, pointerType: 'mouse', isPrimary: true }));
  el.dispatchEvent(new MouseEvent('mousedown', at));
  el.dispatchEvent(new Pointer('pointerup', { ...at, pointerType: 'mouse', isPrimary: true }));
  el.dispatchEvent(new MouseEvent('mouseup', at));
  el.dispatchEvent(new MouseEvent('click', at));
}

function key(el: HTMLElement, k: string, code = k) {
  for (const type of ['keydown', 'keyup']) el.dispatchEvent(new KeyboardEvent(type, { key: k, code, keyCode: k === 'Enter' ? 13 : k === 'Escape' ? 27 : 0, bubbles: true, cancelable: true }));
}

const optLabel = (o: Element) => (o.getAttribute('data-automation-label') ?? o.textContent ?? '').replace(/\s+/g, ' ').trim();

/** Open option lists on the page: popups Workday adds at the end, never the pills of what is already chosen. */
function openLists(doc: Document): HTMLElement[] {
  return [...doc.querySelectorAll<HTMLElement>('[role="listbox"], [data-automation-id="activeListContainer"]')]
    .filter((l) => !l.closest('[data-automation-id="selectedItemList"]') && !isHidden(l) && !!l.querySelector('[role="option"], [data-automation-id="promptOption"], [data-automation-id="menuItem"]'));
}

function optionsIn(list: ParentNode): Hit[] {
  return [...list.querySelectorAll<HTMLElement>('[role="option"], [data-automation-id="promptOption"], [data-automation-id="menuItem"]')]
    .filter((o) => o.getAttribute('aria-disabled') !== 'true' && !isHidden(o))
    .map((node) => ({ label: optLabel(node), value: '', node }));
}

function closeLists(doc: Document) {
  if (openLists(doc).length) key((doc.activeElement as HTMLElement | null) ?? doc.body, 'Escape');
}

/** The option for value in an open list, scrolling it (long lists only render what shows). */
async function findInList(list: HTMLElement, value: string, purpose: FieldPurpose | null): Promise<Hit | null> {
  const pick = () => matchOption(optionsIn(list), value, purpose) as Hit | null;
  let hit = pick();
  if (hit) return hit;
  let scroller: HTMLElement | null = list;
  for (let i = 0; scroller && i < 5 && scroller.scrollHeight <= scroller.clientHeight + 4; i++) scroller = scroller.parentElement;
  for (let i = 0; scroller && i < 40; i++) {
    const before = scroller.scrollTop;
    scroller.scrollTop += Math.max(scroller.clientHeight - 20, 100);
    await wait(60);
    hit = pick();
    if (hit || scroller.scrollTop === before) return hit;
  }
  return null;
}

/** A Workday button dropdown ("Select One"): open it, find the choice, click it, check the button shows it. */
async function dropdown(btn: HTMLElement, value: string, purpose: FieldPurpose | null): Promise<string | null> {
  const doc = btn.ownerDocument;
  const shown = listboxValue(btn);
  if (shown && matchOption([{ label: shown, value: shown }], value, purpose)) return shown;
  closeLists(doc);
  await until(() => !openLists(doc).length, 1000);
  const before = new Set(openLists(doc));
  const owned = () => {
    const id = btn.getAttribute('aria-controls') || btn.getAttribute('aria-owns');
    const el = id ? doc.getElementById(id) : null;
    return el && !isHidden(el) && optionsIn(el).length ? el : null;
  };
  const fresh = () => owned() ?? openLists(doc).filter((l) => !before.has(l)).pop() ?? null;
  focusField(btn);
  pointer(btn);
  let list = await until(fresh, 2500);
  if (!list) {
    btn.click();
    list = await until(fresh, 2000);
  }
  if (!list) return null;
  const opt = await findInList(list, value, purpose);
  if (!opt) {
    closeLists(doc);
    return null;
  }
  opt.node.scrollIntoView?.({ block: 'nearest' });
  const took = () => norm(btn.isConnected ? btn.textContent ?? '' : '').includes(norm(opt.label));
  pointer(opt.node);
  let ok = await until(took, 2500);
  if (!ok && opt.node.isConnected) {
    opt.node.click();
    ok = await until(took, 2000);
  }
  closeLists(doc);
  return ok ? opt.label : null;
}

/** Where a prompt shows its results and pills. */
function promptBox(input: HTMLElement): HTMLElement {
  return input.closest<HTMLElement>('[data-uxi-widget-type], [data-automation-id^="formField-"]') ?? input.parentElement ?? input;
}

function promptOptions(input: HTMLElement): Hit[] {
  const near = optionsIn(promptBox(input));
  if (near.length) return near;
  for (const l of openLists(input.ownerDocument).reverse()) {
    const o = optionsIn(l);
    if (o.length) return o;
  }
  return [];
}

/** The prompt shows "No Items" (it can flash before results arrive). */
function saysNone(input: HTMLElement): boolean {
  const scopes = [promptBox(input), ...openLists(input.ownerDocument)];
  return scopes.some((s) => /\bno (items|results|matches)\b/i.test(s.textContent ?? ''));
}

/** The prompt box's live input (Workday re-renders it after each pick). */
function liveInput(input: HTMLInputElement): HTMLInputElement {
  if (input.isConnected) return input;
  return promptBox(input).querySelector<HTMLInputElement>('input[data-automation-id="searchBox"], input') ?? input;
}

/** Types a search the way Workday's prompt wants it: the text, then Enter. */
function search(input: HTMLInputElement, term: string) {
  focusField(input);
  pointer(input);
  // eslint-disable-next-line @typescript-eslint/unbound-method -- the native setter, called on input
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (setter) setter.call(input, term);
  else input.value = term;
  input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: term }));
  key(input, 'Enter');
}

/** The most telling word of a value ("Company Website" -> "website"), to search with when the whole value finds nothing. */
function keyword(value: string): string {
  const words = norm(value).split(' ').filter((w) => w.length >= 4 && !/^(and|the|with|from|university|college|school|institute)$/.test(w));
  return words.sort((a, b) => b.length - a.length)[0] ?? '';
}

/**
 * A Workday prompt: search, pick the matching result, follow a category
 * into its sub-list when the pick opens one ("Social Media" > "LinkedIn"),
 * and check the pill shows it.
 */
async function prompt(input0: HTMLInputElement, value: string, purpose: FieldPurpose | null): Promise<string | null> {
  const box = promptBox(input0);
  const chosen = promptChoice(input0);
  if (chosen && matchOption(chosen.split(' | ').map((l) => ({ label: l, value: l })), value, purpose)) return chosen;
  const path = value.split('>').map((s) => s.trim()).filter(Boolean);
  const want = path[path.length - 1] ?? value;
  // A category path is browsed from the full list; a value is searched, then by its most telling word.
  const terms = path.length > 1 ? [''] : [...new Set([searchText(want, purpose), keyword(want)].filter(Boolean))];
  const picked = (label: string) => norm(promptChoice(liveInput(input0))).includes(norm(label));
  for (const term of terms) {
    search(liveInput(input0), term);
    let step = 0;
    for (let level = 0; level < 3; level++) {
      // Results, or a "No Items" that stays (it flashes before results arrive).
      let noneSince = 0;
      const target = path.length > 1 ? path[Math.min(step, path.length - 1)]! : want;
      const hit = await until<Hit | 'none'>(() => {
        const opts = promptOptions(liveInput(input0));
        const m = matchOption(opts, target, purpose) as Hit | null;
        if (m) return m;
        if (!opts.length && saysNone(liveInput(input0))) {
          noneSince ||= Date.now();
          if (Date.now() - noneSince > 1200) return 'none';
        } else noneSince = 0;
        return null;
      }, 6000);
      if (!hit || hit === 'none') break;
      const before = promptOptions(liveInput(input0)).map((o) => o.label).join('|');
      pointer(hit.node);
      const res = await until(() => (picked(hit.label) ? 'picked' : promptOptions(liveInput(input0)).map((o) => o.label).join('|') !== before ? 'changed' : null), 2500);
      if (res === 'picked') {
        closeLists(box.ownerDocument);
        return hit.label;
      }
      if (res === 'changed' && promptOptions(liveInput(input0)).length) {
        step++;
        continue; // a category opened its sub-list: match again in it
      }
      // The click did not take: the option's own radio, then a plain click.
      const inner = hit.node.querySelector<HTMLElement>('input[type="radio"], input[type="checkbox"]') ?? hit.node;
      if (hit.node.isConnected) inner.click();
      if (await until(() => picked(hit.label), 1500)) return hit.label;
      break;
    }
    const live = liveInput(input0);
    if (live.value) setNativeValue(live, '');
  }
  closeLists(box.ownerDocument);
  return null;
}

/** Skills: one pill per skill (up to ten), each searched and picked. */
async function skills(input: HTMLInputElement, value: string): Promise<string | null> {
  const want = value.split(/\s*[,|;]\s*/).filter(Boolean).slice(0, 10);
  const got: string[] = [];
  for (const s of want) {
    const label = await prompt(liveInput(input), s, null);
    if (label) got.push(label);
  }
  return got.length ? got.join(', ') : null;
}

/** One part of a split date box: the month, day or year of value ("2026-10-22", "2024-06", "2023"). */
export function datePartValue(el: HTMLElement, value: string): string | null {
  const part = /dateSection(Month|Day|Year)/i.exec(el.getAttribute('data-automation-id') ?? '')?.[1]?.toLowerCase();
  if (!part) return null;
  const m = /^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/.exec(value.trim());
  if (!m) return /^\d{1,4}$/.test(value.trim()) ? value.trim() : null; // already one part (a block's month or year)
  const [, y, mo, d] = m;
  if (part === 'year') return y!;
  if (part === 'month') return mo ? mo.padStart(2, '0') : null;
  return d ? d.padStart(2, '0') : null;
}

async function datePart(el: HTMLInputElement, value: string): Promise<string | null> {
  const v = datePartValue(el, value);
  if (!v) return null;
  focusField(el);
  pointer(el);
  setNativeValue(el, v);
  // Workday's date boxes take typed digits.
  if (el.value.replace(/^0+/, '') !== v.replace(/^0+/, '')) {
    for (const ch of v) for (const type of ['keydown', 'keypress', 'keyup']) el.dispatchEvent(new KeyboardEvent(type, { key: ch, code: `Digit${ch}`, bubbles: true }));
  }
  el.dispatchEvent(new Event('blur', { bubbles: true }));
  await wait(40);
  return el.value ? el.value : null;
}

/** Fills a Workday field its own way: the value it now shows, null when it did not take, undefined to leave it to the general filler. */
export async function fillWorkday(f: Field, purpose: FieldPurpose | null, value: string): Promise<string | null | undefined> {
  if (f.kind === 'listbox') return dropdown(f.el, value, purpose);
  if (f.kind === 'combobox' && isWorkdayPrompt(f.el)) {
    return purpose === 'skills' ? skills(f.el as HTMLInputElement, value) : prompt(f.el as HTMLInputElement, value, purpose);
  }
  if (f.el instanceof HTMLInputElement && /dateSection(Month|Day|Year)/i.test(f.el.getAttribute('data-automation-id') ?? '')) return datePart(f.el, value);
  return undefined;
}
