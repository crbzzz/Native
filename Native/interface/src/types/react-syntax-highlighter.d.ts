declare module 'react-syntax-highlighter' {
  import * as React from 'react';

  export const Prism: React.ComponentType<any>;
  export const Light: React.ComponentType<any>;
  const SyntaxHighlighter: React.ComponentType<any>;
  export default SyntaxHighlighter;
}

declare module 'react-syntax-highlighter/dist/cjs/styles/prism' {
  export const oneDark: any;
  export const oneLight: any;
}

declare module 'react-syntax-highlighter/dist/esm/styles/prism' {
  export const oneDark: any;
  export const oneLight: any;
}
