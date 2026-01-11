import { useEffect, useMemo, useState } from 'react';
import { getAccessToken } from '../lib/auth';

type TokenPoint = { month: string; tokens: number };

type AdminStats = {
  connectedUsers: number;
  totalUsers: number;
  tokensByMonth: TokenPoint[];
};

function BarChart({ data }: { data: TokenPoint[] }) {
  const max = Math.max(1, ...data.map((d) => d.tokens));

  return (
    <div className="w-full rounded-3xl border border-white/45 dark:border-white/12 bg-white/35 dark:bg-white/10 backdrop-blur-md backdrop-saturate-150 p-6">
      <div className="flex items-end justify-between gap-3 h-40">
        {data.map((d) => {
          const h = Math.round((d.tokens / max) * 100);
          return (
            <div key={d.month} className="flex-1 min-w-[36px] flex flex-col items-center gap-2">
              <div className="w-full flex-1 flex items-end">
                <div
                  className="w-full rounded-xl bg-black/70 dark:bg-white/70"
                  style={{ height: `${Math.max(6, h)}%` }}
                  title={`${d.month}: ${d.tokens}`}
                />
              </div>
              <div className="text-[11px] text-gray-700 dark:text-white/70">{d.month}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 text-xs text-gray-600 dark:text-white/60">Tokens / mois</div>
    </div>
  );
}

export default function Admin() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = await getAccessToken();
        const res = await fetch('/api/admin/stats', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!res.ok) {
          if (res.status === 401) {
            throw new Error('AUTH_REQUIRED');
          }
          if (res.status === 403) {
            throw new Error('FORBIDDEN');
          }
          const text = await res.text().catch(() => '');
          throw new Error(text || `HTTP ${res.status}`);
        }
        const data = (await res.json()) as AdminStats;
        setStats(data);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === 'AUTH_REQUIRED') {
          window.location.assign('/admin/login');
          return;
        }
        if (msg === 'FORBIDDEN') {
          setError("Accès refusé. Ton email doit être dans ADMIN_EMAILS côté backend.");
          setStats(null);
          return;
        }
        setError(msg);
        setStats(null);
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, []);

  const tokens = useMemo(() => stats?.tokensByMonth ?? [], [stats]);

  return (
    <div className="min-h-screen bg-transparent p-6 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-normal text-gray-900 dark:text-white">Admin</h1>
            <p className="text-sm text-gray-600 dark:text-white/70">Usage & utilisateurs</p>
          </div>
        </div>

        {loading && (
          <div className="rounded-3xl border border-white/45 bg-white/35 backdrop-blur-md p-6 text-gray-700">
            Loading…
          </div>
        )}

        {error && (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-700">
            {error}
          </div>
        )}

        {stats && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-3xl border border-white/45 dark:border-white/12 bg-white/35 dark:bg-white/10 backdrop-blur-md backdrop-saturate-150 p-6">
                <div className="text-xs text-gray-600 dark:text-white/60">Utilisateurs connectés</div>
                <div className="mt-2 text-4xl font-semibold text-gray-900 dark:text-white">
                  {stats.connectedUsers}
                </div>
                <div className="mt-2 text-xs text-gray-600 dark:text-white/60">(activité &lt; 2 min)</div>
              </div>

              <div className="rounded-3xl border border-white/45 dark:border-white/12 bg-white/35 dark:bg-white/10 backdrop-blur-md backdrop-saturate-150 p-6">
                <div className="text-xs text-gray-600 dark:text-white/60">Utilisateurs total</div>
                <div className="mt-2 text-4xl font-semibold text-gray-900 dark:text-white">{stats.totalUsers}</div>
              </div>
            </div>

            <BarChart data={tokens} />
          </>
        )}
      </div>
    </div>
  );
}
