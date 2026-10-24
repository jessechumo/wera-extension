// One log for every part of Wera (the service worker, the page script in
// each frame, the panel). Warnings and errors always reach the console of
// the context they happen in, prefixed "[wera:scope]"; debug and info
// lines only when the user turns on Settings > Debug log. The latest
// entries are kept in memory for "Copy diagnostics".
import { SETTINGS_KEY, type Settings } from './settings';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  at: number;
  level: LogLevel;
  scope: string;
  msg: string;
  data?: unknown;
}

const MAX = 400;
const entries: LogEntry[] = [];
let verbose = false;

// Follows the user's Debug log setting (where chrome.storage is reachable).
const debugOf = (v: unknown) => !!(v as Partial<Settings> | undefined)?.debug;
try {
  void chrome.storage?.local?.get(SETTINGS_KEY).then((g) => {
    verbose = debugOf(g[SETTINGS_KEY]);
  }, () => {});
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area === 'local' && changes[SETTINGS_KEY]) verbose = debugOf(changes[SETTINGS_KEY].newValue);
  });
} catch {
  // Not in an extension context (tests, a page script cut off by an update).
}

function write(level: LogLevel, scope: string, msg: string, data?: unknown) {
  entries.push({ at: Date.now(), level, scope, msg, ...(data === undefined ? {} : { data }) });
  if (entries.length > MAX) entries.splice(0, entries.length - MAX);
  if (level === 'warn' || level === 'error' || verbose) {
    const line = `[wera:${scope}] ${msg}`;
    (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line, ...(data === undefined ? [] : [data]));
  }
}

export const log = {
  debug: (scope: string, msg: string, data?: unknown) => write('debug', scope, msg, data),
  info: (scope: string, msg: string, data?: unknown) => write('info', scope, msg, data),
  warn: (scope: string, msg: string, data?: unknown) => write('warn', scope, msg, data),
  error: (scope: string, msg: string, data?: unknown) => write('error', scope, msg, data),
  /** The latest entries, oldest first. */
  entries: (): LogEntry[] => entries.slice(),
  /** Whether debug lines are printed (Settings > Debug log). */
  get verbose() {
    return verbose;
  },
};
