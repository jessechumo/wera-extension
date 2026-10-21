// Tells a job page from any other page the way a person would: the
// address of a known job board, the page's schema.org JobPosting, or what
// is on it (a job title, an Apply button and a description with
// requirements). Reads the page only; sends nothing anywhere.
import { classify } from './classify';
import { collectFields } from './fields';
import { formFrameOrigins } from './frames';
import { readJobPosting } from './jsonld';

export type PageKind = 'form' | 'posting' | null;

// Addresses of one job's page on the boards and ATSs people apply through.
const JOB_URLS: RegExp[] = [
  /(^|\.)greenhouse\.io\/(embed\/job_app|[^/]+\/jobs\/\d+)/,
  /[?&]gh_jid=\d+/,
  /jobs\.(eu\.)?lever\.co\/[^/]+\/[0-9a-f-]{36}/,
  /jobs\.ashbyhq\.com\/[^/]+\/[0-9a-f-]{36}/,
  /\.myworkday(jobs|site)\.com\/.*\/job\//,
  /jobs\.smartrecruiters\.com\/[^/]+\/\d+/,
  /apply\.workable\.com\/[^/]+\/j\/[0-9A-F]+/i,
  /ats\.rippling\.com\/[^/]+\/jobs\/[0-9a-f-]+/,
  /\.oraclecloud\.com\/hcmUI\/CandidateExperience\/.*\/job\/\d+/,
  /\.icims\.com\/jobs\/\d+/,
  /jobs\.jobvite\.com\/[^/]+\/job\//,
  /\.bamboohr\.com\/careers\/\d+/,
  /\.taleo\.net\/.*(jobdetail|requisition)/i,
  /\.successfactors\.(com|eu)\/.*(career|job)/i,
  /\.recruitee\.com\/o\//,
  /\.breezy\.hr\/p\//,
  /\.teamtailor\.com\/jobs\/\d+/,
  /\.applytojob\.com\/apply\//,
  /\.eightfold\.ai\/careers.*[?&]pid=/,
  /linkedin\.com\/jobs\/view\/\d+/,
  /linkedin\.com\/jobs\/.*[?&]currentJobId=\d+/,
  /indeed\.[a-z.]+\/(viewjob|m\/viewjob|rc\/clk)/,
  /indeed\.[a-z.]+\/.*[?&]vjk=/,
  /glassdoor\.[a-z.]+\/(job-listing|Job\/.*[?&]jl=)/i,
  /wellfound\.com\/jobs\/\d+/,
  /ziprecruiter\.com\/(c\/[^/]+\/job|jobs\/|k\/)/,
  /dice\.com\/job-detail\//,
  /builtin[a-z]*\.com\/job\//,
  /usajobs\.gov\/job\/\d+/,
  /amazon\.jobs\/[a-z-]+\/jobs\/\d+/,
  /careers\.google\.com\/jobs\/results\/\d+|google\.com\/about\/careers\/applications\/jobs\/results\/\d+/,
  /jobs\.apple\.com\/[a-z-]+\/details\/\d+/,
  /careers\.microsoft\.com\/.*\/job\/\d+/,
];

/** Whether the address is one job's page on a board Wera knows. */
export function isJobUrl(url: string): boolean {
  return JOB_URLS.some((re) => re.test(url));
}

const JOBBY_PATH = /job|career|position|opening|vacanc|requisition|posting|opportunit|role/i;
const APPLY = /^\s*(apply|apply now|apply for (this|the) (job|position|role)|easy apply|apply on company (site|website)|start (your )?application|i'?m interested|submit (your )?application)\s*$/i;
const SECTIONS = [
  /responsibilit/i, /qualification/i, /requirement/i, /what you('|’)?ll do/i, /about the (role|job|position|team)/i,
  /about you/i, /benefits/i, /job description/i, /years of (professional |relevant )?experience/i,
  /equal (employment )?opportunity/i, /who you are/i, /what we('|’)?re looking for/i, /compensation|salary range|pay range/i,
];

/** The page's job title as people see it: the posting's data, the main heading, else the tab title. */
function headline(doc: Document): string {
  const h1 = [...doc.querySelectorAll('h1')].map((h) => (h.textContent ?? '').trim()).find((t) => t.length >= 3 && t.length <= 140);
  return h1 ?? '';
}

/** How much the page reads like one job's posting, 0 (not at all) and up. */
export function jobSignals(doc: Document): number {
  let score = 0;
  if (JOBBY_PATH.test(doc.location.pathname + doc.location.search)) score += 1;
  if (headline(doc)) score += 1;
  const buttons = doc.querySelectorAll('a, button, input[type="submit"], [role="button"]');
  for (const b of [...buttons].slice(0, 600)) {
    const text = b instanceof HTMLInputElement ? b.value : (b.textContent ?? '');
    if (text.length < 60 && APPLY.test(text)) {
      score += 2;
      break;
    }
  }
  const text = (doc.body?.innerText || doc.body?.textContent || '').slice(0, 40000);
  const hits = SECTIONS.filter((re) => re.test(text)).length;
  if (hits >= 2) score += 2;
  if (hits >= 4) score += 1;
  return score;
}

/** Whether the page holds an application form (here or in an embedded ATS frame). */
export function hasApplicationForm(doc: Document): boolean {
  const fields = collectFields(doc).map(classify);
  const known = fields.filter((p) => p !== null && p !== 'question' && p !== 'consent').length;
  // An application asks who you are: a name or an email, and more.
  if (known >= 3 && fields.some((p) => p === 'email' || p === 'first_name' || p === 'full_name' || p === 'resume')) return true;
  // A careers page with the application embedded from its ATS.
  const embedded = new Set(formFrameOrigins(doc));
  return [...doc.querySelectorAll('iframe')].some((f) => {
    const src = f.getAttribute('src') ?? '';
    if (EMBEDDED_FORM.test(src)) return true;
    try {
      const u = new URL(src, doc.location.href);
      return embedded.has(u.origin) && /apply|application/i.test(u.pathname);
    } catch {
      return false;
    }
  });
}

const EMBEDDED_FORM = /greenhouse\.io\/embed\/job_app|jobs\.(eu\.)?lever\.co\/[^?#]+\/apply|ashbyhq\.com\/[^?#]+\/(application|embed)/;

/** Whether the page is an application form, one job's posting, or neither. */
export function pageKind(doc: Document): PageKind {
  // The bridge marks the user's own Wera dashboard: its forms are not applications.
  if (doc.documentElement.dataset.weraExtension) return null;
  if (hasApplicationForm(doc)) return 'form';
  if (readJobPosting(doc, doc.location.href)) return 'posting';
  if (isJobUrl(doc.location.href) && headline(doc)) return 'posting';
  return jobSignals(doc) >= 5 ? 'posting' : null;
}

/** The company slug in a job board's address ("acme" in jobs.lever.co/acme/...), made readable. */
function companyFromUrl(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return '';
  }
  const first = u.pathname.split('/').filter(Boolean)[0] ?? '';
  let slug = '';
  if (/greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com|workable\.com|rippling\.com|jobvite\.com/.test(u.hostname)) slug = first;
  else if (/myworkdayjobs\.com|icims\.com|bamboohr\.com|recruitee\.com|breezy\.hr|teamtailor\.com|applytojob\.com/.test(u.hostname)) slug = u.hostname.split('.')[0] ?? '';
  if (!slug || slug === 'embed' || slug === 'jobs' || /^\d+$/.test(slug)) return '';
  return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** A first look at the job: its title and company, for the Wera dock (the panel reads it fully). */
export function jobSummary(doc: Document): { title: string; company: string } {
  const data = readJobPosting(doc, doc.location.href);
  if (data) return { title: data.title, company: data.company || companyFromUrl(doc.location.href) };
  const meta = (name: string) => doc.querySelector<HTMLMetaElement>(`meta[property="${name}"], meta[name="${name}"]`)?.content?.trim() ?? '';
  // LinkedIn and Indeed name the company next to the title.
  const site = doc.querySelector('.job-details-jobs-unified-top-card__company-name, [data-testid="inlineHeader-companyName"], [data-company-name="true"]')?.textContent?.trim() ?? '';
  const title = headline(doc) || meta('og:title') || doc.title.split(/\s[|–-]\s/)[0]!.trim();
  return { title: title.slice(0, 140), company: (site || companyFromUrl(doc.location.href) || meta('og:site_name')).slice(0, 80) };
}
