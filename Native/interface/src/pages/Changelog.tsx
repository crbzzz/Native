import { ArrowLeft } from 'lucide-react';

export default function Changelog({ onBack }: { onBack: () => void }) {
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
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl sm:text-5xl font-semibold text-gray-900 dark:text-white">Changelog</h1>
          <p className="mt-3 text-gray-700/90 dark:text-white/70">
            Track updates and improvements here.
          </p>

          <div className="mt-8 space-y-4">
            <Entry date="2026-01-13" title="UI polish">
              Code Studio context menus, English UI strings, and improved mobile input controls.
            </Entry>
            <Entry date="2026-01-10" title="Code Studio projects">
              Projects persist to conversations and can be reopened from the sidebar.
            </Entry>
          </div>
        </div>
      </div>
    </div>
  );
}

function Entry({ date, title, children }: { date: string; title: string; children: string }) {
  return (
    <div className="rounded-3xl border border-white/45 dark:border-white/12 bg-white/35 dark:bg-white/10 backdrop-blur-md backdrop-saturate-150 p-6">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-sm font-semibold text-gray-900 dark:text-white">{title}</div>
        <div className="text-xs text-gray-600 dark:text-white/60">{date}</div>
      </div>
      <div className="mt-2 text-sm text-gray-700 dark:text-white/70">{children}</div>
    </div>
  );
}
