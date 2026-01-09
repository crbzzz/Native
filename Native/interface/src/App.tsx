import { useEffect, useRef, useState } from 'react';
import Auth from './pages/Auth';
import Home from './pages/Home';
import Chat from './pages/Chat';
import Apps from './pages/Apps';
import RedM from './pages/RedM';
import FiveM from './pages/FiveM';
import { onAuthStateChange } from './lib/auth';
import { applyTheme, getStoredTheme } from './lib/theme';

const AUTH_DISABLED = true;

type AppKey = 'redm' | 'fivem';

type PageType = 'auth' | 'home' | 'chat' | 'apps' | AppKey;

function App() {
  const [currentPage, setCurrentPage] = useState<PageType>('auth');
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const bgRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const targetRef = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    applyTheme(getStoredTheme());

    if (AUTH_DISABLED) {
      setLoading(false);
      setCurrentPage('home');
      return;
    }

    const unsubscribe = onAuthStateChange((authUser) => {
      setUser(authUser);
      setLoading(false);
      if (authUser) {
        setCurrentPage('home');
      } else {
        setCurrentPage('auth');
      }
    });

    return () => unsubscribe?.data?.subscription?.unsubscribe?.();
  }, []);

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
        {AUTH_DISABLED || user ? (
          <>
            {currentPage === 'home' && (
              <Home
                onNewChat={() => setCurrentPage('chat')}
                onApps={() => setCurrentPage('apps')}
                onLogout={() => setCurrentPage('auth')}
              />
            )}
            {currentPage === 'chat' && (
              <Chat
                onBackHome={() => setCurrentPage('home')}
                onAppClick={() => setCurrentPage('apps')}
              />
            )}
            {currentPage === 'apps' && (
              <Apps
                onBack={() => setCurrentPage('chat')}
                onOpenApp={(app: AppKey) => {
                  if (app === 'redm') setCurrentPage('redm');
                  if (app === 'fivem') setCurrentPage('fivem');
                }}
              />
            )}

            {currentPage === 'redm' && <RedM onBack={() => setCurrentPage('apps')} />}
            {currentPage === 'fivem' && <FiveM onBack={() => setCurrentPage('apps')} />}
          </>
        ) : (
          <Auth onSuccess={() => setCurrentPage('home')} />
        )}
      </div>
    </div>
  );
}

export default App;
