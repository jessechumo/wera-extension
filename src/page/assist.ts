// The Wera button in an application's open questions ("Why us?", "Tell me
// about a time when..."). Focusing one shows Wera's mark at its corner;
// clicking it drafts an answer from the user's profile, resume, earlier
// answers and the job, which the user can rework (shorter, longer, their
// own steer) and insert. Nothing is typed into the page until they insert.
import { classify } from '../content/classify';
import { pageKind } from '../content/detect';
import { collectFields, type Field } from '../content/fields';
import { insertText } from '../content/fill';
import { bestAnswer, type SavedAnswer } from '../shared/answers';
import { extensionAlive, sendSafe } from '../shared/alive';
import type { JobContext } from '../shared/dock';
import { remoteApi } from '../shared/rpc';
import { loadSettings } from '../shared/settings';
import { followTheme } from '../shared/theme';
import { BASE, el, icon, logoMark, mountShadow } from './ui';

const CSS = `${BASE}
.mark { position: fixed; z-index: 2147483646; display: grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 1px solid var(--border);
  border-radius: 9px; background: var(--surface); box-shadow: var(--shadow); transition: transform 120ms; }
.mark:hover { transform: scale(1.08); border-color: color-mix(in oklab, var(--accent) 50%, transparent); }
.pop { position: fixed; z-index: 2147483647; width: min(380px, calc(100vw - 24px)); display: grid; gap: 10px; padding: 12px;
  border: 1px solid var(--border); border-radius: 14px; background: var(--surface); box-shadow: var(--shadow); animation: rise 160ms ease both; }
@keyframes rise { from { transform: translateY(4px); opacity: 0; } }
.top { display: flex; align-items: center; gap: 8px; }
.top b { font-weight: 600; font-size: 13px; }
.top .q { min-width: 0; flex: 1; color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.x { display: grid; place-items: center; width: 24px; height: 24px; border: 0; border-radius: 7px; background: none; color: var(--faint); padding: 0; }
.x:hover { color: var(--text); background: var(--surface-2); }
.draft { min-height: 96px; max-height: 240px; overflow: auto; padding: 10px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg);
  white-space: pre-wrap; font-size: 13px; line-height: 1.5; }
.draft.wait { color: var(--muted); display: flex; align-items: center; gap: 8px; }
.draft.need { color: var(--warn); }
.spin { animation: spin 0.9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.meta { color: var(--faint); font-size: 11px; display: flex; gap: 8px; align-items: center; }
.row { display: flex; gap: 6px; flex-wrap: wrap; }
.btn { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px; border: 1px solid var(--border); border-radius: 8px;
  background: var(--surface-2); font-size: 12px; font-weight: 600; }
.btn:hover { border-color: color-mix(in oklab, var(--accent) 40%, transparent); }
.btn svg.i { width: 14px; height: 14px; }
.btn.primary { border-color: transparent; background: var(--accent); color: var(--bg); margin-left: auto; }
.btn.primary:hover { background: color-mix(in oklab, var(--accent) 85%, transparent); }
.btn[disabled] { opacity: .5; cursor: default; }
.steer { display: flex; gap: 6px; }
.steer input { flex: 1; min-width: 0; height: 32px; padding: 0 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); font-size: 12px; }
.steer input::placeholder { color: var(--faint); }
.saved[hidden] { display: none; }
.saved { padding: 8px 10px; border: 1px dashed var(--border); border-radius: 10px; font-size: 12px; color: var(--muted); display: grid; gap: 6px; }
.saved p { margin: 0; color: var(--text); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
@media (prefers-reduced-motion: reduce) { .pop { animation: none; } .spin { animation: none; } }`;

/** An open question a drafted answer fits: a text area, or a long text box asking a question. */
export function isOpenQuestion(f: Field): boolean {
  if (f.kind !== 'textarea' && f.kind !== 'text') return false;
  const p = classify(f);
  return p === 'question' || (p === 'cover_letter' && f.kind === 'textarea');
}

/** How long an answer the field takes: its character limit, else a short answer for a text box. */
export function wordsFor(f: Field): number {
  const max = (f.el as HTMLInputElement | HTMLTextAreaElement).maxLength;
  if (max > 0) return Math.max(15, Math.min(400, Math.floor(max / 6.5)));
  return f.kind === 'text' ? 40 : 150;
}

interface Draft {
  text: string;
  needs: string;
}

/** Starts watching the frame's fields for open questions; returns a stop. */
export function startAssist(doc: Document): () => void {
  let ui: ReturnType<typeof mountShadow> | null = null;
  let stopTheme = () => {};
  let field: Field | null = null;
  let mark: HTMLButtonElement | null = null;
  let pop: HTMLElement | null = null;
  let hideTimer = 0;
  let context: Promise<JobContext | null> | null = null;
  let bank: Promise<SavedAnswer[]> | null = null;

  const ensureUi = () => {
    if (ui) return ui;
    ui = mountShadow(doc, 'wera-assist', CSS);
    stopTheme = followTheme((t) => {
      if (ui) ui.box.dataset.theme = t;
    });
    return ui;
  };

  /** Where the mark sits: inside the field's bottom-right corner (or its right edge, for a one-line box). */
  const place = () => {
    if (!field || !mark) return;
    const r = field.el.getBoundingClientRect();
    if (!r.width || r.bottom < 0 || r.top > innerHeight) {
      mark.style.display = 'none';
      return;
    }
    mark.style.display = '';
    const top = field.kind === 'textarea' ? r.bottom - 34 : r.top + (r.height - 28) / 2;
    mark.style.top = `${Math.max(4, top)}px`;
    mark.style.left = `${Math.min(innerWidth - 34, r.right - 34)}px`;
    if (pop) {
      const below = r.bottom + 8;
      const h = pop.offsetHeight || 320;
      pop.style.top = `${below + h < innerHeight ? below : Math.max(8, r.top - h - 8)}px`;
      pop.style.left = `${Math.max(12, Math.min(innerWidth - pop.offsetWidth - 12, r.right - pop.offsetWidth))}px`;
    }
  };

  const hideMark = () => {
    mark?.remove();
    mark = null;
  };
  const closePop = () => {
    pop?.remove();
    pop = null;
  };

  const showMark = (f: Field) => {
    field = f;
    const { box } = ensureUi();
    if (!mark) {
      mark = el(doc, 'button', { class: 'mark', type: 'button', title: 'Draft this answer with Wera', 'aria-label': 'Draft this answer with Wera' }, logoMark(doc, 18));
      // Keep the field's focus (and the mark) while clicking it.
      mark.addEventListener('mousedown', (e) => e.preventDefault());
      mark.addEventListener('click', () => void openPop());
      box.append(mark);
    }
    place();
  };

  const openPop = async () => {
    const f = field;
    if (!f) return;
    closePop();
    const { box } = ensureUi();
    const words = wordsFor(f);
    let length = words;
    let current: Draft = { text: '', needs: '' };
    const label = f.label.replace(/\s*\*\s*$/, '');

    const draftBox = el(doc, 'div', { class: 'draft wait', 'aria-live': 'polite' });
    const steer = el(doc, 'input', { type: 'text', placeholder: 'Tell Wera what to add or change…', 'aria-label': 'What to change' });
    const go = el(doc, 'button', { class: 'btn', type: 'button', title: 'Rework with this' }, icon(doc, 'send'));
    const again = el(doc, 'button', { class: 'btn', type: 'button' }, icon(doc, 'refresh'), 'Again');
    const shorter = el(doc, 'button', { class: 'btn', type: 'button' }, icon(doc, 'shorter'), 'Shorter');
    const longer = el(doc, 'button', { class: 'btn', type: 'button' }, icon(doc, 'longer'), 'Longer');
    const use = el(doc, 'button', { class: 'btn primary', type: 'button' }, icon(doc, 'check'), 'Insert');
    const meta = el(doc, 'div', { class: 'meta' });
    const x = el(doc, 'button', { class: 'x', type: 'button', 'aria-label': 'Close' }, icon(doc, 'x'));
    x.addEventListener('click', closePop);
    const savedBox = el(doc, 'div', { class: 'saved' });
    savedBox.hidden = true;
    const actions = [again, shorter, longer, use, go];

    pop = el(doc, 'section', { class: 'pop', role: 'dialog', 'aria-label': 'Draft an answer with Wera' },
      el(doc, 'div', { class: 'top' }, logoMark(doc, 18), el(doc, 'b', {}, 'Wera'), el(doc, 'span', { class: 'q', title: label }, label), x),
      savedBox, draftBox, meta,
      el(doc, 'div', { class: 'steer' }, steer, go),
      el(doc, 'div', { class: 'row' }, again, shorter, longer, use));
    pop.addEventListener('mousedown', (e) => {
      if (e.target !== steer) e.preventDefault();
    });
    box.append(pop);
    place();

    const show = (d: Draft) => {
      current = d;
      draftBox.className = d.needs ? 'draft need' : 'draft';
      draftBox.textContent = d.needs ? `Wera needs this from you first: ${d.needs}` : d.text || 'Wera could not draft this one. Try again, or tell it what to say.';
      meta.textContent = d.text ? `${d.text.split(/\s+/).filter(Boolean).length} words · from your profile, resume and earlier answers` : '';
      use.disabled = !d.text;
      for (const b of [again, shorter, longer]) b.disabled = false;
      go.disabled = false;
      place();
    };

    const run = async (rework?: { draft?: string; instructions?: string }) => {
      for (const b of actions) b.disabled = true;
      draftBox.className = 'draft wait';
      draftBox.replaceChildren(icon(doc, 'loader', 'i spin'), rework ? 'Reworking…' : 'Drafting from your profile…');
      const server = ((await chrome.storage.local.get('wera.session').catch(() => ({}))) as { 'wera.session'?: { server: string } })['wera.session']?.server;
      if (!server) return show({ text: '', needs: 'sign in to Wera (click the Wera icon in the toolbar)' });
      context ??= sendSafe<JobContext>({ type: 'wera:dock-context' });
      const ctx = await context;
      try {
        const r = await remoteApi(server).answer(label, ctx?.jobId ?? null, length, ctx?.posting ?? undefined, rework);
        show({ text: (r.answer ?? '').trim(), needs: r.needs_input ?? '' });
      } catch (e) {
        show({ text: '', needs: e instanceof Error ? e.message : String(e) });
      }
    };

    again.addEventListener('click', () => void run());
    shorter.addEventListener('click', () => {
      length = Math.max(15, Math.round(length * 0.6));
      void run({ draft: current.text, instructions: 'Make it shorter.' });
    });
    longer.addEventListener('click', () => {
      length = Math.min(400, Math.round(length * 1.5));
      void run({ draft: current.text, instructions: 'Make it longer, with more specifics.' });
    });
    const rework = () => {
      const say = steer.value.trim();
      if (!say) return;
      steer.value = '';
      void run({ draft: current.text, instructions: say });
    };
    go.addEventListener('click', rework);
    steer.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        rework();
      }
    });
    use.addEventListener('click', () => {
      if (!current.text || !f.el.isConnected) return;
      insertText(f.el, current.text);
      closePop();
    });

    // An answer the user gave to the same question before comes first.
    const server = ((await chrome.storage.local.get('wera.session').catch(() => ({}))) as { 'wera.session'?: { server: string } })['wera.session']?.server;
    bank ??= server ? remoteApi(server).answers().catch(() => []) : Promise.resolve([]);
    const hit = bestAnswer(await bank, label);
    if (hit && hit.answer.length >= 20) {
      const useSaved = el(doc, 'button', { class: 'btn', type: 'button' }, icon(doc, 'history'), 'Use this');
      useSaved.addEventListener('click', () => show({ text: hit.answer, needs: '' }));
      savedBox.replaceChildren(el(doc, 'span', {}, 'Your earlier answer'), el(doc, 'p', {}, hit.answer), useSaved);
      savedBox.hidden = false;
    }
    void run();
  };

  const onFocus = (e: FocusEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target || !(target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement)) return;
    window.clearTimeout(hideTimer);
    if (field?.el === target) return showMark(field);
    void (async () => {
      if (!extensionAlive() || !(await loadSettings().catch(() => null))?.assist) return;
      // Only on application forms: a comment box elsewhere is not Wera's business.
      const onForm = doc.defaultView?.__weraPage?.kind === 'form' || pageKind(doc) === 'form';
      if (!onForm) return;
      const f = collectFields(doc).find((x) => x.el === target);
      if (f && isOpenQuestion(f) && doc.activeElement === target) {
        closePop();
        showMark(f);
      }
    })();
  };
  const onBlur = () => {
    // A moment, so a click on the mark lands first.
    hideTimer = window.setTimeout(() => {
      if (!pop) {
        hideMark();
        field = null;
      }
    }, 200);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && pop) closePop();
  };
  const onMove = () => place();
  // A click anywhere else on the page closes the draft.
  const onDown = (e: MouseEvent) => {
    if (!pop || !ui || e.composedPath().includes(ui.host) || e.target === field?.el) return;
    closePop();
    if (doc.activeElement !== field?.el) hideMark();
  };

  doc.addEventListener('focusin', onFocus, true);
  doc.addEventListener('focusout', onBlur, true);
  doc.addEventListener('keydown', onKey, true);
  doc.addEventListener('mousedown', onDown, true);
  window.addEventListener('scroll', onMove, true);
  window.addEventListener('resize', onMove);
  return () => {
    doc.removeEventListener('focusin', onFocus, true);
    doc.removeEventListener('focusout', onBlur, true);
    doc.removeEventListener('keydown', onKey, true);
    doc.removeEventListener('mousedown', onDown, true);
    window.removeEventListener('scroll', onMove, true);
    window.removeEventListener('resize', onMove);
    stopTheme();
    ui?.stop();
    ui?.host.remove();
  };
}
