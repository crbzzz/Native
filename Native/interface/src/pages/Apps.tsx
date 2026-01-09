import { ArrowLeft, Sparkles, Code2, Zap, type LucideIcon } from 'lucide-react';

interface AppsProps {
  onBack: () => void;
  onOpenApp: (app: 'redm' | 'fivem') => void;
}

export default function Apps({ onBack, onOpenApp }: AppsProps) {
  const apps: Array<{
    key: 'redm' | 'fivem' | 'codegen' | 'quickask' | 'powertools';
    name: string;
    description: string;
    icon: LucideIcon;
    color: string;
  }> = [
    {
      key: 'redm',
      name: 'RedM',
      description: 'RedM generator (VORP / RSG)',
      icon: Code2,
      color: 'from-purple-500 to-pink-500',
    },
    {
      key: 'fivem',
      name: 'FiveM',
      description: 'FiveM generator (ESX / QBCore)',
      icon: Code2,
      color: 'from-blue-500 to-cyan-500',
    },
    {
      key: 'codegen',
      name: 'Code Generator',
      description: 'Generate code snippets and solutions',
      icon: Code2,
      color: 'from-blue-500 to-cyan-500',
    },
    {
      key: 'quickask',
      name: 'Quick Ask',
      description: 'Get instant answers to your questions',
      icon: Sparkles,
      color: 'from-purple-500 to-pink-500',
    },
    {
      key: 'powertools',
      name: 'Power Tools',
      description: 'Advanced utilities and automation',
      icon: Zap,
      color: 'from-orange-500 to-red-500',
    },
  ];

  return (
    <div className="min-h-screen bg-transparent">
      <div className="fixed top-0 left-0 right-0 h-16 bg-white/25 dark:bg-slate-950/35 border-b border-white/35 dark:border-white/10 backdrop-blur-md flex items-center px-6 z-40">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-700 hover:text-gray-900 dark:text-white/70 dark:hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
          <span>Back</span>
        </button>
      </div>

      <div className="pt-16 min-h-screen p-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-12">
            <h1 className="text-4xl font-normal text-gray-900 dark:text-white mb-3">
              Applications — Native AI
            </h1>
            <p className="text-gray-600 dark:text-white/70">
              Explore Native AI tools and generators
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {apps.map((app) => {
              const IconComponent = app.icon;
              return (
                <button
                  key={app.key}
                  onClick={() => {
                    if (app.key === 'redm' || app.key === 'fivem') onOpenApp(app.key);
                  }}
                  className="group relative p-6 rounded-2xl shadow-lg border border-white/45 dark:border-white/12 bg-white/35 dark:bg-white/10 backdrop-blur-md backdrop-saturate-150 hover:bg-white/45 dark:hover:bg-white/12 transition-colors overflow-hidden text-left"
                >
                  <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${app.color}`}></div>

                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 bg-gradient-to-br ${app.color} rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform`}>
                      <IconComponent className="text-white" size={24} />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white group-hover:text-gray-700 dark:group-hover:text-white/80">
                        {app.name}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-white/70 mt-2">
                        {app.description}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
