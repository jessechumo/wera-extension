// What every frame's page script does when the Wera panel asks: read the
// page, plan and fill the form, press Next (never Submit). The panel's
// requests come through the background, by frame.
import { gateOf } from './gate';
import { extensionAlive, sendSafe } from '../shared/alive';
import type { ContentRequest, PageInfo } from '../shared/types';
import { collectFields } from './fields';
import { peekOptions, press } from './fill';
import { log } from '../shared/log';
import { scrub, uniqueTraps } from '../shared/traps';
import { postingTraps, readJobPosting } from './jsonld';
import { formFrameOrigins } from './frames';
import { findApply, ownApplicationForm, pageDocument, pageKind } from './detect';
import { siteFor } from './sites';
import { pressNext } from './next';
import { addEntries, applyItems, highlight, planForm, snapshot } from './plan';
import { mainText } from './text';
import { bodyText, looksSubmitted, watchPage } from './watch';

declare global {
  interface Window {
    __weraDocId?: string;
  }
}

function readPage(): PageInfo {
  const url = location.href;
  const site = siteFor(document);
  const shown = pageDocument(document);
  // What a person cannot read is not read; what it says to AI tools is noted, for the user to see.
  const hidden: string[] = [];
  const { clean: text, traps } = scrub(mainText(shown, 24000, hidden));
  return {
    url,
    title: document.title,
    text,
    draft: readJobPosting(shown, url),
    traps: uniqueTraps([...traps, ...scrub(hidden.join('\n')).traps, ...postingTraps(shown)]),
    // This frame's own form: a careers page around an embedded one leaves it to that frame.
    hasForm: ownApplicationForm(document),
    submitted: looksSubmitted(bodyText(document)),
    frameOrigins: formFrameOrigins(document),
    jobLike: pageKind(document) !== null,
    apply: findApply(shown)?.textContent?.trim().slice(0, 40) || undefined,
    docId: window.__weraDocId,
    site: site?.name,
    step: site?.step?.(document) ?? undefined,
    gate: gateOf(document) ?? undefined,
  };
}

export function listen() {
  // Set once per loaded document, so the panel can tell a reload from a step of the same form.
  window.__weraDocId = Math.random().toString(36).slice(2);
  // Once the panel works with this frame, tell it about new form steps and
  // confirmations (pages Wera is not used on are never watched). Once the
  // extension is reloaded this copy is cut off, and stops watching.
  let watching = false;
  const watch = () => {
    if (watching) return;
    watching = true;
    const stopWatching = watchPage(document, (e) => {
      if (extensionAlive()) void sendSafe(e);
      else stopWatching();
    });
  };
  chrome.runtime.onMessage.addListener((msg: ContentRequest, _sender, reply) => {
    if (typeof msg?.type === 'string' && msg.type.startsWith('wera:')) watch();
    switch (msg.type) {
      case 'wera:read-page':
        reply(readPage());
        return false;
      case 'wera:scan': {
        const plan = planForm(document, msg.req.profile, msg.req);
        log.info('scan', `${plan.fields.length} fields on ${location.host}${plan.site ? ` (${plan.site})` : ''}`, plan.fields.map((f) => `${f.label.slice(0, 60)} → ${f.purpose ?? '?'}${f.value ? ' ✓' : ''}${f.note ? ` (${f.note})` : ''}`));
        reply(plan);
        return false;
      }
      case 'wera:apply':
        // Each field is reported as it lands, so the panel ticks it off live.
        applyItems(document, msg.req.items, {
          ...msg.req,
          onProgress: (result) => void sendSafe({ type: 'wera:fill-progress', result }),
        }).then(reply, (e: unknown) => {
          log.error('fill', 'filling stopped', e);
          reply(msg.req.items.map((i) => ({ id: i.id, label: i.label ?? '', purpose: null, status: 'review', required: false, note: `Wera stopped filling here: ${e instanceof Error ? e.message : String(e)}` })));
        });
        return true; // async reply
      case 'wera:options': {
        const fields = msg.ids.map((id) => collectFields(document).find((f) => f.id === id)).filter((f) => f != null);
        peekOptions(fields).then(reply, () => reply({}));
        return true; // async reply
      }
      case 'wera:log':
        reply({ url: location.href, entries: log.entries() });
        return false;
      case 'wera:add-entries':
        addEntries(document, msg.section, msg.count).then((added) => reply({ added }), () => reply({ added: 0 }));
        return true; // async reply
      case 'wera:snapshot':
        reply(snapshot(document));
        return false;
      case 'wera:next':
        reply(pressNext(document));
        return false;
      case 'wera:press-apply': {
        const b = findApply(pageDocument(document));
        if (b) press(b);
        reply({ ok: !!b });
        return false;
      }
      case 'wera:highlight':
        reply({ ok: highlight(document, msg.id) });
        return false;
      default:
        return false;
    }
  });
}
