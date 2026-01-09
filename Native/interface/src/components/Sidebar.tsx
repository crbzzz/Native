import { LayoutGrid, Plus, MessageSquare, Home, X } from 'lucide-react';
import { useState } from 'react';

interface SidebarProps {
  onNewChat: () => void;
  onApps: () => void;
  onHome: () => void;
  conversations?: Array<{ id: string; title: string }>;
  selectedId?: string | null;
  onSelectConversation?: (id: string) => void;
  onDeleteConversation?: (id: string) => void;
}

export default function Sidebar({
  onNewChat,
  onApps,
  onHome,
  conversations = [],
  selectedId,
  onSelectConversation,
  onDeleteConversation,
}: SidebarProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <div className="fixed left-0 top-0 h-full w-20 bg-white/30 dark:bg-slate-950/35 border-r border-white/35 dark:border-white/10 backdrop-blur-md backdrop-saturate-150 flex flex-col items-center py-4 gap-3 z-50">
        <button
          onClick={onHome}
          className="w-10 h-10 flex items-center justify-center text-gray-600 hover:text-gray-900 dark:text-white/70 dark:hover:text-white transition-colors"
          title="Home"
        >
          <Home size={20} />
        </button>
        <button
          onClick={() => {
            setExpanded(!expanded);
          }}
          className="w-10 h-10 flex items-center justify-center text-gray-600 hover:text-gray-900 dark:text-white/70 dark:hover:text-white transition-colors"
          title="Conversations"
        >
          <MessageSquare size={20} />
        </button>
        <button
          onClick={onNewChat}
          className="w-10 h-10 flex items-center justify-center bg-black text-white rounded-lg hover:bg-gray-800 dark:bg-white/12 dark:text-white dark:border dark:border-white/15 dark:hover:bg-white/16 transition-colors"
          title="New Chat"
        >
          <Plus size={20} />
        </button>
        <button
          onClick={onApps}
          className="w-10 h-10 flex items-center justify-center text-gray-600 hover:text-gray-900 dark:text-white/70 dark:hover:text-white transition-colors"
          title="Applications"
        >
          <LayoutGrid size={20} />
        </button>
      </div>

      {expanded && (
        <div className="fixed left-20 top-0 h-full w-64 bg-white/30 dark:bg-slate-950/35 border-r border-white/35 dark:border-white/10 backdrop-blur-md backdrop-saturate-150 overflow-y-auto z-40 pt-4">
          <div className="px-4 space-y-2">
            {conversations.length === 0 ? (
              <p className="text-sm text-gray-600 dark:text-white/60 px-2 py-4">No conversations yet</p>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`group flex items-center justify-between p-3 rounded-lg transition-colors cursor-pointer ${
                    selectedId === conv.id
                      ? 'bg-white/45 dark:bg-white/12'
                      : 'hover:bg-white/35 dark:hover:bg-white/10'
                  }`}
                  onClick={() => {
                    onSelectConversation?.(conv.id);
                  }}
                >
                  <span className="text-sm text-gray-900 dark:text-white truncate flex-1">
                    {conv.title}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteConversation?.(conv.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-white/40 dark:hover:bg-white/10 rounded"
                  >
                    <X size={16} className="text-gray-600 dark:text-white/70" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}
