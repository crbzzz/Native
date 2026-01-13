import { ArrowLeft, Check } from 'lucide-react';

export default function Pricing({ onBack }: { onBack: () => void }) {
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
      </div>

      <div className="pt-24 px-5 sm:px-8 pb-12">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-4xl sm:text-5xl font-semibold text-gray-900 dark:text-white">Pricing</h1>
          <p className="mt-3 text-gray-700/90 dark:text-white/70">
            Example pricing layout. Replace with real plans when ready.
          </p>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-5">
            <PlanCard
              title="Free"
              price="$0"
              features={["Basic chat", "Community support", "Standard speed"]}
            />
            <PlanCard
              title="Pro"
              price="$19"
              badge="Popular"
              features={["Deep Search", "Higher limits", "Priority support"]}
            />
            <PlanCard
              title="Team"
              price="$49"
              features={["Shared workspaces", "Admin controls", "Central billing"]}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function PlanCard({
  title,
  price,
  badge,
  features,
}: {
  title: string;
  price: string;
  badge?: string;
  features: string[];
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/45 dark:border-white/12 bg-white/35 dark:bg-white/10 backdrop-blur-md backdrop-saturate-150 p-6 shadow-lg">
      {badge && (
        <div className="absolute top-4 right-4 px-2.5 py-1 rounded-full text-xs border border-white/45 dark:border-white/12 bg-white/35 dark:bg-white/10 text-gray-800 dark:text-white/80">
          {badge}
        </div>
      )}
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
      <div className="mt-2 text-4xl font-semibold text-gray-900 dark:text-white">
        {price}
        <span className="text-base font-normal text-gray-600 dark:text-white/60">/mo</span>
      </div>
      <div className="mt-5 space-y-2">
        {features.map((f) => (
          <div key={f} className="flex items-center gap-2 text-sm text-gray-700 dark:text-white/70">
            <Check size={16} className="text-gray-800 dark:text-white/70" />
            <span>{f}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
