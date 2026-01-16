import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, GripVertical, MoreVertical, Search, X } from 'lucide-react';
import ChatInput from '../components/ChatInput';
import MessageContent from '../components/MessageContent';
import Header from '../components/Header';
import { sendChat, type ChatMessage } from '../lib/nativeChat';
import { sendChatPersisted } from '../lib/nativeChat';
import { sanitizeAssistantText } from '../lib/sanitizeAssistantText';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import JSZip from 'jszip';
import { getMessages } from '../lib/messages';

type FrameworkOption = {
  id: string;
  label: string;
  hint?: string;
};

type GeneratedFile = {
  name: string;
  code: string;
};

type StudioMessage = {
  role: 'user' | 'assistant';
  display: string;
  api: string;
};

type AiFile = { path: string; content: string };
type AiStudioResponse = { message?: string; files?: AiFile[] };

function looksLikeBinary(buffer: ArrayBuffer): boolean {
  // Heuristic: presence of NUL bytes or too many non-text control bytes.
  // This avoids importing audio/video/images into the code viewer (mp3/png/mp4...).
  const bytes = new Uint8Array(buffer);
  if (!bytes.length) return false;

  let nulCount = 0;
  let suspiciousCount = 0;
  const sampleLen = Math.min(bytes.length, 8192);

  for (let i = 0; i < sampleLen; i++) {
    const b = bytes[i];
    if (b === 0) nulCount++;

    // Allow common whitespace + printable ASCII. Anything else below 0x20 is suspicious.
    const isAllowedControl = b === 9 || b === 10 || b === 13;
    if (b < 32 && !isAllowedControl) suspiciousCount++;
  }

  if (nulCount > 0) return true;
  // If more than ~2% suspicious control bytes in the sample, treat as binary.
  return suspiciousCount / sampleLen > 0.02;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function extractJsonObject(raw: string): string | null {
  const text = (raw || '').trim();
  if (!text) return null;

  // Strip ```json fences if present
  const withoutFences = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const start = withoutFences.indexOf('{');
  const end = withoutFences.lastIndexOf('}');
  if (start < 0 || end < 0 || end <= start) return null;
  return withoutFences.slice(start, end + 1);
}

function guessLanguageFromFilename(name: string): string | undefined {
  const lower = (name || '').toLowerCase();
  const dot = lower.lastIndexOf('.');
  const ext = dot >= 0 ? lower.slice(dot + 1) : '';

  switch (ext) {
    case 'lua':
      return 'lua';
    case 'js':
      return 'javascript';
    case 'ts':
      return 'typescript';
    case 'tsx':
      return 'tsx';
    case 'json':
      return 'json';
    case 'md':
      return 'markdown';
    case 'yml':
    case 'yaml':
      return 'yaml';
    case 'toml':
      return 'toml';
    case 'xml':
      return 'xml';
    case 'html':
      return 'html';
    case 'css':
      return 'css';
    default:
      return undefined;
  }
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch (_) {
    // fallthrough
  }

  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  ta.style.top = '0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}

type Props = {
  title: string;
  onBack: () => void;
  frameworks?: FrameworkOption[];
  defaultFrameworkId?: string;
  mode?: 'framework' | 'code';
  showPersonalMenu?: boolean;
  showTopBar?: boolean;
  initialConversationId?: string;
};

type SplitDrag = {
  startX: number;
  startPct: number;
  containerLeft: number;
  containerWidth: number;
};

type Point = { x: number; y: number };

function toDownloadName(path: string): string {
  const cleaned = (path || '').trim();
  if (!cleaned) return 'file.txt';
  // Browsers won't reliably create folders; keep it simple.
  return cleaned.replace(/[\\/]+/g, '__');
}

function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content ?? ''], { type: 'text/plain;charset=utf-8' });
  downloadBlobFile(filename, blob);
}

function downloadBlobFile(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function projectTitleFromPrompt(prompt: string): string {
  const cleaned = (prompt || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[`"'\[\]{}()]/g, '')
    .replace(/[,:;.!?]+/g, ' ')
    .trim();

  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Project';
  return parts.slice(0, 4).join(' ');
}

export default function FrameworkStudio({
  title,
  onBack,
  frameworks,
  defaultFrameworkId,
  mode = 'framework',
  showPersonalMenu,
  showTopBar,
  initialConversationId,
}: Props) {
  const hasFrameworks = Array.isArray(frameworks) && frameworks.length > 0;
  const initialFrameworkId = (defaultFrameworkId && defaultFrameworkId.trim()) || (frameworks?.[0]?.id ?? '');
  const [frameworkId, setFrameworkId] = useState(initialFrameworkId);
  const [messages, setMessages] = useState<StudioMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [thinking, setThinking] = useState(false);

  const [files, setFiles] = useState<GeneratedFile[]>([]);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [openFileNames, setOpenFileNames] = useState<string[]>([]);
  const [fileFilter, setFileFilter] = useState('');
  const [copied, setCopied] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [projectConversationId, setProjectConversationId] = useState<string | null>(initialConversationId ?? null);
  const [codeContextMenu, setCodeContextMenu] = useState<Point | null>(null);
  const [fileContextMenu, setFileContextMenu] = useState<(Point & { name: string }) | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const contextMenuPortalTarget = typeof document !== 'undefined' ? document.body : null;

  const fileUploadRef = useRef<HTMLInputElement | null>(null);

  const fileAnimTokenRef = useRef(0);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const framework = useMemo(() => {
    if (!hasFrameworks) return null;
    return frameworks!.find((f) => f.id === frameworkId) ?? frameworks![0];
  }, [frameworkId, frameworks, hasFrameworks]);

  const selectedFile = useMemo(
    () => files.find((f) => f.name === selectedFileName) ?? null,
    [files, selectedFileName]
  );

  const selectedFileLanguage = useMemo(() => {
    if (!selectedFile) return undefined;
    return guessLanguageFromFilename(selectedFile.name);
  }, [selectedFile]);

  const selectedFileLineCount = useMemo(() => {
    if (!selectedFile) return 0;
    const text = selectedFile.code ?? '';
    if (!text) return 0;
    return text.split(/\r\n|\r|\n/).length;
  }, [selectedFile]);

  const isDark =
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

  const resolvedShowTopBar = showTopBar ?? (mode === 'code' ? true : !showPersonalMenu);

  const splitStorageKey = `native:studio:split:${mode}`;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<SplitDrag | null>(null);
  const [leftPct, setLeftPct] = useState<number>(() => {
    if (typeof window === 'undefined') return 42;
    const raw = window.localStorage.getItem(splitStorageKey);
    const n = raw ? Number(raw) : NaN;
    if (!Number.isFinite(n)) return 42;
    return Math.min(70, Math.max(28, n));
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(splitStorageKey, String(leftPct));
    } catch (_) {
      // ignore
    }
  }, [leftPct, splitStorageKey]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const x = e.clientX;
      const dx = x - drag.startX;
      const nextX = drag.containerLeft + (drag.startPct / 100) * drag.containerWidth + dx;
      const pct = ((nextX - drag.containerLeft) / Math.max(1, drag.containerWidth)) * 100;
      const clamped = Math.min(70, Math.max(28, pct));
      setLeftPct(clamped);
    };

    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  const openAndSelectFile = (name: string) => {
    setSelectedFileName(name);
    setOpenFileNames((prev) => (prev.includes(name) ? prev : [...prev, name]));
  };

  const closeTab = (name: string) => {
    setOpenFileNames((prev) => {
      const next = prev.filter((f) => f !== name);
      if (selectedFileName === name) {
        const fallback = next[next.length - 1] ?? null;
        setSelectedFileName(fallback);
      }
      return next;
    });
  };

  const fileBasename = (p: string) => {
    const parts = (p || '').split(/[\\/]/g).filter(Boolean);
    return parts[parts.length - 1] ?? p;
  };

  const normalizedPath = (p: string) => (p || '').replace(/\\/g, '/');

  const clampMenuPoint = (p: Point, menuW = 240, menuH = 140): Point => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const h = typeof window !== 'undefined' ? window.innerHeight : 800;
    const x = p.x > w - menuW - 8 ? p.x - menuW : p.x;
    const y = p.y > h - menuH - 8 ? p.y - menuH : p.y;
    return { x: Math.max(8, x), y: Math.max(8, y) };
  };

  const openCodeContextMenu = (p: Point) => {
    setCodeContextMenu(clampMenuPoint(p));
    setFileContextMenu(null);
    setActionsOpen(false);
  };

  const openFileContextMenu = (p: Point, name: string) => {
    setFileContextMenu({ ...clampMenuPoint(p), name });
    setCodeContextMenu(null);
    setActionsOpen(false);
  };

  const filteredFiles = useMemo(() => {
    const q = fileFilter.trim().toLowerCase();
    if (!q) return files;
    return files.filter((f) => (f.name || '').toLowerCase().includes(q));
  }, [files, fileFilter]);

  const fileGroups = useMemo(() => {
    const sorted = [...filteredFiles].sort((a, b) => normalizedPath(a.name).localeCompare(normalizedPath(b.name)));
    const groups: Array<{ dir: string; items: GeneratedFile[] }> = [];
    let currentDir: string | null = null;

    for (const f of sorted) {
      const p = normalizedPath(f.name);
      const dir = p.includes('/') ? p.split('/').slice(0, -1).join('/') : '';
      if (dir !== currentDir) {
        groups.push({ dir, items: [f] });
        currentDir = dir;
      } else {
        groups[groups.length - 1]?.items.push(f);
      }
    }

    return groups;
  }, [filteredFiles]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    // Cancel any ongoing progressive file writing.
    fileAnimTokenRef.current += 1;

    const outputRules =
      'Réponds STRICTEMENT en JSON valide, sans Markdown: ' +
      '{"message":"(court)","files":[{"path":"chemin/nom.ext","content":"contenu du fichier"}]}.\n' +
      'Règles: files[].path obligatoire si tu crées un fichier. content = code brut.';

    const perAppSystemPrompt =
      mode === 'code'
        ? `Tu es Native AI, un assistant spécialisé dans la génération de projets.\n` +
          `Contexte: Code Studio (${title}).\n` +
          `Objectif: proposer une structure propre et du code utilisable.\n` +
          `${outputRules}\n` +
          `Réponds en français, clair et concis.`
        : `Tu es Native AI, un assistant spécialisé dans la génération de resources.\n` +
          `Contexte: application ${title}, framework ${framework?.label ?? ''}.\n` +
          `Objectif: proposer une structure propre et du code utilisable.\n` +
          `${outputRules}\n` +
          `Réponds en français, clair et concis.`;

    const userApiPrefix =
      mode === 'code'
        ? ''
        : `Plateforme: ${title}\nFramework: ${framework?.label ?? ''}\n\n` +
          "Ta mission: produire des fichiers pour un resource (ex: fxmanifest + client/server + config).\n" +
          `${outputRules}\n\n`;
    const nextMessages: StudioMessage[] = [
      ...messages,
      { role: 'user', display: text, api: userApiPrefix + text },
    ];

    setMessages(nextMessages);
    setInput('');
    setSending(true);
    setThinking(true);

    try {
      const apiMessages: ChatMessage[] =
        mode === 'code'
          ? nextMessages.map((m) => ({ role: m.role, content: m.display }))
          : nextMessages.map((m) => ({ role: m.role, content: m.api }));

      let raw: string;
      if (mode === 'code') {
        const res = await sendChatPersisted(apiMessages, {
          systemPrompt: perAppSystemPrompt,
          conversationId: projectConversationId ?? undefined,
          conversationTitle: projectConversationId
            ? undefined
            : `[Code Studio] ${projectTitleFromPrompt(text)}`,
        });
        raw = res.reply;
        if (res.conversationId && !projectConversationId) {
          setProjectConversationId(res.conversationId);
        }
      } else {
        raw = await sendChat(apiMessages, { systemPrompt: perAppSystemPrompt });
      }

      const assistant = sanitizeAssistantText(raw);

      const jsonText = extractJsonObject(assistant);
      let parsed: AiStudioResponse | null = null;
      if (jsonText) {
        try {
          parsed = JSON.parse(jsonText) as AiStudioResponse;
        } catch (_) {
          parsed = null;
        }
      }

      const nextFiles = (parsed?.files ?? []).filter(
        (f): f is AiFile => Boolean(f && typeof f.path === 'string' && typeof f.content === 'string')
      );

      if (nextFiles.length > 0) {
        const token = fileAnimTokenRef.current;
        void (async () => {
          const chunkSize = 220;
          const stepDelayMs = 22;

          for (const nf of nextFiles) {
            if (fileAnimTokenRef.current !== token) return;

            const path = nf.path.trim();
            const full = String(nf.content ?? '');

            // Create/replace the file with empty content first.
            setFiles((prev) => {
              const without = prev.filter((f) => f.name !== path);
              return [{ name: path, code: '' }, ...without];
            });
            setOpenFileNames((prev) => (prev.includes(path) ? prev : [...prev, path]));
            setSelectedFileName((prevSelected) => prevSelected ?? path);

            let i = 0;
            while (i < full.length) {
              if (fileAnimTokenRef.current !== token) return;
              i = Math.min(full.length, i + chunkSize);
              const partial = full.slice(0, i);

              setFiles((prev) =>
                prev.map((f) => (f.name === path ? { ...f, code: partial } : f))
              );

              await sleep(stepDelayMs);
            }

            // Small pause between files so it feels sequential.
            await sleep(90);
          }
        })();
      }

      const assistantDisplay = (parsed?.message ?? '').trim();
      if (assistantDisplay) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            display: assistantDisplay,
            api: assistant,
          },
        ]);
      } else if (nextFiles.length === 0 && assistant.trim()) {
        // Fallback: if the model didn't return the JSON shape we expect, show raw text
        // so the UI doesn't look like it did nothing.
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            display: assistant,
            api: assistant,
          },
        ]);
      }

      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      });

    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          display: `Erreur: ${msg}`,
          api: `Erreur: ${msg}`,
        },
      ]);
    } finally {
      setThinking(false);
      setSending(false);
    }
  };

  useEffect(() => {
    if (mode !== 'code') return;
    if (!initialConversationId) return;

    const run = async () => {
      try {
        const rows = await getMessages(initialConversationId);
        setProjectConversationId(initialConversationId);

        const rebuiltMessages: StudioMessage[] = rows.map((r) => {
          if (r.role === 'assistant') {
            const cleaned = sanitizeAssistantText(r.content ?? '');
            const jsonText = extractJsonObject(cleaned);
            if (jsonText) {
              try {
                const parsed = JSON.parse(jsonText) as AiStudioResponse;
                const display = (parsed?.message ?? '').trim() || cleaned;
                return { role: 'assistant', display, api: cleaned };
              } catch {
                return { role: 'assistant', display: cleaned, api: cleaned };
              }
            }
            return { role: 'assistant', display: cleaned, api: cleaned };
          }
          return { role: 'user', display: r.content ?? '', api: r.content ?? '' };
        });

        // Rebuild file list from latest assistant JSON that includes files.
        let latestFiles: GeneratedFile[] = [];
        for (const m of rows) {
          if (m.role !== 'assistant') continue;
          const cleaned = sanitizeAssistantText(m.content ?? '');
          const jsonText = extractJsonObject(cleaned);
          if (!jsonText) continue;
          try {
            const parsed = JSON.parse(jsonText) as AiStudioResponse;
            const nextFiles = (parsed?.files ?? []).filter(
              (f): f is AiFile => Boolean(f && typeof f.path === 'string' && typeof f.content === 'string')
            );
            if (nextFiles.length) {
              latestFiles = nextFiles.map((f) => ({ name: f.path, code: f.content }));
            }
          } catch {
            // ignore
          }
        }

        setMessages(rebuiltMessages);
        setFiles(latestFiles);
        if (latestFiles.length) {
          setOpenFileNames(latestFiles.map((f) => f.name));
          setSelectedFileName((prev) => prev ?? latestFiles[0]!.name);
        }

        requestAnimationFrame(() => {
          bottomRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
        });
      } catch (_) {
        // If user isn't authenticated or load fails, keep empty state.
      }
    };

    void run();
  }, [initialConversationId, mode]);

  const handleCopy = async () => {
    if (!selectedFile) return;
    await copyToClipboard(selectedFile.code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 900);
  };

  const handleDownloadSelected = () => {
    if (!selectedFile) return;
    downloadTextFile(toDownloadName(selectedFile.name), selectedFile.code);
  };

  const handleDownloadAll = async () => {
    if (!files.length) return;
    // Some browsers will block massive multi-downloads; we space clicks slightly.
    for (const f of files) {
      downloadTextFile(toDownloadName(f.name), f.code);
      await sleep(120);
    }
  };

  const handleDownloadZip = async () => {
    if (!files.length) return;
    if (zipping) return;
    setZipping(true);
    try {
      const zip = new JSZip();
      for (const f of files) {
        const path = normalizedPath(f.name).replace(/^\/+/, '').trim() || 'file.txt';
        zip.file(path, f.code ?? '');
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      const base = (title || 'project')
        .toLowerCase()
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48);
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlobFile(`${base || 'project'}-${stamp}.zip`, blob);
    } finally {
      setZipping(false);
    }
  };

  const sanitizeRelativePath = (p: string): string[] | null => {
    const raw = normalizedPath(p).replace(/^\/+/, '').trim();
    if (!raw) return null;
    const parts = raw.split('/').map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return null;
    if (parts.some((seg) => seg === '.' || seg === '..')) return null;
    return parts;
  };

  const handleExportToFolder = async () => {
    if (!files.length) return;
    const picker = (window as any)?.showDirectoryPicker as undefined | (() => Promise<any>);
    if (!picker) {
      // Fallback: best effort
      await handleDownloadZip();
      return;
    }

    if (exporting) return;
    setExporting(true);
    try {
      const root = await picker();
      for (const f of files) {
        const parts = sanitizeRelativePath(f.name);
        if (!parts) continue;

        const fileName = parts[parts.length - 1]!;
        const dirParts = parts.slice(0, -1);

        let dirHandle: any = root;
        for (const seg of dirParts) {
          dirHandle = await dirHandle.getDirectoryHandle(seg, { create: true });
        }

        const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(f.code ?? '');
        await writable.close();
      }
    } finally {
      setExporting(false);
      setActionsOpen(false);
    }
  };

  useEffect(() => {
    if (!actionsOpen) return;

    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-actions-root="true"]')) return;
      setActionsOpen(false);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActionsOpen(false);
    };

    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [actionsOpen]);

  useEffect(() => {
    if (!codeContextMenu) return;

    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-code-context-root="true"]')) return;
      setCodeContextMenu(null);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCodeContextMenu(null);
    };

    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [codeContextMenu]);

  useEffect(() => {
    if (!fileContextMenu) return;

    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-file-context-root="true"]')) return;
      setFileContextMenu(null);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFileContextMenu(null);
    };

    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [fileContextMenu]);

  const deleteFileByName = (name: string) => {
    setFiles((prev) => {
      const next = prev.filter((f) => f.name !== name);
      setOpenFileNames((tabs) => tabs.filter((n) => n !== name));
      setSelectedFileName((selected) => (selected === name ? next[0]?.name ?? null : selected));
      return next;
    });
  };

  const handleUploadFile = async (file: File) => {
    setImportError(null);

    const type = (file?.type || '').toLowerCase();
    if (type.startsWith('image/') || type.startsWith('video/') || type.startsWith('audio/')) {
      setImportError('Fichier non supporté: importe un fichier de code (texte), pas une image/vidéo/audio.');
      return;
    }

    // Hard cap to avoid freezing/crashing the page (e.g. large mp3/mp4 or big binaries).
    const maxBytes = 2_000_000; // ~2MB
    if ((file?.size ?? 0) > maxBytes) {
      setImportError('Fichier trop volumineux pour le Code Studio (max ~2MB).');
      return;
    }

    try {
      const head = await file.slice(0, 8192).arrayBuffer();
      if (looksLikeBinary(head)) {
        setImportError('Fichier binaire non supporté: importe un fichier texte (code/config).');
        return;
      }
    } catch (_) {
      // If we can't inspect the file, fall back to trying to read as text.
    }

    const name = (file?.name || '').trim() || 'file.txt';
    let content = '';
    try {
      content = await file.text();
    } catch (_) {
      // Fallback for older browsers
      content = '';
    }

    if (!content.trim()) {
      // Avoid adding an empty tab for unsupported/empty files.
      setImportError('Impossible de lire ce fichier comme du texte.');
      return;
    }

    setFiles((prev) => {
      const next = prev.filter((f) => f.name !== name);
      return [{ name, code: content }, ...next];
    });
    openAndSelectFile(name);
  };

  return (
    <div className="h-screen bg-transparent overflow-hidden">
      {showPersonalMenu && !resolvedShowTopBar && <Header />}

      {resolvedShowTopBar && (
        <div className="fixed top-0 left-0 right-0 h-14 bg-white/25 dark:bg-slate-950/35 border-b border-white/35 dark:border-white/10 backdrop-blur-md flex items-center gap-4 px-4 sm:px-6 z-40">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-gray-700 hover:text-gray-900 dark:text-white/70 dark:hover:text-white transition-colors"
          >
            <ArrowLeft size={18} />
            <span className="text-sm">Back</span>
          </button>

          {mode === 'code' ? (
            <div className="min-w-0">
              <div className="text-sm font-semibold">
                <span className="bg-gradient-to-r from-sky-500 via-indigo-500 to-fuchsia-500 bg-clip-text text-transparent native-animated-gradient">
                  {title}
                </span>
              </div>
              <div className="text-[11px] text-gray-600 dark:text-white/55 truncate">Studio</div>
            </div>
          ) : (
            <div className="min-w-0 text-sm font-semibold text-gray-900 dark:text-white truncate">{title}</div>
          )}

          {mode !== 'code' && hasFrameworks && (
            <div className="flex items-center gap-3">
              <div className="text-sm text-gray-700 dark:text-white/70">Framework</div>
              <select
                value={frameworkId}
                onChange={(e) => setFrameworkId(e.target.value)}
                className="text-sm rounded-xl px-3 py-1.5 bg-white/35 dark:bg-white/10 border border-white/45 dark:border-white/12 text-gray-900 dark:text-white outline-none"
              >
                {frameworks!.map((f) => (
                  <option key={f.id} value={f.id} className="text-gray-900">
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex-1" />
          {showPersonalMenu && <Header placement="inline" />}
        </div>
      )}

      <div
        ref={containerRef}
        className={(resolvedShowTopBar ? 'pt-14 ' : 'pt-0 ') + 'px-3 sm:px-5 md:px-6 py-3 h-full'}
      >
        <div className={mode === 'code' ? 'w-full h-full' : 'max-w-[96rem] mx-auto h-full'}>
          <div
            className="flex gap-0 mt-2"
            style={{ height: resolvedShowTopBar ? 'calc(100vh - 3.5rem - 2rem)' : 'calc(100vh - 2rem)' }}
          >
            {/* Left: Chat */}
            <div
              className="flex flex-col min-h-0 rounded-2xl shadow-lg border border-white/45 dark:border-white/12 bg-white/35 dark:bg-white/10 backdrop-blur-md backdrop-saturate-150 overflow-hidden"
              style={{ width: `${leftPct}%` }}
            >
              {mode === 'code' && (
                <div className="px-6 py-3 border-b border-white/35 dark:border-white/10">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">Instructions</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex-1 min-h-0 p-6">
                <div
                  ref={scrollerRef}
                  className="native-scrollbar h-full w-full overflow-y-auto pr-1 scroll-smooth"
                >
                  <div className="space-y-4 pt-2 pb-10">
                    {messages.map((m, idx) => (
                      <div
                        key={idx}
                        className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
                      >
                        <div
                          className={
                            m.role === 'user'
                              ? 'max-w-[85%] relative overflow-hidden rounded-2xl px-4 py-3 shadow-sm border border-white/55 bg-white/45 text-gray-900 dark:text-white dark:bg-blue-500/18 dark:bg-gradient-to-br dark:from-blue-500/34 dark:to-indigo-800/12 dark:border-blue-200/18 backdrop-blur-md backdrop-saturate-150 ' +
                                "before:content-[''] before:absolute before:inset-0 before:pointer-events-none before:rounded-[inherit] before:bg-gradient-to-br before:from-white/35 before:to-transparent before:opacity-70 dark:before:from-blue-200/26 dark:before:opacity-95 " +
                                "after:content-[''] after:absolute after:inset-0 after:pointer-events-none after:rounded-[inherit] after:ring-1 after:ring-white/25 dark:after:ring-blue-200/20"
                              : 'max-w-[85%] relative overflow-hidden rounded-2xl px-4 py-3 shadow-sm border border-white/40 bg-white/30 text-gray-900 dark:text-white dark:bg-white/10 dark:border-white/12 backdrop-blur-md backdrop-saturate-150'
                          }
                        >
                          <div className="prose prose-sm max-w-none dark:prose-invert prose-pre:my-0 prose-p:my-2">
                            <MessageContent content={m.display} />
                          </div>
                        </div>
                      </div>
                    ))}

                    {thinking && (
                      <div className="flex justify-start">
                        <div className="max-w-[85%] rounded-2xl px-4 py-3 shadow-sm border border-white/40 bg-white/30 text-gray-700 dark:text-white/80 dark:bg-white/10 dark:border-white/12 backdrop-blur-md backdrop-saturate-150">
                          Thinking…
                        </div>
                      </div>
                    )}

                    <div ref={bottomRef} />
                  </div>
                </div>
              </div>

              <div className="px-6 pb-5">
                <ChatInput
                  value={input}
                  onChange={setInput}
                  onSend={handleSend}
                  disabled={sending}
                />
              </div>
            </div>

            {/* Draggable split bar */}
            <div
              role="separator"
              aria-label="Resize panels"
              tabIndex={0}
              onPointerDown={(e) => {
                const el = containerRef.current;
                if (!el) return;
                const rect = el.getBoundingClientRect();
                dragRef.current = {
                  startX: e.clientX,
                  startPct: leftPct,
                  containerLeft: rect.left,
                  containerWidth: rect.width,
                };
                document.body.style.cursor = 'col-resize';
                document.body.style.userSelect = 'none';
                (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
              }}
              className="w-3 mx-2 flex items-center justify-center cursor-col-resize select-none"
              title="Drag to resize"
            >
              <div className="h-20 w-full rounded-full bg-white/30 dark:bg-white/10 border border-white/35 dark:border-white/10 flex items-center justify-center">
                <GripVertical size={16} className="text-gray-700/70 dark:text-white/50" />
              </div>
            </div>

            {/* Right: Explorer + Code */}
            <div
              className="min-h-0 rounded-2xl shadow-lg border border-white/45 dark:border-white/12 bg-white/35 dark:bg-white/10 backdrop-blur-md backdrop-saturate-150 overflow-hidden"
              style={{ width: `${100 - leftPct}%` }}
            >
              <div className="h-full grid grid-cols-1 md:grid-cols-[18rem_1fr]">
                {/* Explorer */}
                <div className="min-h-0 border-b md:border-b-0 md:border-r border-white/35 dark:border-white/10 p-4 overflow-y-auto native-scrollbar">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">Explorer</div>
                    <div className="text-xs text-gray-600 dark:text-white/70">{files.length}</div>
                  </div>

                  {mode === 'code' && (
                    <div className="mb-3">
                      <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500/70 dark:text-white/50" />
                        <input
                          value={fileFilter}
                          onChange={(e) => setFileFilter(e.target.value)}
                          placeholder="Filter files…"
                          className="w-full pl-9 pr-3 py-2 text-sm rounded-xl bg-white/35 dark:bg-white/10 border border-white/45 dark:border-white/12 text-gray-900 dark:text-white placeholder-gray-500/70 dark:placeholder-white/50 outline-none"
                        />
                      </div>
                    </div>
                  )}

                  {files.length === 0 ? (
                    <div />
                  ) : (
                    <div className="space-y-2">
                      {fileGroups.map((g) => (
                        <div key={g.dir || '__root'}>
                          {g.dir && (
                            <div className="px-2 pb-1 text-[11px] tracking-wide text-gray-600/90 dark:text-white/55">
                              {g.dir}/
                            </div>
                          )}
                          <div className="space-y-2">
                            {g.items.map((f) => (
                              <button
                                key={f.name}
                                onClick={() => openAndSelectFile(f.name)}
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  openFileContextMenu({ x: e.clientX, y: e.clientY }, f.name);
                                }}
                                className={
                                  'w-full text-left text-sm rounded-xl px-3 py-2 border transition-colors ' +
                                  (selectedFileName === f.name
                                    ? 'bg-white/55 border-white/55 text-gray-900 dark:bg-white/14 dark:border-white/15 dark:text-white'
                                    : 'bg-white/30 border-white/35 text-gray-700 hover:bg-white/45 dark:bg-white/8 dark:border-white/10 dark:text-white/80 dark:hover:bg-white/10')
                                }
                                title={f.name}
                              >
                                {mode === 'code' ? fileBasename(f.name) : f.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Viewer */}
                <div className="min-h-0 p-4 flex flex-col">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">Code</div>
                      <div className="text-xs text-gray-600 dark:text-white/70 truncate">
                        {selectedFile ? selectedFile.name : 'Select a file'}
                      </div>

                      {mode === 'code' && importError && (
                        <div className="mt-2 flex items-start justify-between gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-200">
                          <div className="min-w-0">{importError}</div>
                          <button
                            type="button"
                            className="shrink-0 opacity-80 hover:opacity-100"
                            onClick={() => setImportError(null)}
                            title="Fermer"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      )}

                      {mode === 'code' && openFileNames.length > 0 && (
                        <div className="mt-2 flex items-center gap-1 overflow-x-auto native-scrollbar">
                          {openFileNames.map((name) => {
                            const active = selectedFileName === name;
                            return (
                              <button
                                key={name}
                                type="button"
                                onClick={() => setSelectedFileName(name)}
                                className={
                                  'flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs transition-colors ' +
                                  (active
                                    ? 'bg-white/55 border-white/55 text-gray-900 dark:bg-white/14 dark:border-white/15 dark:text-white'
                                    : 'bg-white/30 border-white/35 text-gray-700 hover:bg-white/45 dark:bg-white/8 dark:border-white/10 dark:text-white/80 dark:hover:bg-white/10')
                                }
                                title={name}
                              >
                                <span className="max-w-[14rem] truncate">{fileBasename(name)}</span>
                                <span
                                  role="button"
                                  className="opacity-70 hover:opacity-100"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    closeTab(name);
                                  }}
                                  title="Close"
                                >
                                  <X size={14} />
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="relative" data-actions-root="true">
                      <button
                        type="button"
                        onClick={() => setActionsOpen((v) => !v)}
                        className="h-10 w-10 inline-flex items-center justify-center rounded-xl border border-white/45 bg-white/35 text-gray-900 hover:bg-white/45 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-white/10 dark:text-white dark:border-white/12 dark:hover:bg-white/12"
                        title="Actions"
                        aria-haspopup="menu"
                        aria-expanded={actionsOpen}
                        disabled={files.length === 0 && !selectedFile}
                      >
                        <MoreVertical size={18} />
                      </button>

                      {actionsOpen && (
                        <div
                          role="menu"
                          className="absolute right-0 mt-2 w-56 rounded-2xl border border-black/5 dark:border-white/12 bg-white/85 dark:bg-slate-900/75 text-gray-900 dark:text-white/90 backdrop-blur-md shadow-2xl overflow-hidden"
                        >
                          <button
                            type="button"
                            role="menuitem"
                            onClick={handleExportToFolder}
                            disabled={files.length === 0 || exporting || zipping}
                            className="w-full text-left px-4 py-2.5 text-sm text-gray-900 dark:text-white/90 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Export to folder…
                          </button>

                          <button
                            type="button"
                            role="menuitem"
                            onClick={handleDownloadZip}
                            disabled={files.length === 0 || zipping || exporting}
                            className="w-full text-left px-4 py-2.5 text-sm text-gray-900 dark:text-white/90 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Download as ZIP (single file)"
                          >
                            ZIP
                          </button>

                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setActionsOpen(false);
                              void handleDownloadAll();
                            }}
                            disabled={files.length === 0}
                            className="w-full text-left px-4 py-2.5 text-sm text-gray-900 dark:text-white/90 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Download all
                          </button>

                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setActionsOpen(false);
                              handleDownloadSelected();
                            }}
                            disabled={!selectedFile}
                            className="w-full text-left px-4 py-2.5 text-sm text-gray-900 dark:text-white/90 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Download this file
                          </button>

                          <div className="h-px bg-black/10 dark:bg-white/10" />

                          <button
                            type="button"
                            role="menuitem"
                            onClick={async () => {
                              setActionsOpen(false);
                              await handleCopy();
                            }}
                            disabled={!selectedFile}
                            className="w-full text-left px-4 py-2.5 text-sm text-gray-900 dark:text-white/90 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {copied ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div
                    className="flex-1 min-h-0 flex flex-col"
                    onContextMenu={(e) => {
                      if (mode !== 'code') return;
                      e.preventDefault();
                      openCodeContextMenu({ x: e.clientX, y: e.clientY });
                    }}
                    title={mode === 'code' ? 'Right-click to import a file…' : undefined}
                  >
                    {selectedFile ? (
                      mode === 'code' ? (
                        <>
                          <div className="flex-1 min-h-0 overflow-auto native-scrollbar rounded-xl border border-black/10 dark:border-white/12 bg-white/25 dark:bg-white/5">
                            <SyntaxHighlighter
                              language={selectedFileLanguage}
                              style={isDark ? oneDark : oneLight}
                              showLineNumbers
                              wrapLongLines
                              customStyle={{
                                margin: 0,
                                padding: '14px 14px',
                                background: 'transparent',
                                fontSize: '13px',
                                lineHeight: '1.55',
                              }}
                              lineNumberStyle={{
                                minWidth: '2.5em',
                                paddingRight: '1em',
                                color: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(17,24,39,0.35)',
                              }}
                              codeTagProps={{
                                style: {
                                  fontFamily:
                                    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                                },
                              }}
                            >
                              {selectedFile.code}
                            </SyntaxHighlighter>
                          </div>

                          <div className="mt-2 flex items-center justify-between text-xs text-gray-600 dark:text-white/60">
                            <div className="flex items-center gap-3">
                              <span className="px-2 py-1 rounded-full border border-white/45 bg-white/30 dark:bg-white/10 dark:border-white/12">
                                {selectedFileLanguage ?? 'text'}
                              </span>
                              <span>{selectedFileLineCount} lines</span>
                            </div>
                            <div className="truncate">UTF-8</div>
                          </div>
                        </>
                      ) : (
                        <div className="flex-1 min-h-0 overflow-auto native-scrollbar pr-1">
                          <div className="prose prose-sm max-w-none dark:prose-invert prose-pre:my-0">
                            <MessageContent content={'```\n' + selectedFile.code + '\n```'} />
                          </div>
                        </div>
                      )
                    ) : (
                      <div className="flex-1 min-h-0 flex items-center justify-center text-sm text-gray-600 dark:text-white/60">
                        Right-click to add a document.
                      </div>
                    )}
                  </div>

                  {mode === 'code' && (
                    <input
                      ref={fileUploadRef}
                      type="file"
                      className="hidden"
                      accept="text/*,.txt,.md,.markdown,.js,.jsx,.ts,.tsx,.json,.yml,.yaml,.toml,.xml,.html,.css,.scss,.sass,.py,.lua,.go,.rs,.java,.c,.cpp,.h,.cs,.php,.rb,.sh,.bat,.ps1,.sql,.env,.ini,.cfg,.gitignore"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        // Reset so selecting the same file twice triggers change.
                        e.target.value = '';
                        if (!f) return;
                        void handleUploadFile(f).catch((err) => {
                          console.error('Import failed:', err);
                          setImportError(err instanceof Error ? err.message : String(err));
                        });
                      }}
                    />
                  )}

                  {mode === 'code' && codeContextMenu && (
                    contextMenuPortalTarget &&
                    createPortal(
                      <div
                        data-code-context-root="true"
                        className="fixed z-[9999]"
                        style={{ left: codeContextMenu.x, top: codeContextMenu.y }}
                        role="menu"
                      >
                        <div className="w-60 rounded-2xl border border-black/5 dark:border-white/12 bg-white/85 dark:bg-slate-900/75 text-gray-900 dark:text-white/90 backdrop-blur-md shadow-2xl overflow-hidden">
                          <button
                            type="button"
                            role="menuitem"
                            className="w-full text-left px-4 py-2.5 text-sm text-gray-900 dark:text-white/90 hover:bg-black/5 dark:hover:bg-white/10"
                            onClick={() => {
                              setCodeContextMenu(null);
                              fileUploadRef.current?.click();
                            }}
                          >
                            Import a file…
                          </button>
                        </div>
                      </div>,
                      contextMenuPortalTarget
                    )
                  )}
                </div>

                {mode === 'code' && fileContextMenu &&
                  contextMenuPortalTarget &&
                  createPortal(
                    <div
                      data-file-context-root="true"
                      className="fixed z-[9999]"
                      style={{ left: fileContextMenu.x, top: fileContextMenu.y }}
                      role="menu"
                    >
                      <div className="w-56 rounded-2xl border border-black/5 dark:border-white/12 bg-white/85 dark:bg-slate-900/75 text-gray-900 dark:text-white/90 backdrop-blur-md shadow-2xl overflow-hidden">
                        <button
                          type="button"
                          role="menuitem"
                          className="w-full text-left px-4 py-2.5 text-sm text-red-600 dark:text-red-300 hover:bg-black/5 dark:hover:bg-white/10"
                          onClick={() => {
                            const name = fileContextMenu.name;
                            setFileContextMenu(null);
                            deleteFileByName(name);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>,
                    contextMenuPortalTarget
                  )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
