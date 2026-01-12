import { useEffect, useRef, useState } from 'react';
import { Paperclip, Search, Sparkles, ArrowUp, Mic, Loader2, Square } from 'lucide-react';
import { transcribeAudio } from '../lib/nativeChat';

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

  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [sttInfo, setSttInfo] = useState<{ spoken: string; text: string } | null>(null);
  const [sttError, setSttError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

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

  useEffect(() => {
    return () => {
      try {
        recorderRef.current?.stop();
      } catch (_) {
        // ignore
      }
      streamRef.current?.getTracks()?.forEach((t) => t.stop());
      streamRef.current = null;
      recorderRef.current = null;
    };
  }, []);

  const canRecord =
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    Boolean((navigator as any)?.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== 'undefined';

  const pickMimeType = () => {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
    ];
    for (const t of candidates) {
      try {
        if ((MediaRecorder as any).isTypeSupported?.(t)) return t;
      } catch (_) {
        // ignore
      }
    }
    return '';
  };

  const stopRecording = () => {
    const rec = recorderRef.current;
    if (!rec) return;
    try {
      // Some browsers only emit data on requestData/stop; this helps avoid empty blobs.
      (rec as any).requestData?.();
      rec.stop();
    } catch (_) {
      // ignore
    }
  };

  const startRecording = async () => {
    if (!canRecord) return;
    if (disabled) return;
    if (transcribing) return;

    setSttError(null);
    setSttInfo(null);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    const mimeType = pickMimeType();
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorderRef.current = rec;
    chunksRef.current = [];

    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    rec.onstop = () => {
      setRecording(false);
      const streamNow = streamRef.current;
      streamNow?.getTracks()?.forEach((t) => t.stop());
      streamRef.current = null;

      const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
      chunksRef.current = [];

      const ext = (mimeType || '').includes('ogg') ? 'ogg' : 'webm';
      const f = new File([blob], `voice.${ext}`, { type: blob.type });

      void (async () => {
        setTranscribing(true);
        try {
          const result = await transcribeAudio(f);
          const spoken = (result.spoken || '').trim();
          // Always insert/display the French translation (or fallback to spoken if empty)
          const translated = ((result.text || '').trim() || spoken).trim();

          if (!translated) return;
          setSttInfo({ spoken: '', text: translated });

          // Écrit dans l'input: uniquement la traduction française
          const insertion = translated;

          const currentValue = (textareaRef.current?.value ?? value ?? '').toString();
          const base = currentValue.trimEnd();
          const next = base ? `${base}\n\n${insertion}` : insertion;
          onChange(next);
          requestAnimationFrame(() => {
            textareaRef.current?.focus();
            const el = textareaRef.current;
            if (el) {
              const end = el.value.length;
              el.setSelectionRange(end, end);
            }
          });
        } catch (e) {
          console.error('Transcription failed:', e);
          setSttError(e instanceof Error ? e.message : String(e));
        } finally {
          setTranscribing(false);
        }
      })();
    };

    rec.start();
    setRecording(true);
  };

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
          className="relative z-10 w-full px-5 pt-2.5 pb-9 bg-transparent resize-none outline-none text-gray-900 dark:text-white placeholder-gray-500/80 dark:placeholder-white/50"
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

        {(sttError || sttInfo) && (
          <div className="absolute bottom-[2.85rem] left-5 right-14 z-10 text-[11px]">
            {sttError ? (
              <span className="text-red-600 dark:text-red-400">{sttError}</span>
            ) : (
              <span className="text-gray-600 dark:text-white/60">Transcription ajoutée</span>
            )}
          </div>
        )}

        <div className="absolute bottom-1.5 left-5 right-14 flex items-center gap-4 relative z-10">
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
            disabled={!canRecord || disabled || transcribing}
            onClick={() => {
              if (recording) {
                stopRecording();
              } else {
                void startRecording().catch((e) => {
                  console.error('Mic error:', e);
                  setRecording(false);
                  setSttError(e instanceof Error ? e.message : String(e));
                  streamRef.current?.getTracks()?.forEach((t) => t.stop());
                  streamRef.current = null;
                });
              }
            }}
            className={
              'flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed ' +
              (recording
                ? 'text-white bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 rounded-full w-9 h-9'
                : transcribing
                  ? 'text-white bg-slate-700 hover:bg-slate-800 dark:bg-white/15 dark:hover:bg-white/20 rounded-full w-9 h-9'
                  : 'text-gray-400 hover:text-gray-600 dark:text-white/60 dark:hover:text-white')
            }
            title={
              !canRecord
                ? 'Micro non supporté'
                : transcribing
                  ? 'Transcription...'
                  : recording
                    ? 'Stop'
                    : 'Micro'
            }
          >
            {transcribing ? (
              <Loader2 size={18} className="animate-spin" />
            ) : recording ? (
              <Square size={16} />
            ) : (
              <Mic size={18} />
            )}
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

        </div>

        <button
          type="button"
          disabled={disabled}
          onClick={onSend}
          className={
            'absolute bottom-1.5 right-3 z-20 w-10 h-10 rounded-full flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed ' +
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
