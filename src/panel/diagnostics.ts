// "Copy diagnostics": what Wera made of this page and what happened, as
// text the user can paste into a bug report. Every field with its kind,
// what Wera read it as, what it proposed and how filling went, then the
// recent log of the panel and of each frame. Self-identification answers
// are hidden and long text is cut short.
import { log, type LogEntry } from '../shared/log';
import { frames } from '../shared/rpc';
import type { PagePlan } from '../shared/types';
import type { Row } from './rows';

export interface DiagnosticsInput {
  phase: string;
  plan: PagePlan | null;
  rows: Row[];
  error: string;
  warnings: string[];
}

const short = (s: string | undefined, n = 80) => (s && s.length > n ? `${s.slice(0, n)}…` : s ?? '');

function field(r: Row) {
  const hide = (v: string | undefined) => (r.group === 'self_id' && v ? '[hidden]' : short(v));
  return {
    label: short(r.label, 120), kind: r.kind, purpose: r.purpose, group: r.group, required: r.required || undefined,
    options: r.options.length || undefined, current: hide(r.current) || undefined, value: hide(r.value) || undefined,
    source: r.source ?? undefined, status: r.status, result: hide(r.result) || undefined, note: r.note || undefined, trap: r.trap,
  };
}

const lines = (entries: LogEntry[]) => entries.slice(-150).map((e) => `${new Date(e.at).toISOString().slice(11, 23)} ${e.level} ${e.scope}: ${e.msg}${e.data === undefined ? '' : ` ${short(JSON.stringify(e.data), 400)}`}`);

/** The report as JSON text. */
export async function diagnostics(input: DiagnosticsInput): Promise<string> {
  const frameLogs = await frames('log').catch(() => []);
  return JSON.stringify({
    wera: chrome.runtime.getManifest?.().version ?? '',
    at: new Date().toISOString(),
    page: `${location.host}${location.pathname}`,
    site: input.plan?.site, step: input.plan?.step, gate: input.plan?.gate,
    phase: input.phase, error: input.error || undefined, warnings: input.warnings.length ? input.warnings : undefined,
    next: input.plan?.next ? { label: input.plan.next.label, final: input.plan.next.final } : null,
    fields: input.rows.map(field),
    traps: input.plan?.traps,
    log: { panel: lines(log.entries()), frames: frameLogs.map((f) => ({ frame: f.frameId, url: short(f.url, 120), lines: lines(f.entries) })) },
  }, null, 1);
}
