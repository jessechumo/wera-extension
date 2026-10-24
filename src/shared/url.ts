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
