import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createConversation,
  getConversations,
  deleteConversation,
  updateConversationTitle,
} from '../lib/conversations';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import ChatInput from '../components/ChatInput';
import Footer from '../components/Footer';
import { sendChat, type ChatMessage } from '../lib/nativeChat';
import MessageContent from '../components/MessageContent';
import { sanitizeAssistantText } from '../lib/sanitizeAssistantText';
import { addMessage, getMessages, type MessageRole } from '../lib/messages';
import { getSfxEnabled } from '../lib/sfx';

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
  onBackHome: () => void;
  onAppClick: () => void;
}

type AttachmentMeta = { name: string; type: string; size: number };

type UiMessage = ChatMessage & {
  attachments?: AttachmentMeta[];
};

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

  const raw = await sendChat([{ role: 'user', content: prompt }]);
  return formatTwoWordTitle(raw);
}

export default function Chat({ onBackHome, onAppClick }: ChatProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [deepSearch, setDeepSearch] = useState(false);
  const [reason, setReason] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const [showTopFade, setShowTopFade] = useState(false);
  const [showBottomFade, setShowBottomFade] = useState(false);
  const fadeStateRef = useRef({ top: false, bottom: false });
  const fadeRafRef = useRef<number | null>(null);

  const typingTimerRef = useRef<number | null>(null);
  const sendingWatchdogRef = useRef<number | null>(null);

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
    };
  }, []);

  useEffect(() => {
    loadConversations();
  }, []);

  // Charge les messages lorsqu'on sélectionne une conversation
  useEffect(() => {
    const run = async () => {
      if (!selectedId) {
        setMessages([]);
        return;
      }

      try {
        setLoadingMessages(true);
        const rows = await getMessages(selectedId);
        setMessages(
          rows.map((r) => ({
            role: r.role,
            content: r.content,
            attachments: (r as any).attachments ?? undefined,
          }))
        );
      } catch (e) {
        // Si la table messages n'existe pas encore, on n'empêche pas l'app de tourner.
        setMessages([]);
      } finally {
        setLoadingMessages(false);
        requestAnimationFrame(() => {
          bottomRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
        });
      }
    };
    run();
  }, [selectedId]);

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
    try {
      const newConversation = await createConversation('New Conversation');
      setConversations([newConversation, ...conversations]);
      setSelectedId(newConversation.id);
      setPendingFiles([]);
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
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
        void onDone();
      }
    }, intervalMs);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

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

    let conversationId = selectedId;
    let createdConversationWasNew = false;
    if (!conversationId) {
      try {
        const newConversation = await createConversation('New Conversation');
        setConversations((prev) => [newConversation, ...prev]);
        setSelectedId(newConversation.id);
        conversationId = newConversation.id;
        createdConversationWasNew = true;
      } catch (e) {
        // Si on ne peut pas créer la conversation (pas connecté), on continue en mode non persisté.
      }
    }

    setMessages((prev) => [...prev, { role: 'user', content: text, attachments }]);

    const nextHistory: ChatMessage[] = [...messages.map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: text }];

    if (conversationId) {
      try {
        await addMessage(conversationId, 'user' satisfies MessageRole, text, attachments);
      } catch (_) {
        // ignore si DB pas prête
      }
    }

    try {
      const rawReply = await sendChat(nextHistory, {
        deepSearch,
        reason,
        files: filesToSend,
      });
      const reply = sanitizeAssistantText(rawReply);

      setThinking(false);

      // Ajoute un message assistant vide puis le remplit petit à petit
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

      const shouldAutoTitle = Boolean(conversationId) && hadNoMessages && (createdConversationWasNew || currentConversationTitle === 'New Conversation');

      await animateAssistantTyping(reply, async () => {
        playBotDoneSound();

        if (conversationId) {
          try {
            await addMessage(conversationId, 'assistant' satisfies MessageRole, reply);
          } catch (_) {
            // ignore si DB pas prête
          }
        }

        if (conversationId && shouldAutoTitle) {
          try {
            const title = await generateConversationTitle({ user: text, assistant: reply });
            const updated = await updateConversationTitle(conversationId, title);
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
      const msg = err instanceof Error ? err.message : 'Failed to contact server';
      setMessages((prev) => [...prev, { role: 'assistant', content: msg }]);
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

  return (
    <div className="min-h-screen bg-transparent">
      <Sidebar
        onNewChat={handleNewChat}
        onApps={onAppClick}
        onHome={onBackHome}
        conversations={conversations}
        selectedId={selectedId}
        onSelectConversation={setSelectedId}
        onDeleteConversation={handleDelete}
      />
      <Header onHome={onBackHome} />

      <main className="ml-20 pt-16 h-screen flex flex-col p-6 md:p-8">
        <div
          className={
            "flex-1 min-h-0 w-full max-w-5xl mx-auto flex flex-col transition-all duration-500 ease-in-out " +
            (isEmpty ? 'justify-center gap-10' : 'gap-4')
          }
        >
          {/* Header central (état vide) */}
          {isEmpty && (
            <h1 className="text-4xl font-normal text-gray-900 dark:text-white text-center">
              What can I help with?
            </h1>
          )}

          {/* Messages (sans box de fond: même fond que la page) */}
          {!isEmpty && (
            <div className="relative flex-1 min-h-0 w-full mt-8">
              <div
                ref={scrollerRef}
                className="native-scrollbar h-full w-full overflow-y-auto pr-1 scroll-smooth"
                style={scrollerFadeStyle}
              >
                <div className="space-y-4 pt-2 pb-24">
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
                          <MessageContent content={m.content} />
                        </div>

                        {m.role === 'user' && m.attachments && m.attachments.length > 0 && (
                          <div className="mt-2 text-xs text-gray-700 dark:text-white/70">Fichier uploadé</div>
                        )}
                      </div>
                    </div>
                  ))}

                  {((thinking && sending) || loadingMessages) && (
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
          )}

          {/* Input */}
          <div className={"transition-all duration-500 ease-in-out " + (isEmpty ? '' : 'pb-1')}>
            <ChatInput
              value={input}
              onChange={setInput}
              onSend={handleSend}
              disabled={sending}
              deepSearch={deepSearch}
              reason={reason}
              onDeepSearchChange={setDeepSearch}
              onReasonChange={setReason}
              onFilesSelected={setPendingFiles}
            />
          </div>

          {/* Scroll buttons removed: we style the scrollbar itself instead */}
        </div>

        <div className="pb-4 pt-4">
          <Footer />
        </div>
      </main>
    </div>
  );
}
