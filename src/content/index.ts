// Injected into the active tab when the user opens Wera on it. It reads the
// page and fills forms only when the side panel asks; it never submits.
import type { ContentRequest, PageInfo } from '../shared/types';
import { classify } from './classify';
import { byId, collectFields } from './fields';
import { fillForm, insertText } from './fill';
import { readJobPosting } from './jsonld';
import { mainText } from './text';
import { bodyText, looksSubmitted, watchPage } from './watch';

declare global {
  interface Window {
    __weraContent?: boolean;
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
  };
}

function questions() {
  return collectFields(document)
    .filter((f) => classify(f) === 'question')
    .map((f) => ({ id: f.id, label: f.label.slice(0, 500), required: f.required, filled: !!(f.el as HTMLTextAreaElement).value }));
}

if (!window.__weraContent) {
  window.__weraContent = true;
  // Tell the side panel about new form steps and confirmations (it may
  // be closed; then nobody listens and the message is dropped).
  watchPage(document, (e) => void chrome.runtime.sendMessage(e).catch(() => {}));
  chrome.runtime.onMessage.addListener((msg: ContentRequest, _sender, reply) => {
    switch (msg.type) {
      case 'wera:read-page':
        reply(readPage());
        return false;
      case 'wera:questions':
        reply(questions());
        return false;
      case 'wera:insert':
        reply({ ok: insertText(byId(document, msg.id), msg.text) });
        return false;
      case 'wera:insert-cover-letter': {
        const box = collectFields(document).find((f) => f.kind === 'textarea' && classify(f) === 'cover_letter');
        reply({ ok: insertText(box?.el ?? null, msg.text) });
        return false;
      }
      case 'wera:fill':
        fillForm(document, msg.applicant, { resume: msg.resume, coverLetter: msg.coverLetter }).then(reply);
        return true; // async reply
      default:
        return false;
    }
  });
}
