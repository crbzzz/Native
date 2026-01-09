import { useMemo, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import ChatInput from '../components/ChatInput';
import MessageContent from '../components/MessageContent';
import { sendChat, type ChatMessage } from '../lib/nativeChat';
import { sanitizeAssistantText } from '../lib/sanitizeAssistantText';

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
  frameworks: FrameworkOption[];
  defaultFrameworkId: string;
};

export default function FrameworkStudio({ title, onBack, frameworks, defaultFrameworkId }: Props) {
  const [frameworkId, setFrameworkId] = useState(defaultFrameworkId);
  const [messages, setMessages] = useState<StudioMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [thinking, setThinking] = useState(false);

  const [files, setFiles] = useState<GeneratedFile[]>([]);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fileAnimTokenRef = useRef(0);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const framework = useMemo(
    () => frameworks.find((f) => f.id === frameworkId) ?? frameworks[0],
    [frameworkId, frameworks]
  );

  const selectedFile = useMemo(
    () => files.find((f) => f.name === selectedFileName) ?? null,
    [files, selectedFileName]
  );

  const selectedFileMarkdown = useMemo(() => {
    if (!selectedFile) return '';
    const lang = guessLanguageFromFilename(selectedFile.name);
    const prefix = lang ? `\`\`\`${lang}` : '```';
    return `${prefix}\n${selectedFile.code}\n\`\`\``;
  }, [selectedFile]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    // Cancel any ongoing progressive file writing.
    fileAnimTokenRef.current += 1;

    const userApiPrefix =
      `Plateforme: ${title}\nFramework: ${framework.label}\n\n` +
      "Ta mission: produire des fichiers pour un resource (ex: fxmanifest + client/server + config).\n" +
      'Réponds STRICTEMENT en JSON valide, sans Markdown: ' +
      '{"message":"(court)","files":[{"path":"chemin/nom.ext","content":"contenu du fichier"}]}\n' +
      'Règles: files[].path obligatoire si tu crées un fichier. content = code brut.\n\n';

    const nextMessages: StudioMessage[] = [
      ...messages,
      { role: 'user', display: text, api: userApiPrefix + text },
    ];

    setMessages(nextMessages);
    setInput('');
    setSending(true);
    setThinking(true);

    try {
      const apiMessages: ChatMessage[] = nextMessages.map((m) => ({ role: m.role, content: m.api }));
      const raw = await sendChat(apiMessages);
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

  const handleCopy = async () => {
    if (!selectedFile) return;
    await copyToClipboard(selectedFile.code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 900);
  };

  return (
    <div className="min-h-screen bg-transparent">
      <div className="fixed top-0 left-0 right-0 h-16 bg-white/25 dark:bg-slate-950/35 border-b border-white/35 dark:border-white/10 backdrop-blur-md flex items-center gap-4 px-6 z-40">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-700 hover:text-gray-900 dark:text-white/70 dark:hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
          <span>Back</span>
        </button>

        <div className="flex items-center gap-3">
          <div className="text-sm text-gray-700 dark:text-white/70">Framework</div>
          <select
            value={frameworkId}
            onChange={(e) => setFrameworkId(e.target.value)}
            className="text-sm rounded-xl px-3 py-2 bg-white/35 dark:bg-white/10 border border-white/45 dark:border-white/12 text-gray-900 dark:text-white outline-none"
          >
            {frameworks.map((f) => (
              <option key={f.id} value={f.id} className="text-gray-900">
                {f.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1" />
      </div>

      <div className="pt-16 p-6 md:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-normal text-gray-900 dark:text-white">{title}</h1>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[calc(100vh-9rem)]">
            {/* Left: Chat */}
            <div className="flex flex-col min-h-0 rounded-2xl shadow-lg border border-white/45 dark:border-white/12 bg-white/35 dark:bg-white/10 backdrop-blur-md backdrop-saturate-150 overflow-hidden">
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

            {/* Right: Explorer + Code */}
            <div className="min-h-0 rounded-2xl shadow-lg border border-white/45 dark:border-white/12 bg-white/35 dark:bg-white/10 backdrop-blur-md backdrop-saturate-150 overflow-hidden">
              <div className="h-full grid grid-cols-1 md:grid-cols-3">
                {/* Explorer */}
                <div className="min-h-0 border-b md:border-b-0 md:border-r border-white/35 dark:border-white/10 p-4">
                  <div className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Fichiers</div>
                  {files.length === 0 ? (
                    <div />
                  ) : (
                    <div className="space-y-2">
                      {files.map((f) => (
                        <button
                          key={f.name}
                          onClick={() => setSelectedFileName(f.name)}
                          className={
                            'w-full text-left text-sm rounded-xl px-3 py-2 border transition-colors ' +
                            (selectedFileName === f.name
                              ? 'bg-white/55 border-white/55 text-gray-900 dark:bg-white/14 dark:border-white/15 dark:text-white'
                              : 'bg-white/30 border-white/35 text-gray-700 hover:bg-white/45 dark:bg-white/8 dark:border-white/10 dark:text-white/80 dark:hover:bg-white/10')
                          }
                        >
                          {f.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Viewer */}
                <div className="min-h-0 md:col-span-2 p-4 flex flex-col">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">Code</div>
                      <div className="text-xs text-gray-600 dark:text-white/70">
                        {selectedFile ? selectedFile.name : 'Sélectionne un fichier'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopy}
                      disabled={!selectedFile}
                      className="text-sm rounded-xl px-3 py-2 border border-white/45 bg-white/35 text-gray-900 hover:bg-white/45 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-white/10 dark:text-white dark:border-white/12 dark:hover:bg-white/12"
                    >
                      {copied ? 'Copié' : 'Copier'}
                    </button>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto native-scrollbar pr-1">
                    {selectedFile ? (
                      <div className="prose prose-sm max-w-none dark:prose-invert prose-pre:my-0">
                        <MessageContent content={selectedFileMarkdown} />
                      </div>
                    ) : (
                      <div />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
