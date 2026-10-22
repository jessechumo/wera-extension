// The extension wears the theme the user picked in the Wera dashboard
// (Settings: system, light or dark). The bridge on the dashboard reads
// that choice and keeps it here; the side panel and the dock on job pages
// both follow it, so the apps never disagree.

export type ThemePref = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

export const THEME_KEY = 'wera.theme';

/** The dashboard's own storage key for the choice (see wera-frontend src/lib/theme.tsx). */
export const DASHBOARD_THEME_KEY = 'wera-theme';

export function asPref(v: unknown): ThemePref {
  return v === 'light' || v === 'dark' ? v : 'system';
}

/** The theme to draw: the choice, or the system's when the choice is "system" (as the dashboard does). */
export function resolveTheme(pref: ThemePref, systemLight = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches): Theme {
  return pref === 'system' ? (systemLight ? 'light' : 'dark') : pref;
}

export async function loadThemePref(): Promise<ThemePref> {
  try {
    return asPref((await chrome.storage.local.get(THEME_KEY))[THEME_KEY]);
  } catch {
    return 'system';
  }
}

/**
 * Calls apply with the theme now and whenever it changes (in the
 * dashboard, or the system's when following it). Returns a stop.
 */
export function followTheme(apply: (t: Theme) => void): () => void {
  let pref: ThemePref = 'system';
  const draw = () => apply(resolveTheme(pref));
  void loadThemePref().then((p) => {
    pref = p;
    draw();
  });
  draw();
  const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && THEME_KEY in changes) {
      pref = asPref(changes[THEME_KEY].newValue);
      draw();
    }
  };
  chrome.storage.onChanged?.addListener(onStorage);
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : null;
  mq?.addEventListener?.('change', draw);
  return () => {
    chrome.storage.onChanged?.removeListener(onStorage);
    mq?.removeEventListener?.('change', draw);
  };
}
