// Injected into the active tab when the user opens Wera on it. It reads the
// page and fills forms only when the side panel asks; it never submits.
import type { ContentRequest, PageInfo } from '../shared/types';
import { classify } from './classify';
import { byId, collectFields } from './fields';
import { fillForm, insertText } from './fill';
import { readJobPosting } from './jsonld';
import { mainText } from './text';

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
  };
}

function questions() {
  return collectFields(document)
    .filter((f) => classify(f) === 'question')
    .map((f) => ({ id: f.id, label: f.label.slice(0, 500), required: f.required, filled: !!(f.el as HTMLTextAreaElement).value }));
}

if (!window.__weraContent) {
  window.__weraContent = true;
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
      case 'wera:fill':
        fillForm(document, msg.applicant, { resume: msg.resume, coverLetter: msg.coverLetter }).then(reply);
        return true; // async reply
      default:
        return false;
    }
  });
}
