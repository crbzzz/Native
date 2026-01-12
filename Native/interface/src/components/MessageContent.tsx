import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { useEffect, useRef, useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism';

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

type Props = {
  content: string;
};

function CodeBlock({
  language,
  codeString,
  isDark,
  ...rest
}: {
  language?: string;
  codeString: string;
  isDark: boolean;
  [key: string]: any;
}) {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) {
        window.clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }
    };
  }, []);

  const handleCopy = async () => {
    await copyToClipboard(codeString);
    setCopied(true);
    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-black/10 dark:border-white/12">
      <div className="flex items-center justify-between gap-2 px-3 py-2 text-[11px] border-b border-black/10 dark:border-white/12 bg-black/[0.03] dark:bg-white/[0.06]">
        <div className="text-gray-600 dark:text-white/70 font-medium">{language ? language.toUpperCase() : 'CODE'}</div>

        <button
          type="button"
          className={
            'px-2 py-1 rounded-md border border-black/10 dark:border-white/12 text-gray-700 dark:text-white/80 hover:bg-black/[0.04] dark:hover:bg-white/[0.08] transition-colors ' +
            (copied ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-700 dark:text-emerald-200' : '')
          }
          onClick={() => void handleCopy()}
          title="Copier le code"
        >
          {copied ? 'Copié !' : 'Copier'}
        </button>
      </div>
      <div className="max-h-[60vh] overflow-auto native-scrollbar">
        <SyntaxHighlighter
          language={language}
          style={isDark ? oneDark : oneLight}
          customStyle={{
            margin: 0,
            padding: '14px 14px',
            background: 'transparent',
          }}
          codeTagProps={{
            style: {
              fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            },
          }}
          {...rest}
        >
          {codeString}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}

export default function MessageContent({ content }: Props) {
  const isDark =
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        code(props: any) {
          const { inline, className, children, ...rest } = props;
          const match = /language-(\w+)/.exec(className || '');
          const language = match?.[1];
          const codeString = String(children).replace(/\n$/, '');

          if (inline) {
            return (
              <code
                className="px-1 py-0.5 rounded bg-black/5 dark:bg-white/10 dark:text-white font-mono text-[0.95em]"
                {...rest}
              >
                {children}
              </code>
            );
          }

          return (
            <CodeBlock language={language} codeString={codeString} isDark={isDark} {...rest} />
          );
        },
        a({ children, ...props }) {
          return (
            <a className="underline underline-offset-2" target="_blank" rel="noreferrer" {...props}>
              {children}
            </a>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
