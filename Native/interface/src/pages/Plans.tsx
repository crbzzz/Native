import { ArrowLeft, Check, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getAccessToken } from '../lib/auth';

type Usage = { month: string; cap: number; used: number; remaining: number; plan?: 'free' | 'pro' };

type CheckoutKind = 'pro_monthly' | 'topup_250k';

export default function Plans({ onBack }: { onBack: () => void }) {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loadingCheckout, setLoadingCheckout] = useState<CheckoutKind | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const run = async () => {
      setUsageError(null);

      const token = await getAccessToken();
      if (!token) {
        setUsage(null);
        return;
      }

      try {
        const res = await fetch('/api/usage', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(text || `HTTP ${res.status}`);
        }
        setUsage((await res.json()) as Usage);
      } catch (e) {
        setUsage(null);
        setUsageError(e instanceof Error ? e.message : String(e));
      }
    };

    void run();
  }, []);

  const plans = useMemo(
    () => [
      {
        title: 'Free',
        price: '$0',
        subtitle: 'For trying Native AI',
        tokens: '25,000 tokens / week',
        features: ['Chat + apps', 'Standard speed', 'Community support'],
        cta: null as null | { label: string; kind: CheckoutKind },
      },
      {
        title: 'Token Pack',
        price: '$10',
        subtitle: 'One-time top-up',
        tokens: 'Add 250,000 tokens (this period)',
        features: ['Instant top-up', 'No subscription', 'Works with Free or Pro'],
        cta: { label: 'Buy 250,000 tokens', kind: 'topup_250k' as const },
      },
      {
        title: 'Pro',
        price: '$15',
        subtitle: 'Best for daily usage',
        tokens: '500,000 tokens / month',
        badge: 'Most popular',
        features: ['Higher monthly cap', 'Deep Search', 'Priority support (soon)'],
        cta: { label: 'Subscribe (monthly)', kind: 'pro_monthly' as const },
      },
    ],
    []
  );

  const startCheckout = async (kind: CheckoutKind) => {
    setLoadingCheckout(kind);
    try {
      const token = await getAccessToken();
      if (!token) {
        setToast('Please sign in to purchase a plan.');
        return;
      }

      const res = await fetch('/api/billing/checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ kind }),
      });

      if (!res.ok) {
        let detail = '';
        try {
          const payload = (await res.json()) as any;
          detail = String(payload?.detail || payload?.error || '');
        } catch {
          detail = (await res.text().catch(() => '')) || '';
        }
        setToast(detail || 'Billing is not configured yet.');
        return;
      }

      const payload = (await res.json()) as { url?: string };
      if (payload?.url) {
        window.location.href = payload.url;
        return;
      }

      setToast('Billing is not configured yet.');
    } finally {
      setLoadingCheckout(null);
    }
  };

  return (
    <div className="min-h-screen bg-transparent native-page-in">
      <div className="fixed top-0 left-0 right-0 h-16 bg-white/10 dark:bg-slate-950/15 border-b border-white/25 dark:border-white/10 backdrop-blur-md flex items-center px-4 sm:px-6 z-40">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-700 hover:text-gray-900 dark:text-white/70 dark:hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
          <span>Back</span>
        </button>

        <div className="flex-1" />

        {usage && (
          <div className="hidden sm:flex items-center gap-3 text-xs text-gray-700 dark:text-white/70">
            <span>
              Tokens: <span className="font-semibold">{usage.remaining}</span> / {usage.cap}
            </span>
            <div className="w-32">
              <div className="h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-600"
                  style={{ width: `${Math.max(0, Math.min(100, (usage.used / Math.max(1, usage.cap)) * 100))}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-2xl border border-white/45 dark:border-white/12 bg-white/75 dark:bg-slate-900/75 backdrop-blur-md text-sm text-gray-900 dark:text-white shadow-xl">
          {toast}
        </div>
      )}

      <div className="pt-24 px-5 sm:px-8 pb-12">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h1 className="text-4xl sm:text-5xl font-semibold text-gray-900 dark:text-white">Plans</h1>
              <p className="mt-3 text-gray-700/90 dark:text-white/70">
                Upgrade your token limits. Stripe checkout wiring is already stubbed.
              </p>
            </div>

            <div className="hidden sm:block">
              <div className="rounded-3xl border border-white/45 dark:border-white/12 bg-white/35 dark:bg-white/10 backdrop-blur-md backdrop-saturate-150 p-4">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Current usage</p>
                <p className="mt-1 text-xs text-gray-700 dark:text-white/70">
                  {usage
                    ? `${usage.remaining} remaining / ${usage.cap} (period ${usage.month})`
                    : usageError
                      ? 'Could not load usage.'
                      : 'Sign in to see your usage.'}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-5">
            {plans.map((p) => (
              <PlanCard
                key={p.title}
                title={p.title}
                price={p.price}
                subtitle={p.subtitle}
                tokens={p.tokens}
                badge={(p as any).badge}
                features={p.features}
                action={
                  p.cta
                    ? {
                        label: p.cta.label,
                        onClick: () => startCheckout(p.cta!.kind),
                        loading: loadingCheckout === p.cta.kind,
                      }
                    : null
                }
              />
            ))}
          </div>

          <div className="mt-10 rounded-3xl border border-white/45 dark:border-white/12 bg-white/35 dark:bg-white/10 backdrop-blur-md backdrop-saturate-150 p-6">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-blue-600" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Stripe integration</h2>
            </div>
            <ul className="mt-3 text-sm text-gray-700 dark:text-white/70 space-y-1.5">
              <li>
                Backend endpoint ready: <span className="font-mono">POST /api/billing/checkout-session</span>
              </li>
              <li>
                Next step: implement Stripe Checkout session creation + webhook handler to grant plan/top-ups.
              </li>
              <li>
                The token cap logic supports Free (25k/week), Pro (500k/month), and top-ups (+250k).
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlanCard({
  title,
  price,
  subtitle,
  tokens,
  badge,
  features,
  action,
}: {
  title: string;
  price: string;
  subtitle: string;
  tokens: string;
  badge?: string;
  features: string[];
  action: null | { label: string; onClick: () => void; loading: boolean };
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/45 dark:border-white/12 bg-white/35 dark:bg-white/10 backdrop-blur-md backdrop-saturate-150 p-6 shadow-lg">
      {badge && (
        <div className="absolute top-4 right-4 px-2.5 py-1 rounded-full text-xs border border-white/45 dark:border-white/12 bg-white/35 dark:bg-white/10 text-gray-800 dark:text-white/80">
          {badge}
        </div>
      )}
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
      <p className="mt-1 text-sm text-gray-700 dark:text-white/70">{subtitle}</p>
      <div className="mt-3 text-4xl font-semibold text-gray-900 dark:text-white">
        {price}
        {title !== 'Token Pack' && <span className="text-base font-normal text-gray-600 dark:text-white/60">/mo</span>}
      </div>

      <div className="mt-3 text-sm text-gray-800 dark:text-white/80">{tokens}</div>

      <div className="mt-5 space-y-2">
        {features.map((f) => (
          <div key={f} className="flex items-center gap-2 text-sm text-gray-700 dark:text-white/70">
            <Check size={16} className="text-gray-800 dark:text-white/70" />
            <span>{f}</span>
          </div>
        ))}
      </div>

      {action && (
        <button
          type="button"
          disabled={action.loading}
          onClick={action.onClick}
          className={
            'mt-6 w-full py-2.5 rounded-2xl text-sm font-semibold text-white transition-colors ' +
            (action.loading ? 'bg-blue-600/70' : 'bg-blue-600 hover:bg-blue-700')
          }
        >
          {action.loading ? 'Redirecting…' : action.label}
        </button>
      )}
    </div>
  );
}
