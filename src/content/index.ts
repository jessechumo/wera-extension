// Injected into the active tab when the user opens Wera on it. It reads the
// page and fills forms only when the side panel asks; it never submits.
import type { ContentRequest, PageInfo } from '../shared/types';
import { classify } from './classify';
import { byId, collectFields } from './fields';
import { insertText } from './fill';
import { readJobPosting } from './jsonld';
import { formFrameOrigins } from './frames';
import { pressNext } from './next';
import { applyItems, highlight, planForm, snapshot } from './plan';
import { mainText } from './text';
import { bodyText, looksSubmitted, watchPage } from './watch';

declare global {
  interface Window {
    __weraContent?: boolean;
    __weraDocId?: string;
  }
}

function readPage(): PageInfo {
  const url = location.href;
  const fields = collectFields(document);
  return {
    url,
    title: document.title,
    text: mainText(document),
    draft: readJobPosting(document, url),
    hasForm: fields.filter((f) => classify(f) !== null).length >= 3,
    submitted: looksSubmitted(bodyText(document)),
    frameOrigins: formFrameOrigins(document),
    docId: window.__weraDocId,
  };
}

if (!window.__weraContent) {
  window.__weraContent = true;
  // Set once per loaded document, so the side panel can tell a reload from a tab switch.
  window.__weraDocId = Math.random().toString(36).slice(2);
  // Tell the side panel about new form steps and confirmations (it may
  // be closed; then nobody listens and the message is dropped).
  watchPage(document, (e) => void chrome.runtime.sendMessage(e).catch(() => {}));
  chrome.runtime.onMessage.addListener((msg: ContentRequest, _sender, reply) => {
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
      case 'wera:scan':
        reply(planForm(document, msg.applicant, { answers: msg.answers, resumeName: msg.resumeName, coverLetter: msg.coverLetter }));
        return false;
      case 'wera:apply':
        // Each field is reported as it lands, so the panel ticks it off live.
        applyItems(document, msg.items, {
          resume: msg.resume, coverLetter: msg.coverLetter, pace: msg.pace,
          onProgress: (result) => void chrome.runtime.sendMessage({ type: 'wera:fill-progress', result }).catch(() => {}),
        }).then(reply, () => reply([]));
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
