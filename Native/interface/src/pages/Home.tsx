import { signOut } from '../lib/auth';
import { Plus, Grid, LogOut } from 'lucide-react';

interface HomeProps {
  onNewChat: () => void;
  onApps: () => void;
  onLogout: () => void;
}

export default function Home({ onNewChat, onApps, onLogout }: HomeProps) {
  const handleLogout = async () => {
    await signOut();
    onLogout();
  };

  return (
    <div className="min-h-screen bg-transparent flex items-center justify-center p-4">
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center space-y-3 mb-16">
          <h1 className="text-5xl font-light text-gray-900 dark:text-white">
            Welcome to Native AI
          </h1>
          <p className="text-lg text-gray-600 dark:text-white/70">
            Start a new conversation or explore Native AI apps
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <button
            onClick={onNewChat}
            className="group relative p-8 rounded-3xl shadow-lg border border-white/45 dark:border-white/12 bg-white/35 dark:bg-white/10 backdrop-blur-md backdrop-saturate-150 hover:bg-white/45 dark:hover:bg-white/12 transition-colors overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-black/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="relative space-y-4">
              <div className="w-12 h-12 bg-black dark:bg-white/12 dark:border dark:border-white/15 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <Plus className="text-white" size={28} />
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white text-left">
                  New Chat
                </h2>
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
            <div className="absolute inset-0 bg-gradient-to-br from-black/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="relative space-y-4">
              <div className="w-12 h-12 bg-black dark:bg-white/12 dark:border dark:border-white/15 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <Grid className="text-white" size={28} />
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white text-left">
                  Applications
                </h2>
                <p className="text-gray-600 dark:text-white/70 text-sm text-left mt-2">
                  Explore Native AI tools and generators
                </p>
              </div>
            </div>
          </button>
        </div>

        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 py-3 text-gray-700 hover:text-gray-900 dark:text-white/70 dark:hover:text-white transition-colors"
        >
          <LogOut size={20} />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
}
