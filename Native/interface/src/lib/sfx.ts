const SFX_KEY = 'native:sfxEnabled';

export function getSfxEnabled(): boolean {
  try {
    const raw = window.localStorage.getItem(SFX_KEY);
    if (raw == null) return true;
    const v = raw.trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes' || v === 'on';
  } catch {
    return true;
  }
}

export function setSfxEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(SFX_KEY, enabled ? '1' : '0');
  } catch {
    // ignore
  }
}
