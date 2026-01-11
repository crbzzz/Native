import { LayoutGrid, Plus, Search, Home, X, Code2, MoreHorizontal } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

interface SidebarProps {
  onNewChat: () => void;
  onApps: () => void;
  onHome: () => void;
  onFiveM?: () => void;
  onRedM?: () => void;
  defaultExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  conversations?: Array<{ id: string; title: string }>;
  selectedId?: string | null;
  onSelectConversation?: (id: string) => void;
  onDeleteConversation?: (id: string) => void;
}

export default function Sidebar({
  onNewChat,
  onApps,
  onHome,
  onFiveM,
  onRedM,
  defaultExpanded,
  onExpandedChange,
  conversations = [],
  selectedId,
  onSelectConversation,
  onDeleteConversation,
}: SidebarProps) {
  const [expanded, setExpanded] = useState(Boolean(defaultExpanded));
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => (c.title || '').toLowerCase().includes(q));
  }, [conversations, query]);

  useEffect(() => {
    onExpandedChange?.(expanded);
  }, [expanded, onExpandedChange]);

  return (
    <>
      {/* Rail (toujours visible) */}
      <div className="fixed left-0 top-0 h-full w-16 bg-white/30 dark:bg-slate-950/35 border-r border-white/35 dark:border-white/10 backdrop-blur-md backdrop-saturate-150 z-[60] flex flex-col items-center py-4 gap-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-10 h-10 flex items-center justify-center rounded-xl text-gray-700 hover:text-gray-900 hover:bg-white/35 dark:text-white/70 dark:hover:text-white dark:hover:bg-white/10 transition-colors"
          title={expanded ? 'Close menu' : 'Open menu'}
        >
          <MoreHorizontal size={18} />
        </button>

        <button
          type="button"
          onClick={() => {
            setExpanded(false);
            onNewChat();
          }}
          className="w-10 h-10 flex items-center justify-center bg-black text-white rounded-xl hover:bg-gray-800 dark:bg-white/12 dark:text-white dark:border dark:border-white/15 dark:hover:bg-white/16 transition-colors"
          title="New chat"
        >
          <Plus size={18} />
        </button>

        <button
          type="button"
          onClick={() => {
            setExpanded(false);
            onHome();
          }}
          className="w-10 h-10 flex items-center justify-center rounded-xl text-gray-700 hover:text-gray-900 hover:bg-white/35 dark:text-white/70 dark:hover:text-white dark:hover:bg-white/10 transition-colors"
          title="Home"
        >
          <Home size={18} />
        </button>

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => {
            setExpanded(false);
            onApps();
          }}
          className="w-10 h-10 flex items-center justify-center rounded-xl text-gray-700 hover:text-gray-900 hover:bg-white/35 dark:text-white/70 dark:hover:text-white dark:hover:bg-white/10 transition-colors"
          title="Applications"
        >
          <LayoutGrid size={18} />
        </button>
      </div>

      {/* Overlay (click outside closes) */}
      <div
        className={
          'fixed inset-0 z-[45] transition-opacity duration-200 ' +
          (expanded ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none')
        }
        onMouseDown={() => setExpanded(false)}
        aria-hidden={!expanded}
      />

      {/* Panneau déroulant */}
      <aside
        className={
          'fixed left-16 top-0 h-full w-56 z-[50] border-r border-white/35 dark:border-white/10 ' +
          'bg-white/30 dark:bg-slate-950/35 backdrop-blur-md backdrop-saturate-150 ' +
          'transform-gpu transition-all duration-200 ease-out ' +
          (expanded
            ? 'opacity-100 translate-x-0 pointer-events-auto'
            : 'opacity-0 -translate-x-4 pointer-events-none')
        }
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="p-4 pb-3">
          <div className="text-sm font-semibold text-gray-900 dark:text-white">Native AI</div>
          <div className="text-xs text-gray-600 dark:text-white/60">Chats & fonctionnalités</div>

          <div className="mt-3 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-white/50" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher des chats"
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-white/45 dark:border-white/12 bg-white/25 dark:bg-white/10 text-sm text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-white/40 outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10"
            />
          </div>
        </div>

        <div className="px-4 pb-3">
          <div className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-white/45 px-2 mb-2">Fonctionnalités</div>
          <div className="space-y-1">
            {onFiveM && (
              <button
                type="button"
                onClick={() => {
                  setExpanded(false);
                  onFiveM();
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/35 dark:hover:bg-white/10 transition-colors text-gray-800 dark:text-white/85"
              >
                <Code2 size={18} />
                <span className="text-sm">FiveM Studio</span>
              </button>
            )}
            {onRedM && (
              <button
                type="button"
                onClick={() => {
                  setExpanded(false);
                  onRedM();
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/35 dark:hover:bg-white/10 transition-colors text-gray-800 dark:text-white/85"
              >
                <Code2 size={18} />
                <span className="text-sm">RedM Studio</span>
              </button>
            )}
          </div>
        </div>

        <div className="px-4 pb-2">
          <div className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-white/45 px-2">Chats</div>
        </div>

        <div className="h-[calc(100vh-16.25rem)] overflow-y-auto px-3 pb-4 native-scrollbar">
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-white/60 px-2 py-3">
              {conversations.length === 0 ? 'No conversations yet' : 'Aucun résultat'}
            </p>
          ) : (
            <div className="space-y-1">
              {filtered.map((conv) => (
                <div
                  key={conv.id}
                  className={`group flex items-center justify-between px-3 py-2 rounded-xl transition-colors cursor-pointer ${
                    selectedId === conv.id
                      ? 'bg-white/45 dark:bg-white/12'
                      : 'hover:bg-white/35 dark:hover:bg-white/10'
                  }`}
                  onClick={() => {
                    onSelectConversation?.(conv.id);
                    setExpanded(false);
                  }}
                  title={conv.title}
                >
                  <span className="text-sm text-gray-900 dark:text-white truncate flex-1">
                    {conv.title}
                  </span>
                  <button
                    type="button"
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
      </aside>
    </>
  );
}
