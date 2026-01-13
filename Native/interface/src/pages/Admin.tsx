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

  const [email, setEmail] = useState('');
  const [plan, setPlan] = useState<'free' | 'pro'>('free');
  const [grantTokens, setGrantTokens] = useState('250000');
  const [actionLoading, setActionLoading] = useState<null | 'set_plan' | 'grant_tokens'>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(t);
  }, [toast]);

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

        {toast && (
          <div className="fixed left-1/2 top-6 -translate-x-1/2 z-[60] rounded-2xl border border-white/45 bg-white/75 backdrop-blur-md px-4 py-2 text-sm text-gray-900 dark:text-white dark:bg-slate-900/75">
            {toast}
          </div>
        )}

        <div className="rounded-3xl border border-white/45 dark:border-white/12 bg-white/35 dark:bg-white/10 backdrop-blur-md backdrop-saturate-150 p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-xs text-gray-600 dark:text-white/60">Billing controls</div>
              <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">Assign plan / tokens</div>
              <div className="mt-1 text-sm text-gray-700 dark:text-white/70">
                Set a user to <span className="font-semibold">Free</span> (25k/week) or <span className="font-semibold">Pro</span> (500k/month), or grant a token top-up for the current period.
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-gray-600 dark:text-white/60">User email</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@email.com"
                className="mt-1 w-full px-4 py-2.5 rounded-2xl border border-white/45 dark:border-white/12 bg-white/60 dark:bg-slate-900/40 text-gray-900 dark:text-white outline-none"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-600 dark:text-white/60">Plan</label>
              <select
                value={plan}
                onChange={(e) => setPlan((e.target.value === 'pro' ? 'pro' : 'free') as any)}
                className="mt-1 w-full px-4 py-2.5 rounded-2xl border border-white/45 dark:border-white/12 bg-white/60 dark:bg-slate-900/40 text-gray-900 dark:text-white outline-none"
              >
                <option value="free">Free</option>
                <option value="pro">Pro</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-600 dark:text-white/60">Grant tokens (top-up)</label>
              <input
                value={grantTokens}
                onChange={(e) => setGrantTokens(e.target.value)}
                inputMode="numeric"
                placeholder="250000"
                className="mt-1 w-full px-4 py-2.5 rounded-2xl border border-white/45 dark:border-white/12 bg-white/60 dark:bg-slate-900/40 text-gray-900 dark:text-white outline-none"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={actionLoading !== null}
              onClick={async () => {
                const target = email.trim();
                if (!target) {
                  setToast('Missing email');
                  return;
                }
                setActionLoading('set_plan');
                try {
                  const token = await getAccessToken();
                  const res = await fetch('/api/admin/set-plan', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify({ email: target, plan }),
                  });
                  if (!res.ok) {
                    const text = await res.text().catch(() => '');
                    throw new Error(text || `HTTP ${res.status}`);
                  }
                  setToast(`Plan updated: ${target} → ${plan}`);
                } catch (e) {
                  setToast(e instanceof Error ? e.message : String(e));
                } finally {
                  setActionLoading(null);
                }
              }}
              className={
                'px-4 py-2.5 rounded-2xl text-sm font-semibold transition-colors ' +
                (actionLoading === 'set_plan'
                  ? 'bg-blue-600/70 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white')
              }
            >
              {actionLoading === 'set_plan' ? 'Saving…' : 'Set plan'}
            </button>

            <button
              type="button"
              disabled={actionLoading !== null}
              onClick={async () => {
                const target = email.trim();
                if (!target) {
                  setToast('Missing email');
                  return;
                }
                const n = Number(grantTokens);
                if (!Number.isFinite(n) || n <= 0) {
                  setToast('Tokens must be > 0');
                  return;
                }
                setActionLoading('grant_tokens');
                try {
                  const token = await getAccessToken();
                  const res = await fetch('/api/admin/grant-tokens', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify({ email: target, tokens: n }),
                  });
                  if (!res.ok) {
                    const text = await res.text().catch(() => '');
                    throw new Error(text || `HTTP ${res.status}`);
                  }
                  const payload = (await res.json()) as any;
                  setToast(`Granted ${n} tokens (${payload?.period || 'period'})`);
                } catch (e) {
                  setToast(e instanceof Error ? e.message : String(e));
                } finally {
                  setActionLoading(null);
                }
              }}
              className={
                'px-4 py-2.5 rounded-2xl text-sm font-semibold transition-colors ' +
                (actionLoading === 'grant_tokens'
                  ? 'bg-gray-900/50 text-gray-900 dark:text-white'
                  : 'bg-white/60 hover:bg-white/75 border border-white/45 dark:border-white/12 text-gray-900 dark:text-white dark:bg-slate-900/30 dark:hover:bg-slate-900/40')
              }
            >
              {actionLoading === 'grant_tokens' ? 'Granting…' : 'Grant tokens'}
            </button>
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
