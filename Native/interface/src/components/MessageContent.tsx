import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism';

type Props = {
  content: string;
};

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
            <div className="my-3 overflow-hidden rounded-xl border border-black/10 dark:border-white/12">
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
