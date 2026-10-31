// Tells a job page from any other page by positive evidence, never by a
// page merely sounding like one: the address of a job on a system or board
// Wera knows, the page's schema.org JobPosting, an application embedded
// from its applicant tracking system, a form only an application would be,
// or a page on a careers address that reads like a posting and has a way
// to apply. Shopping, mail, banks and the rest have none of these, so Wera
// never shows there (the toolbar icon still opens it anywhere). Reads the
// page only; sends nothing anywhere.
import type { FieldPurpose } from '../shared/types';
import { classify } from './classify';
import { ENTRY_PURPOSES } from './entries';
import { collectFields } from './fields';
import { outOfSight } from './hidden';
import { isApplicantHost } from './frames';
import { readJobPosting } from './jsonld';
import { siteFor } from './sites';

export type PageKind = 'form' | 'posting' | null;

// One job's page or its application, on the systems and boards people apply
// through. Tested on the host and path, so a link to one in another page's
// query (a search result, a redirect) is not one.
const JOB_ADDRESSES: RegExp[] = [
  // Applicant tracking systems.
  /^(boards|job-boards)(\.eu)?\.greenhouse\.io\/(embed\/job_app|[^/]+\/jobs\/\d+)/,
  /^jobs(\.eu)?\.lever\.co\/[^/]+\/[0-9a-f-]{36}/,
  /^jobs\.ashbyhq\.com\/[^/]+\/[0-9a-f-]{36}/,
  /\.myworkday(jobs|site)\.com\/.*\/job\//,
  /^jobs\.smartrecruiters\.com\/(oneclick-ui\/|[^/]+\/\d+)/,
  /^apply\.workable\.com\/[^/]+\/j\/[0-9a-z]+/i,
  /^jobs\.workable\.com\/.*[?&]selectedjobid=/i,
  /^ats\.rippling\.com\/[^/]+\/jobs\/[0-9a-f-]+/,
  /\.rippling-ats\.com\/job\//,
  /\/hcmui\/candidateexperience\/.*\/(job|apply)\//i,
  /\.icims\.com\/jobs\/\d+/,
  /\/careers-home\/jobs\/\d+/,
  /^jobs\.jobvite\.com\/[^/]+\/job\//,
  /\.bamboohr\.com\/(careers|jobs)\/(\d+|view\.php)/,
  /\.taleo\.net\/.*(jobdetail|jobapply|application\.jss|flow\.jsf|requisition)/i,
  /\.successfactors\.(com|eu)\/.*(career|job)/i,
  /\.sapsf\.(com|eu)\/(career|portalcareer)/,
  /\.recruitee\.com\/o\//,
  /\.breezy\.hr\/(p\/|[^?]*\/apply)/,
  /\.teamtailor\.com\/(.*\/)?jobs\/\d+/,
  /\.applytojob\.com\/apply\//,
  /\.eightfold\.ai\/careers(\/job\/|.*[?&]pid=)/,
  /^explore\.jobs\.netflix\.net\/careers\/job\//,
  /\.jobs\.personio\.(de|com)\/job\//,
  /\.pinpointhq\.com\/(.*\/)?postings\//,
  /\.avature\.net\/.*(jobdetail|application)/i,
  /\.csod\.com\/.*(requisition|job)/i,
  /\/tgnewui\/search\//i,
  /^jobs\.dayforcehcm\.com\/.*\/jobs\/\d+/,
  /^recruiting\.paylocity\.com\/recruiting\/jobs\/(details|apply)/i,
  /\.paycomonline\.net\/.*(jobs|careers)/i,
  /^(workforcenow|recruiting|myjobs)\.adp\.com\/.*(recruitment|srccar|cx)/,
  /\.ultipro\.(com|ca)\/.*\/jobboard\/.*opportunity(detail|apply)/i,
  /^jobs\.gem\.com\/[^/]+\/[0-9a-z-]+/,
  /^app\.dover\.com\/(apply|jobs)\//,
  /\.comeet\.(com|co)\/jobs\//,
  /\.freshteam\.com\/jobs\//,
  /\.zohorecruit\.(com|eu|in)\/.*(jobs|careers)/,
  /^jobs\.gusto\.com\/postings\//,
  /^app\.trinethire\.com\/companies\/.*\/jobs\//,
  /^careers\.jobscore\.com\/(careers\/|apply_flow\/)/,
  /\.governmentjobs\.com\/(careers\/[^/]+\/)?jobs\/\d+/,
  /\.tal\.net\/.*(opp|candidate)\//,
  // Any site with an embedded application: the systems' own query marks.
  /[?&](gh_jid|ashby_jid)=[\w-]+/,
  /[?&]leverappid=/i,
  // Job boards.
  /(^|\.)linkedin\.com\/jobs\/view\/\d+/,
  /(^|\.)linkedin\.com\/jobs\/.*[?&]currentjobid=\d+/i,
  /(^|\.)indeed\.[a-z.]+\/(viewjob|m\/viewjob|m\/basecamp\/viewjob|rc\/clk)/,
  /(^|\.)indeed\.[a-z.]+\/.*[?&]vjk=/,
  /^(smartapply|apply)\.indeed\.com\//,
  /(^|\.)glassdoor\.[a-z.]+\/(job-listing|job\/.*[?&]jl=)/i,
  /(^|\.)wellfound\.com\/jobs\/\d+/,
  /(^|\.)ziprecruiter\.com\/(c\/[^/]+\/job|jobs\/|k\/)/,
  /(^|\.)dice\.com\/job-detail\//,
  /(^|\.)builtin[a-z]*\.com\/job\//,
  /(^|\.)usajobs\.gov\/job\/\d+/,
  /(^|\.)workatastartup\.com\/jobs\/\d+/,
  /(^|\.)ycombinator\.com\/companies\/[^/]+\/jobs\//,
  /(^|\.)joinhandshake\.com\/.*(jobs|postings)\/\d+/,
  /(^|\.)welcometothejungle\.com\/.*\/jobs\//,
  /(^|\.)otta\.com\/jobs\//,
  /(^|\.)seek\.(com|com\.au|co\.nz)\/job\/\d+/,
  /(^|\.)naukri\.com\/job-listings-/,
  /(^|\.)reed\.co\.uk\/jobs\//,
  /(^|\.)totaljobs\.com\/job\//,
  /(^|\.)monster\.[a-z.]+\/job-openings\//,
  /(^|\.)careerbuilder\.com\/job\//,
  /(^|\.)simplyhired\.[a-z.]+\/job\//,
  // Employers with their own systems.
  /(^|\.)amazon\.jobs\/[a-z-]+\/jobs\/\d+/,
  /^(www\.)?google\.com\/about\/careers\/applications\/(jobs\/results\/\d+|apply\/)/,
  /^careers\.google\.com\/jobs\/results\/\d+/,
  /^jobs\.apple\.com\/([a-z-]+\/details\/\d+|app\/[a-z-]+\/apply\/)/,
  /(^|\.)careers\.microsoft\.com\/.*\/job\/\d+/,
  /(^|\.)(metacareers|facebookcareers)\.com\/(jobs\/\d+|profile\/)/,
  /(^|\.)tesla\.com\/careers\/search\/job\//,
  /^careers\.ibm\.com\/(job\/|apply\/)/,
  /(^|\.)uber\.com\/careers\/(list\/\d+|apply)/,
  /^(www\.)?lifeattiktok\.com\/(position\/|resume\/)/,
];

// Mail, calendars, documents, chat, AI assistants, video and social feeds:
// a job email or a recruiter's message there can hold all the evidence a
// job page does, and an inbox full of "Thank you for applying" looks like a
// confirmation, but these are never the job's own page, and neither is a
// frame inside them.
const NOT_JOB_SITES: RegExp[] = [
  /^(web)?mail\./,
  /^(inbox|calendar|docs|drive|sheets|slides|meet|chat|keep|photos|contacts|gemini|news)\.google\.com$/,
  /^(outlook\.(live|office|office365)\.com|outlook\.cloud\.microsoft|teams\.(microsoft|live)\.com|.*\.sharepoint\.com|onedrive\.live\.com)$/,
  /^(app\.fastmail\.com|(www\.)?icloud\.com|(www\.)?hey\.com|app\.hey\.com)$/,
  /^(app\.slack\.com|[^.]+\.slack\.com|web\.whatsapp\.com|(www\.)?messenger\.com|web\.telegram\.org|app\.zoom\.us)$/,
  /^(chatgpt\.com|chat\.openai\.com|claude\.ai|(www\.)?perplexity\.ai|copilot\.microsoft\.com)$/,
  /^((www|m)\.youtube\.com|(www\.)?netflix\.com|(www\.)?twitch\.tv|open\.spotify\.com|(www\.)?(x|twitter|facebook|instagram|tiktok|reddit)\.com)$/,
  /^(app\.asana\.com|trello\.com|[^.]+\.atlassian\.net)$/,
];
// Apps on a host that also has its careers pages (discord.com/careers): only these paths.
const NOT_JOB_PATHS: RegExp[] = [/^discord\.com\/(channels|app)\b/, /^(www\.)?linkedin\.com\/(messaging|feed|mynetwork|notifications)\b/];

/** The address as the patterns read it: lowercased host, then path and query. */
function addressOf(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.toLowerCase()}${u.pathname}${u.search}`;
  } catch {
    return '';
  }
}

/** Whether the page belongs to mail, chat, documents or the like: never a job's own page. */
export function isNotJobSite(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const host = u.hostname.toLowerCase();
  return NOT_JOB_SITES.some((re) => re.test(host)) || NOT_JOB_PATHS.some((re) => re.test(host + u.pathname));
}

/** Whether this document is a frame inside such a site (Gmail is full of small frames from other hosts). */
function insideNotJobSite(doc: Document): boolean {
  const ancestors = doc.location.ancestorOrigins;
  return !!ancestors?.length && isNotJobSite(ancestors[ancestors.length - 1]!);
}

/** Whether the address is one job's page, or its application, on a system or board Wera knows. */
export function isJobUrl(url: string): boolean {
  const address = addressOf(url);
  return !!address && JOB_ADDRESSES.some((re) => re.test(address));
}

// Careers words as whole parts of the path or host ("/careers/sre", "jobs.acme.com"), not letters
// inside a tracking token, "/controller" or "/position-fixed-table".
const CAREER_PATH = /(^|[/_-])(careers?|jobs?|job-openings?|openings?|open-(roles|positions)|roles?|positions?|vacanc(y|ies)|opportunit(y|ies)|requisitions?|join-us|join-our-team|work-with-us|hiring)([/_.-]|$)/i;
const CAREER_HOST = /^(careers?|jobs?|hiring|recruiting|talent)[.-]/i;
// "/apply" alone is as likely a credit card or a college.
const APPLY_ADDRESS = /(^|[/_-])(apply|application)([/_.-]|$)/i;
// A careers site's other forms: they ask who you are, and are no application.
const NOT_APPLYING = /(^|[/_-])(alerts?|subscribe|newsletter|sign-?in|log-?in|contact)([/_.-]|$)/i;

/** Whether the address itself says careers: not proof of a job, but a job's page has one. */
export function careerAddress(url: string): boolean {
  try {
    const u = new URL(url);
    return !NOT_APPLYING.test(u.pathname) && (CAREER_HOST.test(u.hostname) || CAREER_PATH.test(u.pathname));
  } catch {
    return false;
  }
}

/** Whether the address is an application of some kind. */
function applyAddress(url: string): boolean {
  try {
    const u = new URL(url);
    return !NOT_APPLYING.test(u.pathname) && (/^apply[.-]/i.test(u.hostname) || APPLY_ADDRESS.test(u.pathname));
  } catch {
    return false;
  }
}

const APPLY = /^\s*(apply|apply now|apply (for|to) (this|the) (job|position|role|opening|vacancy)|apply (online|here|today)|easy apply|quick apply|apply on (the )?(company|employer)('s)? (site|website)|(start|begin) (your |my )?application|submit (your |my )?application|i'?m interested)\s*[→›>]?\s*$/i;
const SECTIONS = [
  /responsibilit/i, /qualification/i, /requirement/i, /what you('|’)?ll do/i, /about the (role|job|position|team)/i,
  /about you/i, /benefits/i, /job description/i, /years of (professional |relevant )?experience/i,
  /equal (employment )?opportunity/i, /who you are/i, /what we('|’)?re looking for/i, /compensation|salary range|pay range/i,
];
// A job's address that no longer has the job.
const GONE = /\b(page|job|position|posting|role) (was )?not found\b|^(404|not found)\b|no longer (available|accepting|open)\b|job (has )?(expired|closed)\b/i;

/** The page's job title as people see it: the main heading. */
function headline(doc: Document): string {
  const h1 = [...doc.querySelectorAll('h1')].map((h) => (h.textContent ?? '').trim()).find((t) => t.length >= 3 && t.length <= 140);
  return h1 ?? '';
}

/** Whether the page has a way to apply: on a careers address a bare "Apply" means that; on a shop it applies a coupon. */
function hasApplyButton(doc: Document): boolean {
  const buttons = doc.querySelectorAll('a, button, input[type="submit"], [role="button"]');
  return [...buttons].slice(0, 600).some((b) => {
    const text = b instanceof HTMLInputElement ? b.value : (b.textContent ?? '');
    return text.length < 60 && APPLY.test(text);
  });
}

/** The page's way to apply, when it shows one (on a job page: on a shop this would be a coupon's button). */
export function findApply(doc: Document): HTMLElement | null {
  const buttons = [...doc.querySelectorAll<HTMLElement>('a, button, input[type="submit"], [role="button"]')].slice(0, 600);
  const says = (re: RegExp) => buttons.find((b) => {
    const text = b instanceof HTMLInputElement ? b.value : (b.textContent ?? '');
    return text.length < 60 && re.test(text) && !outOfSight(b);
  });
  // Ashby has an Application tab beside the posting.
  return says(APPLY) ?? says(/^\s*application\s*$/i) ?? null;
}

/** Whether a page with no job data reads like one job's posting: a careers address, a title, sections and a way to apply. */
function readsLikePosting(doc: Document): boolean {
  if (!careerAddress(doc.location.href) || !headline(doc) || !hasApplyButton(doc)) return false;
  const text = (doc.body?.innerText || doc.body?.textContent || '').slice(0, 40000);
  return SECTIONS.filter((re) => re.test(text)).length >= 3;
}

// What only a job application asks.
const APPLICATION_ONLY = new Set<FieldPurpose>([
  'resume', 'cover_letter', 'authorized_to_work', 'needs_sponsorship', 'authorized_no_sponsorship', 'visa_status', 'salary_expectation',
  'notice_period', 'previously_employed', ...ENTRY_PURPOSES,
]);
// What an application asks, and so does a college's, a clinic's or a profile page.
const APPLICATION_TOO = new Set<FieldPurpose>([
  'linkedin', 'github', 'portfolio', 'school', 'degree', 'major', 'graduation_year', 'gpa', 'years_experience', 'start_date', 'willing_to_relocate',
  'gender', 'race', 'hispanic', 'veteran', 'disability',
]);

/**
 * Whether this document itself holds an application form. A contact, demo,
 * checkout or sign-up form asks who you are too, so that alone is never
 * enough: a resume upload beside it is, two things only an application
 * asks are (a later step need not ask who you are again), and on a job's
 * own address so are the usual questions of an application.
 */
export function ownApplicationForm(doc: Document): boolean {
  const url = doc.location.href;
  const applicantSite = !!siteFor(doc) || isJobUrl(url) || isApplicantHost(doc.location.hostname);
  // Cheap: most pages have no form, and web components only hide fields on systems Wera knows.
  if (!applicantSite && doc.querySelectorAll('input, select, textarea').length < 2) return false;
  const fields = collectFields(doc).map(classify);
  const known = fields.filter((p) => p !== null && p !== 'question' && p !== 'consent').length;
  if (known < 2) return false;
  const only = new Set(fields.filter((p) => p !== null && APPLICATION_ONLY.has(p)));
  const too = new Set(fields.filter((p) => p !== null && APPLICATION_TOO.has(p)));
  const who = fields.some((p) => p === 'email' || p === 'first_name' || p === 'full_name');
  if (only.size >= 2 || (only.has('resume') && who)) return true;
  if (known < 3) return false;
  // The first step of a long application may ask no more than who you are.
  if (applicantSite || careerAddress(url)) return who || only.size + too.size >= 2;
  return applyAddress(url) && (who ? only.size + too.size >= 1 : only.size + too.size >= 2);
}

/** Whether the page holds an application form (here or in an embedded applicant system's frame). */
export function hasApplicationForm(doc: Document): boolean {
  if (ownApplicationForm(doc)) return true;
  // A careers page with the application embedded from its applicant system.
  return [...doc.querySelectorAll('iframe')].some((f) => {
    const src = f.getAttribute('src') ?? '';
    if (EMBEDDED_FORM.test(src)) return true;
    try {
      const u = new URL(src, doc.location.href);
      // Any other frame of a system (its job search, say) speaks for itself if it holds a form.
      return isApplicantHost(u.hostname) && /apply|application/i.test(u.pathname);
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
  const url = doc.location.href;
  if (isNotJobSite(url) || insideNotJobSite(doc)) return null;
  if (hasApplicationForm(doc)) return 'form';
  if (readJobPosting(doc, url)) return 'posting';
  if (isJobUrl(url) && headline(doc) && !GONE.test(`${headline(doc)} ${doc.title}`)) return 'posting';
  return readsLikePosting(doc) ? 'posting' : null;
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

/** A title without what a form wraps it in: "Apply: SRE", "Job Application for SRE at Acme". */
function bareTitle(title: string, company: string): string {
  const t = title.replace(/^\s*(job\s+)?(application|apply)\s*(for|to|:|-|–)\s*/i, '').trim();
  const at = company ? t.toLowerCase().lastIndexOf(` at ${company.toLowerCase()}`) : -1;
  return at > 0 ? t.slice(0, at).trim() : t;
}

/** A first look at the job: its title and company, for the Wera panel's first look (it reads the page fully later). */
export function jobSummary(doc: Document): { title: string; company: string } {
  const data = readJobPosting(doc, doc.location.href);
  if (data) return { title: data.title, company: data.company || companyFromUrl(doc.location.href) };
  const meta = (name: string) => doc.querySelector<HTMLMetaElement>(`meta[property="${name}"], meta[name="${name}"]`)?.content?.trim() ?? '';
  // LinkedIn and Indeed name the company next to the title.
  const site = doc.querySelector('.job-details-jobs-unified-top-card__company-name, [data-testid="inlineHeader-companyName"], [data-company-name="true"]')?.textContent?.trim() ?? '';
  const title = headline(doc) || meta('og:title') || doc.title.split(/\s[|–-]\s/)[0]!.trim();
  const company = (site || companyFromUrl(doc.location.href) || meta('og:site_name')).slice(0, 80);
  return { title: bareTitle(title, company).slice(0, 140), company };
}
