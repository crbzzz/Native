import { useMemo } from 'react';
import {
  ArrowLeft,
  Code2,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

interface AppsProps {
  onBack: () => void;
  onOpenApp: (app: 'studio' | 'redm' | 'fivem') => void;
}

type CatalogApp = {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  gradient: string;
  badge?: 'Nouveau' | 'Pro' | 'Populaire';
  key: 'studio' | 'redm' | 'fivem';
};

export default function Apps({ onBack, onOpenApp }: AppsProps) {
  const apps: CatalogApp[] = useMemo(
    () => [
      {
        id: 'studio',
        key: 'studio',
        name: 'Code Studio',
        description: 'Génère un projet complet en plusieurs fichiers, prêts à télécharger.',
        icon: Sparkles,
        gradient: 'from-sky-500 to-fuchsia-500',
        badge: 'Populaire',
      },
      {
        id: 'fivem',
        key: 'fivem',
        name: 'FiveM Studio',
        description: 'Génère une resource complète (ESX / QBCore / Qbox / vRP).',
        icon: Code2,
        gradient: 'from-sky-500 to-cyan-400',
      },
      {
        id: 'redm',
        key: 'redm',
        name: 'RedM Studio',
        description: 'Génère une resource complète (VORP / RSG).',
        icon: Code2,
        gradient: 'from-fuchsia-500 to-pink-500',
      },
    ],
    []
  );

  return (
    <div className="min-h-screen bg-transparent native-page-in">
      <div className="fixed top-0 left-0 right-0 h-16 bg-white/25 dark:bg-slate-950/35 border-b border-white/35 dark:border-white/10 backdrop-blur-md flex items-center px-4 sm:px-6 z-40">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-700 hover:text-gray-900 dark:text-white/70 dark:hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
          <span>Retour</span>
        </button>
      </div>

      {/* Slightly lower the content under the fixed header bar */}
      <div className="pt-20 px-5 sm:px-8 pb-10">
        <div className="max-w-5xl mx-auto">
          <div className="mb-6 sm:mb-8">
            <h1 className="text-4xl sm:text-5xl font-semibold">
              <span className="bg-gradient-to-r from-sky-500 via-indigo-500 to-fuchsia-500 bg-clip-text text-transparent native-animated-gradient">
                Applications
              </span>
            </h1>
            <p className="mt-2 text-sm sm:text-base text-gray-700/90 dark:text-white/70">
              Ouvre un studio et génère tes fichiers.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {apps.map((app) => (
              <AppCard key={app.id} app={app} onOpen={() => onOpenApp(app.key)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AppCard({ app, onOpen }: { app: CatalogApp; onOpen: () => void }) {
  const IconComponent = app.icon;
  return (
    <button
      onClick={onOpen}
      className={
        'group relative text-left overflow-hidden rounded-[1.6rem] border shadow-lg transition-all ' +
        'border-white/45 dark:border-white/12 ' +
        'bg-white/35 dark:bg-white/10 backdrop-blur-md backdrop-saturate-150 ' +
        'hover:bg-white/45 dark:hover:bg-white/12 hover:-translate-y-0.5 min-h-[190px]'
      }
    >
      <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-br ${app.gradient} blur-2xl`} />
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${app.gradient}`} />

      <div className="relative p-6 h-full flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div
              className={
                `w-12 h-12 bg-gradient-to-br ${app.gradient} rounded-2xl flex items-center justify-center flex-shrink-0 ` +
                'group-hover:scale-110 transition-transform'
              }
            >
              <IconComponent className="text-white" size={22} />
            </div>
            <div>
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white">{app.name}</h4>
              <p className="mt-1 text-sm text-gray-600 dark:text-white/70">{app.description}</p>
            </div>
          </div>

          {app.badge && (
            <span className="px-2.5 py-1 rounded-full text-xs border border-white/45 dark:border-white/12 bg-white/35 dark:bg-white/10 text-gray-800 dark:text-white/80">
              {app.badge}
            </span>
          )}
        </div>

        <div className="mt-auto pt-5 flex items-center justify-between">
          <span className="text-xs text-gray-600 dark:text-white/55">Studio</span>
          <span className="text-sm font-medium text-gray-900 dark:text-white group-hover:translate-x-0.5 transition-transform">
            Ouvrir →
          </span>
        </div>
      </div>
    </button>
  );
}
