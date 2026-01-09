import { Check, ChevronsUpDown, LogOut, Moon, Sun, User, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { signOut } from '../lib/auth';
import { getStoredTheme, setTheme, type ThemeMode } from '../lib/theme';
import { getSfxEnabled, setSfxEnabled } from '../lib/sfx';

interface HeaderProps {
  onHome?: () => void;
}

export default function Header({ onHome }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setThemeState] = useState<ThemeMode>('light');
  const [sfxEnabled, setSfxEnabledState] = useState(true);

  const modelOptions = useMemo(() => [{ id: 'mistral-small-latest', label: 'mistral-small-latest' }], []);
  const [model, setModel] = useState(modelOptions[0]?.id ?? 'mistral-small-latest');

  useEffect(() => {
    setThemeState(getStoredTheme());
    setSfxEnabledState(getSfxEnabled());
  }, []);

  const handleLogout = async () => {
    await signOut();
    onHome?.();
  };

  const settingsModal =
    typeof document === 'undefined'
      ? null
      : createPortal(
          <div
            className={
              'fixed inset-0 z-[9999] transition-opacity duration-200 ' +
              (menuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none')
            }
            aria-hidden={!menuOpen}
            onMouseDown={() => setMenuOpen(false)}
          >
            <div className="absolute inset-0 bg-black/10 dark:bg-black/40" />

            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div
                role="dialog"
                aria-label="Personal settings"
                onMouseDown={(e) => e.stopPropagation()}
                className={
                  'w-[min(460px,calc(100vw-2rem))] max-h-[70vh] overflow-auto rounded-3xl border border-white/45 dark:border-white/15 ' +
                  'bg-white/35 dark:bg-white/10 ' +
                  'backdrop-blur-md backdrop-saturate-150 shadow-xl ' +
                  'transform-gpu transition-all duration-200 ease-out ' +
                  (menuOpen ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-2')
                }
              >
                <div className="px-6 pt-5 pb-3 flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Native AI settings</p>
                    <p className="text-xs text-gray-600 dark:text-gray-300">Theme & model</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMenuOpen(false)}
                    className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/20 dark:hover:bg-white/10 transition-colors"
                    title="Close"
                  >
                    <X size={18} className="text-gray-900 dark:text-gray-100" />
                  </button>
                </div>

                <div className="px-6 pb-5 space-y-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      const next: ThemeMode = theme === 'dark' ? 'light' : 'dark';
                      setTheme(next);
                      setThemeState(next);
                    }}
                    className="w-full flex items-center justify-between px-4 py-2.5 rounded-2xl border border-white/45 dark:border-white/15 bg-white/25 dark:bg-white/10 hover:bg-white/35 dark:hover:bg-white/15 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {theme === 'dark' ? (
                        <Moon size={18} className="text-gray-900 dark:text-gray-100" />
                      ) : (
                        <Sun size={18} className="text-gray-900 dark:text-gray-100" />
                      )}
                      <span className="text-sm text-gray-900 dark:text-gray-100">Dark theme</span>
                    </div>
                    <span className="text-xs text-gray-700 dark:text-gray-300">{theme === 'dark' ? 'On' : 'Off'}</span>
                  </button>

                  <div className="w-full px-4 py-2.5 rounded-2xl border border-white/45 dark:border-white/15 bg-white/25 dark:bg-white/10">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <ChevronsUpDown size={18} className="text-gray-700 dark:text-gray-200" />
                        <div>
                          <p className="text-sm text-gray-900 dark:text-gray-100">Model</p>
                          <p className="text-xs text-gray-600 dark:text-gray-300">Only one available</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check size={16} className="text-gray-700 dark:text-gray-200" />
                        <select
                          value={model}
                          onChange={(e) => setModel(e.target.value)}
                          className="text-sm bg-transparent text-gray-900 dark:text-gray-100 outline-none"
                        >
                          {modelOptions.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const next = !sfxEnabled;
                      setSfxEnabled(next);
                      setSfxEnabledState(next);
                    }}
                    className="w-full flex items-center justify-between px-4 py-2.5 rounded-2xl border border-white/45 dark:border-white/15 bg-white/25 dark:bg-white/10 hover:bg-white/35 dark:hover:bg-white/15 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-900 dark:text-gray-100">Sound effects</span>
                    </div>
                    <span className="text-xs text-gray-700 dark:text-gray-300">{sfxEnabled ? 'On' : 'Off'}</span>
                  </button>

                  <button
                    onClick={handleLogout}
                    className="w-full px-4 py-3 rounded-2xl border border-white/45 dark:border-white/15 bg-white/25 dark:bg-white/10 hover:bg-white/35 dark:hover:bg-white/15 transition-colors flex items-center justify-center gap-2"
                  >
                    <LogOut size={16} className="text-gray-900 dark:text-gray-100" />
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Sign Out</span>
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        );

  return (
    <div className="fixed top-4 right-4 z-60">
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        className="w-10 h-10 flex items-center justify-center bg-white/30 text-gray-900 dark:text-gray-100 border border-white/40 dark:border-white/15 rounded-full hover:bg-white/40 transition-colors backdrop-blur-md"
        title="Settings"
      >
        <User size={20} />
      </button>

      {settingsModal}
    </div>
  );
}
