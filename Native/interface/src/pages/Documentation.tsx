import { ArrowLeft } from 'lucide-react';

export default function Documentation({ onBack }: { onBack: () => void }) {
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
          <h1 className="text-4xl sm:text-5xl font-semibold text-gray-900 dark:text-white">Documentation</h1>
          <p className="mt-3 text-gray-700/90 dark:text-white/70">
            This page is a placeholder for product docs. Add guides, API references, and examples here.
          </p>

          <div className="mt-8 rounded-3xl border border-white/45 dark:border-white/12 bg-white/35 dark:bg-white/10 backdrop-blur-md backdrop-saturate-150 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Quick links</h2>
            <ul className="mt-3 space-y-2 text-sm text-gray-700 dark:text-white/70 list-disc pl-5">
              <li>Getting started</li>
              <li>Prompting best practices</li>
              <li>Projects & Code Studio</li>
              <li>API usage</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
