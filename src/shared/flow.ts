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
const APPLYING = 'wera.applying';
/** How long "Apply with Wera" waits for its application to show. */
const APPLYING_TTL = 2 * 60_000;
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

/** The user pressed Apply with Wera on this tab: the application that shows next fills itself. */
export async function markApplying(tabId: number): Promise<void> {
  const got = await chrome.storage.session.get(APPLYING);
  await chrome.storage.session.set({ [APPLYING]: { ...(got[APPLYING] as Record<string, number> | undefined), [tabId]: Date.now() } });
}

/** Whether the user pressed Apply with Wera on this tab moments ago; it counts once. */
export async function takeApplying(tabId: number): Promise<boolean> {
  const got = await chrome.storage.session.get(APPLYING);
  const map = { ...(got[APPLYING] as Record<string, number> | undefined) };
  const at = map[tabId];
  if (at == null) return false;
  delete map[tabId];
  await chrome.storage.session.set({ [APPLYING]: map });
  return Date.now() - at < APPLYING_TTL;
}

/** An Apply button often opens the application in a new tab: the wish goes with it. */
export async function passApplying(fromTab: number, toTab: number): Promise<void> {
  if (await takeApplying(fromTab)) await markApplying(toTab);
}
