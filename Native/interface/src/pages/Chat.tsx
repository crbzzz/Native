import { useEffect, useMemo, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import {
  getConversations,
  deleteConversation,
  updateConversationTitle,
} from '../lib/conversations';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import ChatInput from '../components/ChatInput';
import Footer from '../components/Footer';
import { ChatApiError, sendChat, sendChatPersisted, type ChatMessage } from '../lib/nativeChat';
import MessageContent from '../components/MessageContent';
import { sanitizeAssistantText } from '../lib/sanitizeAssistantText';
import { getMessages } from '../lib/messages';
import { getSfxEnabled } from '../lib/sfx';
import { getCurrentUser } from '../lib/auth';
import { getAccessToken } from '../lib/auth';

// Son joué quand la réponse de l'IA est terminée
// (le fichier est dans interface/sounds)
import botDoneSoundUrl from '../../sounds/kill.mp3';
import sendSoundUrl from '../../sounds/send.mp3';

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface ChatProps {
  user: any;
  onBackHome: () => void;
  onAppClick: () => void;
  onPlans: () => void;
  onOpenStudioProject: (conversationId: string) => void;
  onRequireAuth: () => void;
}

type AttachmentMeta = { name: string; type: string; size: number };

type UiMessage = ChatMessage & {
  id?: string;
  created_at?: string;
  attachments?: AttachmentMeta[];
};

async function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === 'undefined') return;
  const el = document.createElement('textarea');
  el.value = text;
  el.setAttribute('readonly', 'true');
  el.style.position = 'fixed';
  el.style.left = '-9999px';
  document.body.appendChild(el);
  el.select();
  try {
    document.execCommand('copy');
  } finally {
    document.body.removeChild(el);
  }
}

function formatTwoWordTitle(raw: string): string {
  const cleaned = raw
    .replace(/[\r\n]+/g, ' ')
    .replace(/[`"'\[\]{}()]/g, '')
    .replace(/[,:;.!?]+/g, ' ')
    .trim();

  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'New Conversation';
  return parts.slice(0, 2).join(' ');
}

async function generateConversationTitle(seed: { user: string; assistant: string }): Promise<string> {
  const prompt =
    'Résume la discussion en 2 mots maximum. ' +
    'Réponds uniquement avec ces 2 mots (pas de ponctuation, pas de phrase).\n\n' +
    `USER: ${seed.user}\nASSISTANT: ${seed.assistant}`;

  const raw = await sendChat([{ role: 'user', content: prompt }], { persist: false });
  return formatTwoWordTitle(raw);
}

const CODE_STUDIO_PREFIX = '[Code Studio] ';

function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(window.matchMedia?.('(max-width: 640px)')?.matches);
  } catch (_) {
    return false;
  }
}

function readBoolFromStorage(key: string): boolean | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return undefined;
    const v = raw.trim().toLowerCase();
    if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
    if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
    return undefined;
  } catch (_) {
    return undefined;
  }
}

export default function Chat({ user, onBackHome, onAppClick, onPlans, onOpenStudioProject, onRequireAuth }: ChatProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectionNonce, setSelectionNonce] = useState(0);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [messagesLoadError, setMessagesLoadError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [deepSearch, setDeepSearch] = useState<boolean>(() => {
    const saved = readBoolFromStorage('native:chat:deepSearch');
    if (typeof saved === 'boolean') return saved;
    return isMobileViewport();
  });
  const [reason, setReason] = useState<boolean>(() => {
    const saved = readBoolFromStorage('native:chat:reason');
    if (typeof saved === 'boolean') return saved;
    return isMobileViewport();
  });
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [authRequired, setAuthRequired] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [inputDrop, setInputDrop] = useState(false);
  const inputDropTimerRef = useRef<number | null>(null);

  const [showTopFade, setShowTopFade] = useState(false);
  const [showBottomFade, setShowBottomFade] = useState(false);
  const fadeStateRef = useRef({ top: false, bottom: false });
  const fadeRafRef = useRef<number | null>(null);

  const typingTimerRef = useRef<number | null>(null);
  const sendingWatchdogRef = useRef<number | null>(null);
  const skipNextLoadMessagesRef = useRef(false);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) {
        window.clearInterval(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      if (sendingWatchdogRef.current) {
        window.clearTimeout(sendingWatchdogRef.current);
        sendingWatchdogRef.current = null;
      }
      if (inputDropTimerRef.current) {
        window.clearTimeout(inputDropTimerRef.current);
        inputDropTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem('native:chat:deepSearch', deepSearch ? '1' : '0');
    } catch (_) {
      // ignore
    }
  }, [deepSearch]);

  useEffect(() => {
    try {
      window.localStorage.setItem('native:chat:reason', reason ? '1' : '0');
    } catch (_) {
      // ignore
    }
  }, [reason]);

  // On iPhone-sized layouts, the Reason toggle is hidden; ensure Reason is disabled.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let mql: MediaQueryList | null = null;
    try {
      mql = window.matchMedia?.('(max-width: 640px)') ?? null;
    } catch (_) {
      mql = null;
    }

    const sync = () => {
      if (mql?.matches) setReason(false);
    };

    sync();

    if (!mql) return;
    const anyMql = mql as any;
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', sync);
      return () => mql?.removeEventListener('change', sync);
    }
    if (typeof anyMql.addListener === 'function') {
      anyMql.addListener(sync);
      return () => anyMql.removeListener(sync);
    }
    return;
  }, []);

  const effectiveReason = isMobileViewport() ? false : reason;

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const body = document.body;
    const prevOverflow = body.style.overflow;
    if (sidebarOpen) body.style.overflow = 'hidden';
    return () => {
      body.style.overflow = prevOverflow;
    };
  }, [sidebarOpen]);

  useEffect(() => {
    loadConversations();
  }, [user]);

  const sidebarItems = useMemo(() => {
    return (conversations ?? []).map((c) => ({
      id: c.id,
      title: c.title,
      kind: c.title?.startsWith(CODE_STUDIO_PREFIX) ? ('studio' as const) : ('chat' as const),
    }));
  }, [conversations]);

  useEffect(() => {
    if (user && authRequired) setAuthRequired(false);
  }, [user, authRequired]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  // Charge les messages lorsqu'on sélectionne une conversation
  useEffect(() => {
    const run = async () => {
      if (!selectedId) {
        setMessages([]);
        setMessagesLoadError(null);
        return;
      }

      if (skipNextLoadMessagesRef.current) {
        skipNextLoadMessagesRef.current = false;
        return;
      }

      try {
        setLoadingMessages(true);
        setMessagesLoadError(null);
        const rows = await getMessages(selectedId);
        setMessages(
          rows.map((r) => ({
            id: r.id,
            created_at: r.created_at,
            role: r.role,
            content: r.content,
            attachments: (r as any).attachments ?? undefined,
          }))
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const normalized = String(msg || '').toLowerCase();
        if (normalized.includes('auth_required') || normalized.includes('invalid_auth') || normalized.includes('401')) {
          setAuthRequired(true);
          onRequireAuth();
        }
        setMessagesLoadError(msg || 'Impossible de charger les messages');
        setMessages([]);
      } finally {
        setLoadingMessages(false);
        requestAnimationFrame(() => {
          bottomRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
        });
      }
    };
    run();
  }, [selectedId, selectionNonce]);

  const handleSelectConversation = (id: string) => {
    if (id === selectedId) {
      // React ignore setSelectedId(sameValue). On force un re-load des messages.
      setSelectionNonce((n) => n + 1);
      return;
    }
    setSelectedId(id);
  };

  // Scroll auto en bas quand les messages changent
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Effet "fade" en haut/bas quand le contenu dépasse (disparaît/réapparaît en scrollant)
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const compute = () => {
      const max = Math.max(0, el.scrollHeight - el.clientHeight);
      const top = el.scrollTop;
      const nextTop = top > 6;
      const nextBottom = max - top > 6;

      const prev = fadeStateRef.current;
      if (prev.top !== nextTop) {
        prev.top = nextTop;
        setShowTopFade(nextTop);
      }
      if (prev.bottom !== nextBottom) {
        prev.bottom = nextBottom;
        setShowBottomFade(nextBottom);
      }
    };

    const schedule = () => {
      if (fadeRafRef.current != null) return;
      fadeRafRef.current = window.requestAnimationFrame(() => {
        fadeRafRef.current = null;
        compute();
      });
    };

    // initial
    schedule();

    el.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });

    return () => {
      el.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (fadeRafRef.current != null) {
        window.cancelAnimationFrame(fadeRafRef.current);
        fadeRafRef.current = null;
      }
    };
  }, [selectedId, messages.length, loadingMessages]);


  const loadConversations = async () => {
    try {
      const data = await getConversations();
      setConversations(data);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  };

  const handleNewChat = async () => {
    // Création lazy: la conversation est créée en DB au 1er message.
    setSelectedId(null);
    setMessages([]);
    setPendingFiles([]);
    setMessagesLoadError(null);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteConversation(id);
      setConversations(conversations.filter(c => c.id !== id));
      if (selectedId === id) setSelectedId(null);
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  };

  const playBotDoneSound = () => {
    if (!getSfxEnabled()) return;
    try {
      const audio = new Audio(botDoneSoundUrl);
      audio.volume = 0.6;
      void audio.play();
    } catch (_) {
      // Ignore (autoplay policy)
    }
  };

  const playSendSound = () => {
    if (!getSfxEnabled()) return;
    try {
      const audio = new Audio(sendSoundUrl);
      audio.volume = 0.55;
      void audio.play();
    } catch (_) {
      // Ignore (autoplay policy)
    }
  };

  const isEmpty = messages.length === 0;
  const hasSelectedConversation = Boolean(selectedId);
  const showThread = !isEmpty || loadingMessages;
  const emptyTitle = hasSelectedConversation ? 'Conversation vide' : 'What can Native AI help with?';

  const scrollerFadeStyle = useMemo(() => {
    const fadePx = 44;
    const topOn = showTopFade;
    const bottomOn = showBottomFade;

    let gradient: string;
    if (topOn && bottomOn) {
      gradient = `linear-gradient(to bottom, rgba(0,0,0,0) 0px, rgba(0,0,0,1) ${fadePx}px, rgba(0,0,0,1) calc(100% - ${fadePx}px), rgba(0,0,0,0) 100%)`;
    } else if (topOn) {
      gradient = `linear-gradient(to bottom, rgba(0,0,0,0) 0px, rgba(0,0,0,1) ${fadePx}px, rgba(0,0,0,1) 100%)`;
    } else if (bottomOn) {
      gradient = `linear-gradient(to bottom, rgba(0,0,0,1) 0px, rgba(0,0,0,1) calc(100% - ${fadePx}px), rgba(0,0,0,0) 100%)`;
    } else {
      gradient = 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 100%)';
    }

    return {
      WebkitMaskImage: gradient,
      maskImage: gradient,
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
      WebkitMaskSize: '100% 100%',
      maskSize: '100% 100%',
    } as React.CSSProperties;
  }, [showTopFade, showBottomFade]);

  const clearTypingTimer = () => {
    if (typingTimerRef.current) {
      window.clearInterval(typingTimerRef.current);
      typingTimerRef.current = null;
    }
  };

  const animateAssistantTyping = async (
    fullText: string,
    onDone: () => Promise<void> | void
  ): Promise<void> => {
    clearTypingTimer();

    const text = fullText;
    const chunkSize = 3;
    const intervalMs = 18;
    let i = 0;

    typingTimerRef.current = window.setInterval(() => {
      i = Math.min(text.length, i + chunkSize);

      setMessages((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        if (last.role !== 'assistant') return prev;
        const next = [...prev];
        next[next.length - 1] = { ...last, content: text.slice(0, i) };
        return next;
      });

      if (i >= text.length) {
        clearTypingTimer();
        Promise.resolve()
          .then(() => onDone())
          .catch(() => {
            if (sendingWatchdogRef.current) {
              window.clearTimeout(sendingWatchdogRef.current);
              sendingWatchdogRef.current = null;
            }
            setThinking(false);
            setSending(false);
          });
      }
    }, intervalMs);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    // Micro animation: l'input "descend" au moment de l'envoi.
    setInputDrop(true);
    if (inputDropTimerRef.current) window.clearTimeout(inputDropTimerRef.current);
    inputDropTimerRef.current = window.setTimeout(() => {
      setInputDrop(false);
      inputDropTimerRef.current = null;
    }, 220);

    // Si l'état React n'est pas encore à jour, on re-check côté Supabase.
    const token = await getAccessToken();
    if (!token) {
      setAuthRequired(true);
      onRequireAuth();
      return;
    }

    if (!user) {
      // best-effort: éviter un état "connecté" sans user côté React
      await getCurrentUser().catch(() => null);
    }

    playSendSound();

    clearTypingTimer();

    const filesToSend = pendingFiles;
    const attachments: AttachmentMeta[] = filesToSend.map((f) => ({
      name: f.name,
      type: f.type,
      size: f.size,
    }));

    setInput('');
    setSending(true);
    setThinking(true);
    setPendingFiles([]);

    if (sendingWatchdogRef.current) {
      window.clearTimeout(sendingWatchdogRef.current);
      sendingWatchdogRef.current = null;
    }
    // Safety: never allow "sending" to stay true forever.
    sendingWatchdogRef.current = window.setTimeout(() => {
      setThinking(false);
      setSending(false);
      sendingWatchdogRef.current = null;
    }, 65000);

    const hadNoMessages = messages.length === 0;
    const currentConversationTitle = selectedId
      ? conversations.find((c) => c.id === selectedId)?.title
      : undefined;

    const conversationId = selectedId;

    setMessages((prev) => [...prev, { role: 'user', content: text, attachments }]);

    const nextHistory: ChatMessage[] = [...messages.map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: text }];

    try {
      const resp = await sendChatPersisted(nextHistory, {
        conversationId: conversationId ?? undefined,
        conversationTitle: 'New Conversation',
        attachments,
        deepSearch,
        reason: effectiveReason,
        files: filesToSend,
      });
      const reply = sanitizeAssistantText(resp.reply);

      const resolvedConversationId = conversationId ?? resp.conversationId ?? null;

      // Si c'est une nouvelle conversation, on l'ajoute à la liste et on la sélectionne.
      if (!selectedId && resp.conversationId) {
        skipNextLoadMessagesRef.current = true;
        setSelectedId(resp.conversationId);
        if (resp.conversation && typeof resp.conversation === 'object') {
          setConversations((prev) => [resp.conversation as any, ...prev]);
        } else {
          setConversations((prev) => [{ id: resp.conversationId, title: 'New Conversation' } as any, ...prev]);
        }
      }

      setThinking(false);

      // Ajoute un message assistant vide puis le remplit petit à petit
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

      const shouldAutoTitle = Boolean(resolvedConversationId) && hadNoMessages && (!currentConversationTitle || currentConversationTitle === 'New Conversation');

      await animateAssistantTyping(reply, async () => {
        playBotDoneSound();

        // La persistance user+assistant est faite côté backend.

        if (resolvedConversationId && shouldAutoTitle) {
          try {
            const title = await generateConversationTitle({ user: text, assistant: reply });
            const updated = await updateConversationTitle(resolvedConversationId, title);
            setConversations((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
          } catch (_) {
            // ignore
          }
        }

        if (sendingWatchdogRef.current) {
          window.clearTimeout(sendingWatchdogRef.current);
          sendingWatchdogRef.current = null;
        }
        setSending(false);
      });
    } catch (err) {
      const isTokenLimit =
        err instanceof ChatApiError
          ? err.status === 402 || String(err.code || '').toLowerCase() === 'token_limit_reached'
          : String((err as any)?.message || '').toLowerCase().includes('token_limit');

      if (isTokenLimit) {
        setThinking(false);
        setSending(false);
        if (sendingWatchdogRef.current) {
          window.clearTimeout(sendingWatchdogRef.current);
          sendingWatchdogRef.current = null;
        }
        setToast('Token limit reached — choose a plan to get more tokens.');
        onPlans();
        return;
      }

      const msg = err instanceof Error ? err.message : 'Failed to contact server';

      const normalized = String(msg || '').toLowerCase();
      if (normalized.includes('auth_required') || normalized.includes('invalid_auth') || normalized.includes('401')) {
        // Annule l'envoi et demande la connexion, sans polluer le chat.
        setAuthRequired(true);
        onRequireAuth();
        setMessages((prev) => prev); // no-op
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: msg }]);
      }
      setThinking(false);
      setSending(false);
      if (sendingWatchdogRef.current) {
        window.clearTimeout(sendingWatchdogRef.current);
        sendingWatchdogRef.current = null;
      }
    } finally {
      // sending est remis à false après l'animation (ou dans le catch)
    }
  };

  const handleCopyAssistantMessage = async (idx: number) => {
    const m = messages[idx];
    if (!m || m.role !== 'assistant') return;
    try {
      await copyToClipboard(m.content || '');
      setToast('Réponse copiée');
    } catch (_) {
      setToast('Impossible de copier');
    }
  };

  const handleRegenerateLastAssistant = async (idx: number) => {
    if (sending) return;
    if (idx !== messages.length - 1) return;
    const m = messages[idx];
    const prev = messages[idx - 1];
    if (!m || m.role !== 'assistant') return;
    if (!prev || prev.role !== 'user') return;
    if (!selectedId) {
      // Sans conversation persistée on évite d'essayer une regénération incohérente.
      setToast('Impossible de régénérer ici');
      return;
    }

    // Auth obligatoire.
    const token = await getAccessToken();
    if (!token) {
      setAuthRequired(true);
      onRequireAuth();
      return;
    }

    clearTypingTimer();
    setSending(true);
    setThinking(true);

    // On vide le dernier message assistant et on anime dessus.
    setMessages((prevMsgs) => {
      const next = [...prevMsgs];
      const last = next[next.length - 1];
      if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: '' };
      return next;
    });

    const history: ChatMessage[] = messages.slice(0, idx).map((x) => ({ role: x.role, content: x.content }));

    try {
      const resp = await sendChatPersisted(history, {
        conversationId: selectedId,
        conversationTitle: 'New Conversation',
        attachments: [],
        deepSearch,
        reason: effectiveReason,
        files: [],
      });
      const reply = sanitizeAssistantText(resp.reply);
      setThinking(false);

      await animateAssistantTyping(reply, async () => {
        playBotDoneSound();
        if (sendingWatchdogRef.current) {
          window.clearTimeout(sendingWatchdogRef.current);
          sendingWatchdogRef.current = null;
        }
        setSending(false);
      });
    } catch (err) {
      const isTokenLimit =
        err instanceof ChatApiError
          ? err.status === 402 || String(err.code || '').toLowerCase() === 'token_limit_reached'
          : String((err as any)?.message || '').toLowerCase().includes('token_limit');

      if (isTokenLimit) {
        setThinking(false);
        setSending(false);
        setToast('Token limit reached — choose a plan to get more tokens.');
        onPlans();
        return;
      }

      const msg = err instanceof Error ? err.message : 'Failed to contact server';
      setThinking(false);
      setSending(false);
      setToast('Erreur régénération');
      // On remet le texte d'erreur dans le message assistant.
      setMessages((prevMsgs) => {
        const next = [...prevMsgs];
        const last = next[next.length - 1];
        if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: msg };
        return next;
      });
    }
  };

  return (
    <div className="min-h-screen native-animated-bg">
      <button
        type="button"
        onClick={() => setSidebarOpen((v) => !v)}
        className={
          'fixed top-4 left-4 z-[70] w-10 h-10 flex items-center justify-center bg-white/30 text-gray-900 dark:text-gray-100 border border-white/40 dark:border-white/15 rounded-full hover:bg-white/40 transition-colors backdrop-blur-md transition-opacity duration-200 ' +
          (settingsOpen || sidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100')
        }
        title="Menu"
      >
        <MoreHorizontal size={20} />
      </button>

      {authRequired && (
        <div className="fixed left-1/2 top-6 -translate-x-1/2 z-[60] rounded-2xl border border-white/45 bg-white/35 backdrop-blur-md px-4 py-2 text-sm text-gray-900 dark:text-white dark:bg-white/10">
          Connexion requise pour envoyer un message.
        </div>
      )}

      {messagesLoadError && (
        <div className="fixed left-1/2 top-[4.5rem] -translate-x-1/2 z-[60] max-w-[92vw] rounded-2xl border border-white/45 bg-white/35 backdrop-blur-md px-4 py-2 text-sm text-gray-900 dark:text-white dark:bg-white/10">
          Impossible de charger l'historique: {messagesLoadError}
        </div>
      )}

      {toast && (
        <div className="fixed left-1/2 top-[6.8rem] -translate-x-1/2 z-[60] rounded-2xl border border-white/45 bg-white/35 backdrop-blur-md px-4 py-2 text-sm text-gray-900 dark:text-white dark:bg-white/10 native-toast-in">
          {toast}
        </div>
      )}

      <Sidebar
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
        onNewChat={handleNewChat}
        onApps={onAppClick}
        onHome={onBackHome}
        conversations={sidebarItems}
        selectedId={selectedId}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={handleDelete}
        onOpenStudioProject={onOpenStudioProject}
      />
      <Header onHome={onBackHome} onSettingsOpenChange={setSettingsOpen} onGetStarted={onPlans} />

      <main
        className={
          'pt-16 h-screen flex flex-col px-6 md:px-8 native-page-in ' + (showThread ? 'pb-3' : 'pb-6')
        }
      >
        <div
          className={
            "flex-1 min-h-0 w-full max-w-5xl mx-auto flex flex-col transition-all duration-500 ease-in-out " +
            (!showThread ? 'justify-center gap-10' : 'gap-4')
          }
        >
          {!showThread && (
            <h1 className="text-4xl font-normal text-gray-900 dark:text-white text-center">
              {emptyTitle}
            </h1>
          )}

          {showThread && (
            <div className="relative flex-1 min-h-0 w-full mt-8">
              <div
                ref={scrollerRef}
                className="native-scrollbar h-full w-full overflow-y-auto pr-1 scroll-smooth"
                style={scrollerFadeStyle}
              >
                <div className="space-y-4 pt-2 pb-24">
                  {messages.map((m, idx) => (
                    <div
                      key={m.id ?? idx}
                      className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
                    >
                      <div
                        className={
                          'max-w-[85%] flex flex-col group ' +
                          (m.role === 'user' ? 'items-end' : 'items-start')
                        }
                      >
                        <div
                          className={
                            'relative overflow-hidden rounded-2xl px-4 py-3 shadow-sm backdrop-blur-md backdrop-saturate-150 ' +
                            'transition-transform duration-200 will-change-transform native-message-in hover:shadow-md ' +
                            (m.role === 'user'
                              ? 'border border-white/55 bg-white/45 text-gray-900 dark:text-white dark:bg-blue-500/18 dark:bg-gradient-to-br dark:from-blue-500/34 dark:to-indigo-800/12 dark:border-blue-200/18 hover:-translate-y-[1px] ' +
                                "before:content-[''] before:absolute before:inset-0 before:pointer-events-none before:rounded-[inherit] before:bg-gradient-to-br before:from-white/35 before:to-transparent before:opacity-70 dark:before:from-blue-200/26 dark:before:opacity-95 " +
                                "after:content-[''] after:absolute after:inset-0 after:pointer-events-none after:rounded-[inherit] after:ring-1 after:ring-white/25 dark:after:ring-blue-200/20"
                              : 'border border-white/40 bg-white/30 text-gray-900 dark:text-white dark:bg-white/10 dark:border-white/12 hover:-translate-y-[1px]')
                          }
                        >
                          <div className="prose prose-sm max-w-none dark:prose-invert prose-pre:my-0 prose-p:my-2">
                            <MessageContent content={m.content} />
                          </div>

                          {m.role === 'user' && m.attachments && m.attachments.length > 0 && (
                            <div className="mt-2 text-xs text-gray-700 dark:text-white/70">Fichier uploadé</div>
                          )}
                        </div>

                        {m.role === 'assistant' && (
                          <div className="mt-1.5 self-end flex items-center gap-3 text-[11px] tracking-wide opacity-0 pointer-events-none translate-y-0.5 transition-all duration-200 group-hover:opacity-100 group-hover:pointer-events-auto group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 motion-reduce:transition-none">
                            <button
                              type="button"
                              className="native-action-link"
                              onClick={() => void handleCopyAssistantMessage(idx)}
                              title="Copier"
                            >
                              Copier
                            </button>

                            <span className="text-gray-400/80 dark:text-white/25 select-none">·</span>

                            <button
                              type="button"
                              disabled={
                                sending ||
                                idx !== messages.length - 1 ||
                                messages[idx - 1]?.role !== 'user'
                              }
                              className="native-action-link disabled:opacity-40 disabled:cursor-not-allowed"
                              onClick={() => void handleRegenerateLastAssistant(idx)}
                              title="Régénérer"
                            >
                              Régénérer
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {((thinking && sending) || loadingMessages) && (
                    <div className="flex justify-start">
                      <div className="max-w-[85%] rounded-2xl px-4 py-3 shadow-sm border border-white/40 bg-white/30 text-gray-700 dark:text-white/80 dark:bg-white/10 dark:border-white/12 backdrop-blur-md backdrop-saturate-150">
                        <span className="native-thinking">Thinking…</span>
                      </div>
                    </div>
                  )}

                  <div ref={bottomRef} />
                </div>
              </div>
            </div>
          )}

          <div
            className={
              'transition-all duration-300 ease-out transform-gpu ' +
              (inputDrop ? 'translate-y-2 opacity-[0.98]' : 'translate-y-0 opacity-100')
            }
          >
            <ChatInput
              value={input}
              onChange={setInput}
              onSend={handleSend}
              disabled={sending}
              deepSearch={deepSearch}
              reason={effectiveReason}
              onDeepSearchChange={setDeepSearch}
              onReasonChange={(v) => {
                if (isMobileViewport()) return;
                setReason(v);
              }}
              onFilesSelected={setPendingFiles}
            />
          </div>
        </div>

        {!showThread && (
          <div className="fixed left-0 right-0 bottom-4 z-[40] pointer-events-none">
            <Footer />
          </div>
        )}
      </main>
    </div>
  );
}
