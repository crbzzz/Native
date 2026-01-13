import { useEffect, useRef, useState } from 'react';
import Auth from './pages/Auth';
import Home from './pages/Home';
import Chat from './pages/Chat';
import Apps from './pages/Apps';
import CodeStudio from './pages/CodeStudio';
import RedM from './pages/RedM';
import FiveM from './pages/FiveM';
import Admin from './pages/Admin';
import Documentation from './pages/Documentation';
import Plans from './pages/Plans';
import Changelog from './pages/Changelog';
import { onAuthStateChange } from './lib/auth';
import { applyTheme, getStoredTheme } from './lib/theme';
import { supabase } from './lib/supabase';

const AUTH_DISABLED = false;

type AppKey = 'redm' | 'fivem';

type PageType =
  | 'home'
  | 'chat'
  | 'apps'
  | 'studio'
  | 'docs'
  | 'plans'
  | 'changelog'
  | 'admin'
  | 'admin_login'
  | AppKey;

function pageFromPath(pathname: string): PageType {
  const p = (pathname || '/').toLowerCase();
  if (p === '/admin/login') return 'admin_login';
  if (p === '/admin') return 'admin';
  if (p === '/chat') return 'chat';
  if (p === '/apps') return 'apps';
  if (p === '/studio') return 'studio';
  if (p === '/docs') return 'docs';
  if (p === '/plans' || p === '/pricing') return 'plans';
  if (p === '/changelog') return 'changelog';
  if (p === '/redm') return 'redm';
  if (p === '/fivem') return 'fivem';
  return 'home';
}

function pathFromPage(page: PageType): string {
  if (page === 'admin_login') return '/admin/login';
  if (page === 'admin') return '/admin';
  if (page === 'chat') return '/chat';
  if (page === 'apps') return '/apps';
  if (page === 'studio') return '/studio';
  if (page === 'docs') return '/docs';
  if (page === 'plans') return '/plans';
  if (page === 'changelog') return '/changelog';
  if (page === 'redm') return '/redm';
  if (page === 'fivem') return '/fivem';
  return '/';
}

function App() {
  const [currentPage, setCurrentPage] = useState<PageType>(() => pageFromPath(window.location.pathname));
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showAuth, setShowAuth] = useState(false);

  const bgRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const targetRef = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0 });

  const navigate = (page: PageType) => {
    setCurrentPage(page);
    const next = pathFromPage(page);
    if (window.location.pathname !== next) {
      window.history.pushState({}, '', next);
    }
  };

  const replacePath = (path: string) => {
    const nextPage = pageFromPath(path);
    setCurrentPage(nextPage);
    if (window.location.pathname !== path) {
      window.history.replaceState({}, '', path);
    }
  };

  useEffect(() => {
    applyTheme(getStoredTheme());

    if (AUTH_DISABLED) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChange((authUser) => {
      setUser(authUser);
      setLoading(false);

      // Post-OAuth redirect (Google): ramène direct vers /chat ou /admin.
      if (authUser) {
        const pending = window.localStorage.getItem('native_post_auth_path');
        if (pending === '/chat' || pending === '/admin') {
          window.localStorage.removeItem('native_post_auth_path');
          if (window.location.pathname !== pending) {
            replacePath(pending);
          }
        }
      }
    });

    return () => unsubscribe?.data?.subscription?.unsubscribe?.();
  }, []);

  useEffect(() => {
    const onPop = () => setCurrentPage(pageFromPath(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (AUTH_DISABLED) return;
    if (currentPage === 'admin' && !user) {
      navigate('admin_login');
    }
  }, [currentPage, user]);

  // Presence (utilisateurs "connectés")
  useEffect(() => {
    if (AUTH_DISABLED) return;
    if (!user) return;

    let stopped = false;
    const ping = async () => {
      if (stopped) return;
      try {
        await supabase.from('user_presence').upsert({
          user_id: user.id,
          last_seen: new Date().toISOString(),
        });
      } catch (_) {
        // ignore (table/policies pas encore en place)
      }
    };

    void ping();
    const id = window.setInterval(ping, 30000);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [user]);

  // Parallax léger sur le wallpaper (desktop/pointer only)
  useEffect(() => {
    const el = bgRef.current;
    if (!el) return;
    const finePointer = window.matchMedia?.('(pointer: fine)').matches ?? true;
    if (!finePointer) return;

    const updateTransform = () => {
      const cur = currentRef.current;
      const tgt = targetRef.current;

      // Très lent, très faible déplacement (60fps friendly)
      const easing = 0.02;
      cur.x = cur.x + (tgt.x - cur.x) * easing;
      cur.y = cur.y + (tgt.y - cur.y) * easing;

      el.style.transform = `translate3d(${cur.x}px, ${cur.y}px, 0) scale(1.08)`;

      const dx = Math.abs(tgt.x - cur.x);
      const dy = Math.abs(tgt.y - cur.y);
      if (dx + dy > 0.05) {
        rafRef.current = window.requestAnimationFrame(updateTransform);
      } else {
        rafRef.current = null;
      }
    };

    const onMove = (e: MouseEvent) => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const dx = (e.clientX - cx) / cx;
      const dy = (e.clientY - cy) / cy;
      targetRef.current = {
        x: Math.max(-1, Math.min(1, dx)) * 6,
        y: Math.max(-1, Math.min(1, dy)) * 6,
      };

      if (rafRef.current) return;
      rafRef.current = window.requestAnimationFrame(updateTransform);
    };

    // état initial
    el.style.transform = 'translate3d(0px, 0px, 0) scale(1.08)';

    window.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative">
      {/* Soft blue background (like reference), with subtle parallax */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div
          ref={bgRef}
          className="absolute -inset-16 bg-gradient-to-b from-sky-200 via-sky-100 to-sky-50 dark:from-slate-950 dark:via-indigo-950 dark:to-slate-900 transform-gpu"
        />
        <div className="absolute inset-0 bg-white/10 dark:bg-black/20" />
      </div>

      <div className="relative z-10 min-h-screen">
        <>
          {currentPage === 'home' && (
            <Home
              user={AUTH_DISABLED ? { id: 'disabled' } : user}
              onNewChat={() => navigate('chat')}
              onApps={() => navigate('apps')}
              onOpenAuth={() => setShowAuth(true)}
              onDocs={() => navigate('docs')}
              onPricing={() => navigate('plans')}
              onChangelog={() => navigate('changelog')}
            />
          )}
          {currentPage === 'chat' && (
            <Chat
              user={AUTH_DISABLED ? { id: 'disabled' } : user}
              onBackHome={() => navigate('home')}
              onAppClick={() => navigate('apps')}
              onPlans={() => navigate('plans')}
              onOpenStudioProject={(conversationId) => {
                try {
                  window.localStorage.setItem('native:studio:openConversationId', conversationId);
                } catch (_) {
                  // ignore
                }
                navigate('studio');
              }}
              onRequireAuth={() => setShowAuth(true)}
            />
          )}

          {currentPage === 'apps' && (
            <Apps
              onBack={() => navigate('chat')}
              onOpenApp={(app) => {
                if (app === 'studio') navigate('studio');
                if (app === 'redm') navigate('redm');
                if (app === 'fivem') navigate('fivem');
              }}
            />
          )}

          {currentPage === 'docs' && <Documentation onBack={() => navigate('home')} />}
          {currentPage === 'plans' && <Plans onBack={() => navigate('home')} />}
          {currentPage === 'changelog' && <Changelog onBack={() => navigate('home')} />}

          {currentPage === 'studio' && <CodeStudio onBack={() => navigate('apps')} />}

          {currentPage === 'admin_login' && (
            <div className="min-h-screen bg-transparent flex items-center justify-center p-6">
              <div className="w-full max-w-md">
                <div className="rounded-3xl border border-white/45 bg-white/35 backdrop-blur-md p-6">
                  <h1 className="text-2xl font-normal text-gray-900 dark:text-white">Admin</h1>
                  <p className="mt-1 text-sm text-gray-600 dark:text-white/70">Connexion admin requise.</p>
                </div>
                <div className="mt-4">
                  <Auth onSuccess={() => navigate('admin')} variant="embed" />
                </div>
                <button
                  type="button"
                  className="mt-3 w-full py-2 rounded-xl border border-white/40 bg-white/25 hover:bg-white/35 transition-colors"
                  onClick={() => navigate('home')}
                >
                  Back
                </button>
              </div>
            </div>
          )}

          {currentPage === 'admin' && (user ? <Admin /> : null)}

          {currentPage === 'redm' && <RedM onBack={() => navigate('apps')} />}
          {currentPage === 'fivem' && <FiveM onBack={() => navigate('apps')} />}

          {showAuth && !AUTH_DISABLED && (
            <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-md">
                <Auth onSuccess={() => setShowAuth(false)} onClose={() => setShowAuth(false)} variant="embed" />
              </div>
            </div>
          )}
        </>
      </div>
    </div>
  );
}

export default App;
