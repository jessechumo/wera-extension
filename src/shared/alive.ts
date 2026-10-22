// When the extension is reloaded or updated, the scripts it left in open
// tabs are cut off from it: every chrome.* call then throws "Extension
// context invalidated". Those scripts check here and stop quietly.

/** Whether this script still belongs to a running extension. */
export function extensionAlive(): boolean {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

/** Sends to the extension; null when nobody answers or the extension was reloaded. */
export function sendSafe<T = unknown>(msg: unknown): Promise<T | null> {
  if (!extensionAlive()) return Promise.resolve(null);
  try {
    return chrome.runtime.sendMessage<unknown, T>(msg).then((r) => r ?? null, () => null);
  } catch {
    return Promise.resolve(null);
  }
}
