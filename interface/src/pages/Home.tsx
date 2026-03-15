import { signOut } from '../lib/auth';
import { Plus, Grid, LogIn, LogOut } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getAccessToken } from '../lib/auth';
import Header from '../components/Header';

type PlanId = 'free' | 'pro';

interface HomeProps {
  user: any;
  onNewChat: () => void;
  onApps: () => void;
  onOpenAuth: () => void;
  onDocs: () => void;
  onPricing: () => void;
  onChangelog: () => void;
}

export default function Home({ user, onNewChat, onApps, onOpenAuth, onDocs, onPricing, onChangelog }: HomeProps) {
  const handleLogout = async () => {
    await signOut();
  };

  const [menuOpen, setMenuOpen] = useState(false);
  const [plan, setPlan] = useState<PlanId | null>(null);

  useEffect(() => {
    const run = async () => {
      if (!user) {
        setPlan(null);
        return;
      }
      const token = await getAccessToken();
      if (!token) {
        setPlan(null);
        return;
      }
      try {
        const res = await fetch('/api/usage', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) {
          setPlan(null);
          return;
        }
        const data = (await res.json()) as { plan?: PlanId };
        setPlan(data.plan ?? null);
      } catch {
        setPlan(null);
      }
    };

    void run();
  }, [user]);

  const getStartedLabel = plan === 'pro' ? 'PRO' : 'Get started';

  return (
    <div className="min-h-screen bg-transparent">
      <div className="fixed top-0 left-0 right-0 h-16 bg-white/10 dark:bg-slate-950/15 border-b border-white/25 dark:border-white/10 backdrop-blur-md flex items-center px-4 sm:px-6 z-40">
        <div className="flex items-center gap-3 min-w-0">
          <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">Native AI</div>
        </div>

        <div className="flex-1" />

        <div className="hidden sm:flex items-center gap-5">
          <button
            type="button"
            onClick={onDocs}
            className="text-sm text-gray-700 hover:text-gray-900 dark:text-white/70 dark:hover:text-white transition-colors"
          >
            Documentation
          </button>
          <button
            type="button"
            onClick={onPricing}
            className="text-sm text-gray-700 hover:text-gray-900 dark:text-white/70 dark:hover:text-white transition-colors"
          >
            Plans
          </button>
          <button
            type="button"
            onClick={onChangelog}
            className="text-sm text-gray-700 hover:text-gray-900 dark:text-white/70 dark:hover:text-white transition-colors"
          >
            Changelog
          </button>

          <button
            type="button"
            onClick={onPricing}
            className="ml-2 inline-flex items-center justify-center px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm transition-colors"
          >
            {getStartedLabel}
          </button>
        </div>

        <div className="hidden sm:block ml-3">
          <Header placement="inline" />
        </div>

        <div className="sm:hidden flex items-center gap-3">
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="px-3 py-2 rounded-xl border border-white/40 bg-white/25 hover:bg-white/35 transition-colors text-sm text-gray-800 dark:text-white/80 dark:bg-white/10 dark:border-white/12"
            >
              Menu
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-44 rounded-2xl border border-black/5 dark:border-white/12 bg-white/85 dark:bg-slate-900/75 text-gray-900 dark:text-white/90 backdrop-blur-md shadow-2xl overflow-hidden">
                <button
                  type="button"
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
                  onClick={() => {
                    setMenuOpen(false);
                    onDocs();
                  }}
                >
                  Documentation
                </button>
                <button
                  type="button"
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
                  onClick={() => {
                    setMenuOpen(false);
                    onPricing();
                  }}
                >
                  Plans
                </button>
                <button
                  type="button"
                  className="w-full text-left px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700"
                  onClick={() => {
                    setMenuOpen(false);
                    onPricing();
                  }}
                >
                  {getStartedLabel}
                </button>
                <button
                  type="button"
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
                  onClick={() => {
                    setMenuOpen(false);
                    onChangelog();
                  }}
                >
                  Changelog
                </button>
              </div>
            )}
          </div>

          <div className="ml-1">
            <Header placement="inline" />
          </div>
        </div>
      </div>

      <div className="min-h-screen flex items-center justify-center p-4 pt-24">
        <div className="max-w-2xl w-full space-y-8">
          <div className="text-center space-y-3 mb-16">
            <h1 className="text-5xl font-light text-gray-900 dark:text-white">Welcome to Native AI</h1>
            <p className="text-lg text-gray-600 dark:text-white/70">
              Start a new conversation or explore Native AI apps
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <button
              onClick={onNewChat}
              className="group relative p-8 rounded-3xl shadow-lg border border-white/45 dark:border-white/12 bg-white/35 dark:bg-white/10 backdrop-blur-md backdrop-saturate-150 hover:bg-white/45 dark:hover:bg-white/12 transition-colors overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-black/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative space-y-4">
                <div className="w-12 h-12 bg-black dark:bg-white/12 dark:border dark:border-white/15 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Plus className="text-white" size={28} />
                </div>
                <div>
                  <h2 className="text-2xl font-semibold text-gray-900 dark:text-white text-left">New Chat</h2>
                  <p className="text-gray-600 dark:text-white/70 text-sm text-left mt-2">
                    Start a fresh conversation with Native AI
                  </p>
                </div>
              </div>
            </button>

            <button
              onClick={onApps}
              className="group relative p-8 rounded-3xl shadow-lg border border-white/45 dark:border-white/12 bg-white/35 dark:bg-white/10 backdrop-blur-md backdrop-saturate-150 hover:bg-white/45 dark:hover:bg-white/12 transition-colors overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-black/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative space-y-4">
                <div className="w-12 h-12 bg-black dark:bg-white/12 dark:border dark:border-white/15 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Grid className="text-white" size={28} />
                </div>
                <div>
                  <h2 className="text-2xl font-semibold text-gray-900 dark:text-white text-left">Applications</h2>
                  <p className="text-gray-600 dark:text-white/70 text-sm text-left mt-2">
                    Explore Native AI tools and generators
                  </p>
                </div>
              </div>
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {user ? (
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 py-3 text-gray-700 hover:text-gray-900 dark:text-white/70 dark:hover:text-white transition-colors"
              >
                <LogOut size={20} />
                <span>Sign Out</span>
              </button>
            ) : (
              <button
                onClick={onOpenAuth}
                className="w-full flex items-center justify-center gap-2 py-3 text-gray-700 hover:text-gray-900 dark:text-white/70 dark:hover:text-white transition-colors"
              >
                <LogIn size={20} />
                <span>Sign In</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
