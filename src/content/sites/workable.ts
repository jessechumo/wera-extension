// Workable: the job and school sections open inline, each with its own Save.
// Two open at once fight over the focus, which hangs the page, and Workable
// fills them itself from the resume, which it needs a moment to read.
import type { Site } from './index';

export const workable: Site = {
  name: 'Workable',
  matches: (doc) => /^apply\.workable\.com$/i.test(doc.location?.hostname ?? ''),
  noBlocks: true,
  readsResume: 2500,
};
