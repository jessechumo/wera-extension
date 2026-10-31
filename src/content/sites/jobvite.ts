// Jobvite: the resume and cover letter inputs sit in popups at the end of
// the page, with nothing to say which is which. They come in the order of
// the page's Add buttons, and each button says what it adds.
import type { Field } from '../fields';
import type { Site } from './index';

function attachment(f: Field): string {
  const at = /^file-input-(\d+)$/.exec(f.el.id)?.[1];
  return at == null ? '' : (f.el.ownerDocument.querySelectorAll('[jv-add-attachment]')[Number(at)]?.getAttribute('attachment-label') ?? '');
}

export const jobvite: Site = {
  name: 'Jobvite',
  matches: (doc) => /^jobs\.jobvite\.com$/i.test(doc.location?.hostname ?? ''),
  purpose(f) {
    if (f.kind !== 'file') return undefined;
    const says = attachment(f);
    return /resume|\bcv\b/i.test(says) ? 'resume' : /cover/i.test(says) ? 'cover_letter' : undefined;
  },
};
