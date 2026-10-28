// Addresses as Wera compares them: by origin (a site) or host. A malformed
// address belongs to no site.

export function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

/** The site a host belongs to ("greenhouse.io" for job-boards.greenhouse.io; "acme.co.uk" for careers.acme.co.uk). */
export function siteOf(host: string): string {
  const parts = host.toLowerCase().replace(/:\d+$/, '').split('.').filter(Boolean);
  if (parts.length <= 2) return parts.join('.');
  const [second, last] = parts.slice(-2) as [string, string];
  const n = last.length === 2 && second.length <= 3 ? 3 : 2;
  return parts.slice(-n).join('.');
}
