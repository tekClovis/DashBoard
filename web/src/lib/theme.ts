import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

/** Must match the inline pre-mount script in index.html. */
export const THEME_STORAGE_KEY = 'theme';

const listeners = new Set<() => void>();

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The `dark` class set by index.html's pre-mount script is the source of truth, so every toggle stays in sync. */
function getTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function useTheme(): [Theme, () => void] {
  const theme = useSyncExternalStore(subscribe, getTheme);
  return [theme, () => applyTheme(theme === 'dark' ? 'light' : 'dark')];
}
