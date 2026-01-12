import { Home, LayoutGrid, Plus, X } from 'lucide-react';
import { useEffect } from 'react';

interface SidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNewChat: () => void;
  onApps: () => void;
  onHome: () => void;
  conversations?: Array<{ id: string; title: string }>;
  selectedId?: string | null;
  onSelectConversation?: (id: string) => void;
  onDeleteConversation?: (id: string) => void;
}

export default function Sidebar({
  open,
  onOpenChange,
  onNewChat,
  onApps,
  onHome,
  conversations = [],
  selectedId,
  onSelectConversation,
  onDeleteConversation,
}: SidebarProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  return (
    <>
      {/* Overlay */}
      <div
        className={
          'fixed inset-0 z-50 transition-opacity duration-200 ' +
          (open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none')
        }
        aria-hidden={!open}
        onMouseDown={() => onOpenChange(false)}
      >
        <div className="absolute inset-0 bg-black/10 dark:bg-black/40" />

        {/* Drawer */}
        <div
          role="dialog"
          aria-label="Sidebar"
          onMouseDown={(e) => e.stopPropagation()}
          className={
            'absolute left-0 top-0 h-full w-[min(360px,92vw)] border-r border-white/35 dark:border-white/10 ' +
            'bg-white/35 dark:bg-slate-950/40 backdrop-blur-md backdrop-saturate-150 shadow-xl ' +
            'transform-gpu transition-transform duration-300 ease-out ' +
            (open ? 'translate-x-0' : '-translate-x-full')
          }
        >
          <div className="h-full flex flex-col">
            <div className="px-4 pt-4 pb-3 flex items-center justify-between">
              <button
                onClick={() => {
                  onNewChat();
                  onOpenChange(false);
                }}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black text-white hover:bg-gray-800 dark:bg-white/12 dark:text-white dark:border dark:border-white/15 dark:hover:bg-white/16 transition-colors"
                title="New chat"
              >
                <Plus size={18} />
                <span className="text-sm font-medium">New chat</span>
              </button>

              <button
                onClick={() => onOpenChange(false)}
                className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/20 dark:hover:bg-white/10 transition-colors"
                title="Close"
              >
                <X size={18} className="text-gray-900 dark:text-white" />
              </button>
            </div>

            <div className="px-4 pb-2">
              <p className="text-xs font-semibold tracking-wide text-gray-700 dark:text-white/70">Chats</p>
            </div>

            <div className="flex-1 min-h-0 px-2 pb-3 overflow-y-auto">
              {conversations.length === 0 ? (
                <p className="text-sm text-gray-600 dark:text-white/60 px-3 py-4">No conversations yet</p>
              ) : (
                <div className="space-y-1">
                  {conversations.map((conv) => (
                    <div
                      key={conv.id}
                      className={
                        'group flex items-center justify-between gap-2 px-3 py-2 rounded-xl transition-colors cursor-pointer ' +
                        (selectedId === conv.id
                          ? 'bg-white/45 dark:bg-white/12'
                          : 'hover:bg-white/35 dark:hover:bg-white/10')
                      }
                      onClick={() => {
                        onSelectConversation?.(conv.id);
                        onOpenChange(false);
                      }}
                    >
                      <span className="text-sm text-gray-900 dark:text-white truncate flex-1">{conv.title}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteConversation?.(conv.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-white/40 dark:hover:bg-white/10 rounded"
                        title="Delete"
                      >
                        <X size={16} className="text-gray-600 dark:text-white/70" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Bottom actions */}
            <div className="px-3 pb-4 pt-3 border-t border-white/30 dark:border-white/10">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    onApps();
                    onOpenChange(false);
                  }}
                  className="flex items-center justify-center gap-2 px-3 py-2 rounded-2xl border border-white/45 dark:border-white/15 bg-white/25 dark:bg-white/10 hover:bg-white/35 dark:hover:bg-white/15 transition-colors"
                  title="Applications"
                >
                  <LayoutGrid size={16} className="text-gray-900 dark:text-white" />
                  <span className="text-sm text-gray-900 dark:text-white">Apps</span>
                </button>
                <button
                  onClick={() => {
                    onHome();
                    onOpenChange(false);
                  }}
                  className="flex items-center justify-center gap-2 px-3 py-2 rounded-2xl border border-white/45 dark:border-white/15 bg-white/25 dark:bg-white/10 hover:bg-white/35 dark:hover:bg-white/15 transition-colors"
                  title="Home"
                >
                  <Home size={16} className="text-gray-900 dark:text-white" />
                  <span className="text-sm text-gray-900 dark:text-white">Home</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
