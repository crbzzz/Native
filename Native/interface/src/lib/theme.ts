export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'nativeaid.theme';

export function getStoredTheme(): ThemeMode {
  const v = localStorage.getItem(STORAGE_KEY);
  return v === 'dark' ? 'dark' : 'light';
}

export function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
}

export function setTheme(mode: ThemeMode) {
  localStorage.setItem(STORAGE_KEY, mode);
  applyTheme(mode);
}

export function toggleTheme(): ThemeMode {
  const next: ThemeMode = getStoredTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}
