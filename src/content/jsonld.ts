import { scrub, type Trap } from '../shared/traps';
import type { JobDraft } from '../shared/types';
import { blockText, htmlToText } from './text';

type Json = Record<string, unknown>;

function asArray<T>(v: T | T[] | undefined | null): T[] {
  return v == null ? [] : Array.isArray(v) ? v : [v];
}

function str(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  return '';
}

/** Every JSON-LD object on the page, flattening arrays and @graph. */
function jsonLdObjects(doc: Document): Json[] {
  const out: Json[] = [];
  const visit = (v: unknown) => {
    for (const item of asArray(v)) {
      if (item && typeof item === 'object') {
        const o = item as Json;
        out.push(o);
        if (o['@graph']) visit(o['@graph']);
      }
    }
  };
  for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      visit(JSON.parse(s.textContent ?? ''));
    } catch {
      // Malformed markup on the page: ignore that block.
    }
  }
  return out;
}

function isJobPosting(o: Json): boolean {
  return asArray(o['@type'] as string | string[]).some((t) => String(t).toLowerCase() === 'jobposting');
}

function location(job: Json): string {
  const parts: string[] = [];
  for (const loc of asArray(job.jobLocation as Json | Json[])) {
    const a = (loc?.address ?? {}) as Json;
    const text = typeof loc?.address === 'string'
      ? (loc.address)
      : [str(a.addressLocality), str(a.addressRegion), str(a.addressCountry && typeof a.addressCountry === 'object' ? (a.addressCountry as Json).name : a.addressCountry)]
          .filter(Boolean)
          .join(', ');
    if (text && !parts.includes(text)) parts.push(text);
  }
  return parts.slice(0, 3).join('; ') + (parts.length > 3 ? ` +${parts.length - 3}` : '');
}

function salary(job: Json): string {
  const s = job.baseSalary as Json | undefined;
  if (!s) return '';
  const v = (s.value ?? {}) as Json;
  const cur = str(s.currency) || 'USD';
  const unit = str(v.unitText).toLowerCase();
  const fmt = (n: unknown) => (typeof n === 'number' ? n.toLocaleString('en-US') : str(n));
  const lo = fmt(v.minValue), hi = fmt(v.maxValue), one = fmt(v.value);
  const range = lo && hi ? `${lo} - ${hi}` : one || lo || hi;
  if (!range) return '';
  return `${cur === 'USD' ? '$' : cur + ' '}${range}${unit ? ` per ${unit}` : ''}`;
}

const TYPES: Record<string, string> = {
  FULL_TIME: 'full_time', PART_TIME: 'part_time', CONTRACTOR: 'contract', TEMPORARY: 'contract', INTERN: 'internship',
};

/**
 * Reads the page's schema.org JobPosting, which most career sites publish
 * for search engines (Greenhouse, Lever, Ashby, Workday, ...). Exact and
 * free, so it is tried before the AI.
 */
export function readJobPosting(doc: Document, url: string): JobDraft | null {
  const job = jsonLdObjects(doc).find(isJobPosting);
  if (!job) return null;
  const org = asArray(job.hiringOrganization as Json | Json[] | string)[0];
  const company = typeof org === 'string' ? org : str(org?.name);
  const title = str(job.title);
  if (!title) return null;
  const remote = str(job.jobLocationType).toUpperCase() === 'TELECOMMUTE';
  const type =
    asArray(job.employmentType as string | string[])
      .map((t) => TYPES[String(t).toUpperCase().replace(/[\s-]+/g, '_')] ?? '')
      .find(Boolean) ?? '';
  return {
    url,
    company,
    title,
    location: location(job) || (remote ? 'Remote' : ''),
    work_mode: remote ? 'remote' : '',
    employment_type: type,
    department: '',
    salary: salary(job),
    industry: '',
    description: scrub(htmlToText(str(job.description))).clean,
    source: 'page-data',
  };
}

/** What the page's job data says to AI tools (taken out of the description Wera reads). */
export function postingTraps(doc: Document): Trap[] {
  const job = jsonLdObjects(doc).find(isJobPosting);
  if (!job) return [];
  const hidden: string[] = [];
  const html = str(job.description);
  const shown = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;
  return [...scrub(blockText(shown, hidden)).traps, ...scrub(hidden.join('\n')).traps];
}
