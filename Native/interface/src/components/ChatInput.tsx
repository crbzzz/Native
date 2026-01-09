import { useEffect, useRef } from 'react';
import { Paperclip, Search, Sparkles, MoreHorizontal, ArrowUp } from 'lucide-react';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  deepSearch?: boolean;
  reason?: boolean;
  onDeepSearchChange?: (value: boolean) => void;
  onReasonChange?: (value: boolean) => void;
  onFilesSelected?: (files: File[]) => void;
}

export default function ChatInput({
  value,
  onChange,
  onSend,
  disabled,
  deepSearch,
  reason,
  onDeepSearchChange,
  onReasonChange,
  onFilesSelected,
}: ChatInputProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const resizeTextarea = (el?: HTMLTextAreaElement | null) => {
    const ta = el ?? textareaRef.current;
    if (!ta) return;

    const maxPx = 180;
    ta.style.height = '0px';
    const next = Math.min(ta.scrollHeight, maxPx);
    ta.style.height = `${next}px`;
    ta.style.overflowY = ta.scrollHeight > maxPx ? 'auto' : 'hidden';
  };

  useEffect(() => {
    resizeTextarea();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="w-full max-w-3xl mx-auto px-4">
      <div
        className={
          'relative overflow-hidden rounded-3xl transition-colors ' +
          'bg-white/45 border border-white/55 dark:bg-slate-950/35 dark:border-white/12 ' +
          'shadow-lg backdrop-blur-sm backdrop-saturate-150 ' +
          "before:content-[''] before:absolute before:inset-0 before:rounded-[inherit] before:pointer-events-none " +
          'before:z-0 before:ring-1 before:ring-white/25 ' +
          "after:content-[''] after:absolute after:inset-0 after:rounded-[inherit] after:pointer-events-none " +
          'after:z-0 after:bg-gradient-to-br after:from-white/35 after:to-transparent after:opacity-60'
        }
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          accept=".pdf,image/png,image/jpeg"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) onFilesSelected?.(files);
            e.currentTarget.value = '';
          }}
        />

        <textarea
          ref={textareaRef}
          placeholder="Ask anything"
          className="relative z-10 w-full px-6 pt-3 pb-10 bg-transparent resize-none outline-none text-gray-900 dark:text-white placeholder-gray-500/80 dark:placeholder-white/50"
          rows={1}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            resizeTextarea(e.currentTarget);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (!disabled) onSend();
            }
          }}
        />

        <div className="absolute bottom-2 left-6 right-16 flex items-center gap-4 relative z-10">
          <button
            type="button"
            className="flex items-center justify-center text-gray-400 hover:text-gray-600 dark:text-white/60 dark:hover:text-white transition-colors"
            onClick={() => fileInputRef.current?.click()}
            title="Upload file"
          >
            <Paperclip size={18} />
          </button>

          <button
            type="button"
            aria-pressed={Boolean(deepSearch)}
            onClick={() => onDeepSearchChange?.(!deepSearch)}
            className={
              'flex items-center gap-1.5 transition-colors text-sm rounded-full px-3 py-1.5 border ' +
              (deepSearch
                ? 'text-gray-900 border-gray-300 bg-gray-100/80 dark:text-white dark:border-white/15 dark:bg-white/10'
                : 'text-gray-600 border-transparent hover:text-gray-800 dark:text-white/70 dark:hover:text-white')
            }
          >
            <Search size={16} />
            <span>Deep Search</span>
          </button>

          <button
            type="button"
            aria-pressed={Boolean(reason)}
            onClick={() => onReasonChange?.(!reason)}
            className={
              'flex items-center gap-1.5 transition-colors text-sm rounded-full px-3 py-1.5 border ' +
              (reason
                ? 'text-gray-900 border-gray-300 bg-gray-100/80 dark:text-white dark:border-white/15 dark:bg-white/10'
                : 'text-gray-600 border-transparent hover:text-gray-800 dark:text-white/70 dark:hover:text-white')
            }
          >
            <Sparkles size={16} />
            <span>Reason</span>
          </button>

          <button
            type="button"
            className="flex items-center justify-center text-gray-400 hover:text-gray-600 dark:text-white/60 dark:hover:text-white transition-colors"
            title="More"
          >
            <MoreHorizontal size={18} />
          </button>
        </div>

        <button
          type="button"
          disabled={disabled}
          onClick={onSend}
          className={
            'absolute bottom-2 right-3 z-20 w-10 h-10 rounded-full flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed ' +
            'overflow-hidden ' +
            'bg-white/45 text-gray-900 border border-white/50 backdrop-blur-sm backdrop-saturate-150 hover:bg-white/55 ' +
            'dark:bg-white/10 dark:text-white dark:border-white/15 dark:hover:bg-white/14 ' +
            "before:content-[''] before:absolute before:inset-0 before:rounded-[inherit] before:pointer-events-none " +
              'before:z-0 before:bg-gradient-to-br before:from-white/25 before:to-transparent before:opacity-70'
          }
        >
            <span className="relative z-10">
              <ArrowUp size={20} />
            </span>
        </button>
      </div>
    </div>
  );
}
