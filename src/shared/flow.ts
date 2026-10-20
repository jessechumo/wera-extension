// A multi-page application in progress in one tab: which page Wera is on,
// the run it reports to Wera, and whether the user pressed Continue (so
// the panel fills the next page when it appears, even after a page load).
// Session storage: gone when the browser closes.

export interface Flow {
  /** The autofill run in Wera (0 until the first page is filled). */
  runId: number;
  host: string;
  jobId: number | null;
  /** Pages filled so far. */
  pages: number;
  /** The user pressed Continue: fill the next page when it shows. */
  continuing: boolean;
  at: number;
}

const KEY = 'wera.flows';
const TTL = 3 * 3600_000;

async function all(): Promise<Record<string, Flow>> {
  const got = await chrome.storage.session.get(KEY);
  return (got[KEY] as Record<string, Flow> | undefined) ?? {};
}

/** The tab's application in progress, if it is recent and on the same site. */
export async function loadFlow(tabId: number, host: string): Promise<Flow | null> {
  const f = (await all())[tabId];
  return f && f.host === host && Date.now() - f.at < TTL ? f : null;
}

export async function saveFlow(tabId: number, f: Flow | null): Promise<void> {
  const map = await all();
  if (f) map[tabId] = { ...f, at: Date.now() };
  else delete map[tabId];
  for (const [k, v] of Object.entries(map)) if (Date.now() - v.at > TTL) delete map[k];
  await chrome.storage.session.set({ [KEY]: map });
}
