import Markdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

const LANGUAGES = [
  "bash",
  "css",
  "diff",
  "dockerfile",
  "go",
  "ini",
  "java",
  "javascript",
  "json",
  "markdown",
  "python",
  "rust",
  "shell",
  "sql",
  "typescript",
  "xml",
  "yaml",
];

const COMPONENTS = {
  a: ({
    children,
    href,
  }: {
    children?: React.ReactNode | undefined;
    href?: string | undefined;
  }) => (
    <a href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  ),
};

export function RichText({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="ho-md">
      <Markdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[[rehypeHighlight, { detect: true, subset: LANGUAGES }]]}
        components={COMPONENTS}
      >
        {text}
      </Markdown>
    </div>
  );
}
