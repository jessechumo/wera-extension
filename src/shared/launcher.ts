// The Wera button (launcher.js) runs on the sites the user has allowed
// Wera to read: those are exactly the sites Chrome lets it run on, so it
// is registered for the granted site patterns (never the Wera server).

const SCRIPT_ID = 'wera-launcher';

/** The granted site patterns the button may run on. */
export function launcherMatches(origins: string[], server: string | null): string[] {
  const own = server ? `${server}/*` : '';
  return [...new Set(origins.filter((o) => /^(https?|\*):\/\//.test(o) && o !== own))].sort();
}

/** Registers the button for the granted sites (or removes it when there are none). */
export async function syncLauncher(server: string | null): Promise<void> {
  if (!chrome.scripting?.registerContentScripts || !chrome.permissions?.getAll) return;
  const { origins = [] } = await chrome.permissions.getAll();
  const matches = server ? launcherMatches(origins, server) : [];
  const have = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] }).catch(() => []);
  if (have.length && JSON.stringify([...(have[0]!.matches ?? [])].sort()) === JSON.stringify(matches)) return;
  if (have.length) await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] }).catch(() => {});
  if (!matches.length) return;
  await chrome.scripting.registerContentScripts([
    { id: SCRIPT_ID, matches, js: ['launcher.js'], runAt: 'document_idle', persistAcrossSessions: true },
  ]).catch(() => {});
}
