// Many company career pages embed the application form from their
// applicant tracking system in an iframe (Greenhouse's "grnhse_iframe",
// Lever, iCIMS...). Wera fills it there too, once it may read that site.

const ATS_HOSTS =
  /(^|\.)(greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs\.com|workday\.com|icims\.com|smartrecruiters\.com|jobvite\.com|bamboohr\.com|workable\.com|recruitee\.com|breezy\.hr|applytojob\.com|teamtailor\.com|personio\.(de|com)|rippling(-ats)?\.com|dover\.(com|io)|gem\.com|paylocity\.com|ultipro\.com|ukg\.net|taleo\.net|successfactors\.(com|eu)|oraclecloud\.com|eightfold\.ai|pinpointhq\.com|jazzhr\.com)$/;
const APPLY_PATH = /apply|application|job|career|candidate/i;

/**
 * Origins of embedded frames on other sites that look like an application
 * form: a known applicant tracking system, or an apply/job path, and big
 * enough to be a form (not an ad, a video or a captcha).
 */
export function formFrameOrigins(doc: Document): string[] {
  const out = new Set<string>();
  for (const f of doc.querySelectorAll('iframe')) {
    let u: URL;
    try {
      u = new URL(f.getAttribute('src') ?? '', doc.location.href);
    } catch {
      continue;
    }
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.origin === doc.location.origin) continue;
    if (!ATS_HOSTS.test(u.hostname) && !APPLY_PATH.test(u.pathname + u.search)) continue;
    const r = f.getBoundingClientRect();
    // jsdom and frames not laid out yet report 0; trust their size attributes.
    const w = r.width || Number(f.getAttribute('width')) || 0;
    const h = r.height || Number(f.getAttribute('height')) || 0;
    if ((w || h) && (w < 200 || h < 150)) continue;
    out.add(u.origin);
  }
  return [...out].slice(0, 4);
}
