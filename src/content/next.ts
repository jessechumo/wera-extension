// Finds the button that moves a multi-page application to its next page
// ("Next", "Save and continue"), so the side panel can press it once the
// user approves the page. A button that submits the application is
// reported as final and never pressed: the user submits.
import type { NextButton } from '../shared/types';
import { deepQueryAll, isHidden } from './fields';
import { press } from './fill';

const ID_ATTR = 'data-wera-next';

const NEXT = /^(next|continue|save (and|&) (continue|next)|save and proceed|proceed|next step|next page|continue to (the )?next (step|page)|go to next|review( (application|and submit))?)\b/i;
const FINAL = /\b(submit|send (my )?application|apply( now)?|finish|complete (my )?application|confirm and submit)\b/i;
// Never a way forward: going back, saving for later, leaving, signing in.
const NOT = /\b(back|previous|prev|cancel|save (as )?draft|save for later|sign (in|up)|log ?in|create account|upload|add (another|more)|remove|delete|edit)\b/i;

const CANDIDATES = 'button, input[type="submit"], input[type="button"], [role="button"], a[data-automation-id]';

function textOf(el: HTMLElement): string {
  const raw = el instanceof HTMLInputElement ? el.value : (el.getAttribute('aria-label') || el.textContent || '');
  return raw.replace(/\s+/g, ' ').trim();
}

function disabled(el: HTMLElement): boolean {
  return (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true';
}

/**
 * The page's way forward: the last visible Next-like button (forms put it
 * at the bottom), else a submit-like one reported as final; null when
 * the page has neither.
 */
export function findNext(root: ParentNode): NextButton | null {
  let next: HTMLElement | null = null;
  let final: HTMLElement | null = null;
  for (const el of deepQueryAll<HTMLElement>(root, CANDIDATES)) {
    if (isHidden(el) || disabled(el)) continue;
    const t = textOf(el);
    if (!t || t.length > 40 || NOT.test(t)) continue;
    // Workday names its buttons: the bottom bar's Next and Submit.
    const auto = el.getAttribute('data-automation-id') ?? '';
    if (/next-button|pageFooterNextButton/i.test(auto) || (NEXT.test(t) && !FINAL.test(t))) next = el;
    else if (FINAL.test(t)) final = el;
  }
  const el = next ?? final;
  if (!el) return null;
  let id = el.getAttribute(ID_ATTR);
  if (!id) {
    id = `n${Math.random().toString(36).slice(2, 8)}`;
    el.setAttribute(ID_ATTR, id);
  }
  return { id, label: textOf(el), final: el !== next };
}

/** Presses the Next button; refuses a final (submit) one. */
export function pressNext(root: ParentNode): { ok: boolean; label?: string; final?: boolean } {
  const found = findNext(root);
  if (!found) return { ok: false };
  if (found.final) return { ok: false, label: found.label, final: true };
  const el = deepQueryAll<HTMLElement>(root, `[${ID_ATTR}="${CSS.escape(found.id)}"]`)[0];
  if (!el) return { ok: false };
  el.scrollIntoView?.({ block: 'center' });
  press(el);
  return { ok: true, label: found.label };
}

/** Fields the site marks as invalid (a Next that did not go through says why here). */
export function invalidCount(root: ParentNode): number {
  return deepQueryAll<HTMLElement>(root, '[aria-invalid="true"]').filter((el) => !isHidden(el)).length;
}
