import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, SETTINGS_KEY, type Settings } from '../shared/settings';

/** The user's settings, kept in step with other extension pages. */
export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  useEffect(() => {
    void loadSettings().then(setSettings).catch(() => {});
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[SETTINGS_KEY]) setSettings({ ...DEFAULT_SETTINGS, ...(changes[SETTINGS_KEY].newValue as Partial<Settings>) });
    };
    chrome.storage.onChanged?.addListener(onChanged);
    return () => chrome.storage.onChanged?.removeListener(onChanged);
  }, []);
  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      void saveSettings(next);
      return next;
    });
  }, []);
  return [settings, update];
}
