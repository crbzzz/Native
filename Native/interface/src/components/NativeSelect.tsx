import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronsUpDown, Check } from 'lucide-react';

export type NativeSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export function NativeSelect(props: {
  value: string;
  onChange: (value: string) => void;
  options: NativeSelectOption[];
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
  optionClassName?: string;
  align?: 'left' | 'right';
}) {
  const {
    value,
    onChange,
    options,
    disabled,
    className,
    buttonClassName,
    menuClassName,
    optionClassName,
    align = 'left',
  } = props;

  const id = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(() => Math.max(0, options.findIndex((o) => o.value === value)));

  const selected = useMemo(() => options.find((o) => o.value === value) || options[0], [options, value]);

  useEffect(() => {
    setActiveIndex(Math.max(0, options.findIndex((o) => o.value === value)));
  }, [options, value]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown, true);
    return () => window.removeEventListener('mousedown', onDown, true);
  }, [open]);

  const commit = (next: string) => {
    onChange(next);
    setOpen(false);
    requestAnimationFrame(() => buttonRef.current?.focus());
  };

  const moveActive = (delta: number) => {
    if (!options.length) return;
    let i = activeIndex;
    for (let tries = 0; tries < options.length; tries++) {
      i = (i + delta + options.length) % options.length;
      if (!options[i]?.disabled) {
        setActiveIndex(i);
        return;
      }
    }
  };

  return (
    <div ref={rootRef} className={className || ''}>
      <button
        ref={buttonRef}
        type="button"
        disabled={!!disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`native-select-${id}`}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen(true);
            return;
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!open) setOpen(true);
            moveActive(1);
            return;
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (!open) setOpen(true);
            moveActive(-1);
            return;
          }
          if (e.key === 'Escape') {
            if (open) {
              e.preventDefault();
              setOpen(false);
            }
          }
        }}
        className={
          buttonClassName ||
          'w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl border border-white/45 dark:border-white/12 bg-white/35 dark:bg-white/10 text-gray-900 dark:text-white outline-none backdrop-blur-md backdrop-saturate-150 hover:bg-white/45 dark:hover:bg-white/15 transition-colors focus-visible:ring-2 focus-visible:ring-sky-500/30'
        }
      >
        <span className="truncate text-left">{selected?.label ?? value}</span>
        <ChevronsUpDown size={16} className="shrink-0 text-gray-700/80 dark:text-white/70" />
      </button>

      {open && (
        <div
          id={`native-select-${id}`}
          role="listbox"
          className={
            (menuClassName ||
              'mt-2 rounded-2xl border border-white/35 dark:border-white/12 bg-white/70 dark:bg-slate-950/65 backdrop-blur-md backdrop-saturate-150 shadow-lg overflow-hidden') +
            ' ' +
            (align === 'right' ? 'ml-auto' : '')
          }
          style={{ minWidth: '100%' }}
        >
          <div className="max-h-64 overflow-auto">
            {options.map((o, idx) => {
              const isSelected = o.value === value;
              const isActive = idx === activeIndex;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={!!o.disabled}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => {
                    if (o.disabled) return;
                    commit(o.value);
                  }}
                  className={
                    (optionClassName ||
                      'w-full px-3.5 py-2.5 text-sm flex items-center justify-between gap-3 text-left transition-colors') +
                    ' ' +
                    (o.disabled
                      ? 'opacity-50 cursor-not-allowed'
                      : isActive
                        ? 'bg-white/55 dark:bg-white/10'
                        : 'hover:bg-white/45 dark:hover:bg-white/10') +
                    ' ' +
                    (isSelected ? 'text-gray-900 dark:text-white' : 'text-gray-800 dark:text-white/80')
                  }
                >
                  <span className="truncate">{o.label}</span>
                  {isSelected ? <Check size={16} className="shrink-0 text-gray-700 dark:text-white/80" /> : <span className="w-4" />}
                </button>
              );
            })}
          </div>

          <div className="px-3.5 py-2 border-t border-white/25 dark:border-white/10 text-[11px] text-gray-600 dark:text-white/55">
            ↑↓ navigate • Enter select • Esc close
          </div>
        </div>
      )}
    </div>
  );
}
