// What every frame's page script does when the Wera panel asks: read the
// page, plan and fill the form, press Next (never Submit). The panel's
// requests come through the background, by frame.
import { extensionAlive, sendSafe } from '../shared/alive';
import type { ContentRequest, PageInfo } from '../shared/types';
import { classify } from './classify';
import { byId, collectFields } from './fields';
import { attachFile, base64ToFile, insertText, mark } from './fill';
import { readJobPosting } from './jsonld';
import { formFrameOrigins } from './frames';
import { pageKind } from './detect';
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
  const fields = collectFields(document);
  const site = siteFor(document);
  return {
    url,
    title: document.title,
    text: mainText(document),
    draft: readJobPosting(document, url),
    hasForm: fields.filter((f) => classify(f) !== null).length >= 3,
    submitted: looksSubmitted(bodyText(document)),
    frameOrigins: formFrameOrigins(document),
    jobLike: pageKind(document) !== null,
    docId: window.__weraDocId,
    site: site?.name,
    step: site?.step?.(document) ?? undefined,
    gate: site?.gate?.(document) ?? undefined,
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
      case 'wera:insert':
        reply({ ok: insertText(byId(document, msg.id), msg.text) });
        return false;
      case 'wera:insert-cover-letter': {
        const box = collectFields(document).find((f) => f.kind === 'textarea' && classify(f) === 'cover_letter');
        reply({ ok: insertText(box?.el ?? null, msg.text) });
        return false;
      }
      case 'wera:attach': {
        // The form's resume or cover letter upload.
        const input = collectFields(document).find((f) => f.kind === 'file' && classify(f) === msg.what);
        if (input) {
          attachFile(input.el as HTMLInputElement, base64ToFile(msg.file.base64, msg.file.name));
          mark(input.el, 'filled');
        }
        reply({ ok: !!input });
        return false;
      }
      case 'wera:scan':
        reply(planForm(document, msg.applicant, { answers: msg.answers, resumeName: msg.resumeName, coverLetter: msg.coverLetter }));
        return false;
      case 'wera:apply':
        // Each field is reported as it lands, so the panel ticks it off live.
        applyItems(document, msg.items, {
          resume: msg.resume, coverLetter: msg.coverLetter, letterFile: msg.letterFile, pace: msg.pace,
          onProgress: (result) => void sendSafe({ type: 'wera:fill-progress', result }),
        }).then(reply, () => reply([]));
        return true; // async reply
      case 'wera:add-entries':
        addEntries(document, msg.section, msg.count).then((added) => reply({ added }), () => reply({ added: 0 }));
        return true; // async reply
      case 'wera:snapshot':
        reply(snapshot(document));
        return false;
      case 'wera:next':
        reply(pressNext(document));
        return false;
      case 'wera:highlight':
        reply({ ok: highlight(document, msg.id) });
        return false;
      default:
        return false;
    }
  });
}
