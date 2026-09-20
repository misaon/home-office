import rehypeShikiFromHighlighter from "@shikijs/rehype/core";
import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

const THEME = "vesper";

const PALETTE = {
  "#101010": "var(--color-ground-deep)",
  "#fff": "var(--color-ink-soft)",
};

const GRAMMARS = [
  () => import("@shikijs/langs/bash"),
  () => import("@shikijs/langs/c"),
  () => import("@shikijs/langs/cpp"),
  () => import("@shikijs/langs/csharp"),
  () => import("@shikijs/langs/css"),
  () => import("@shikijs/langs/diff"),
  () => import("@shikijs/langs/dockerfile"),
  () => import("@shikijs/langs/go"),
  () => import("@shikijs/langs/graphql"),
  () => import("@shikijs/langs/ini"),
  () => import("@shikijs/langs/java"),
  () => import("@shikijs/langs/javascript"),
  () => import("@shikijs/langs/json"),
  () => import("@shikijs/langs/kotlin"),
  () => import("@shikijs/langs/less"),
  () => import("@shikijs/langs/lua"),
  () => import("@shikijs/langs/makefile"),
  () => import("@shikijs/langs/markdown"),
  () => import("@shikijs/langs/objective-c"),
  () => import("@shikijs/langs/perl"),
  () => import("@shikijs/langs/php"),
  () => import("@shikijs/langs/python"),
  () => import("@shikijs/langs/r"),
  () => import("@shikijs/langs/ruby"),
  () => import("@shikijs/langs/rust"),
  () => import("@shikijs/langs/scss"),
  () => import("@shikijs/langs/shellscript"),
  () => import("@shikijs/langs/sql"),
  () => import("@shikijs/langs/swift"),
  () => import("@shikijs/langs/typescript"),
  () => import("@shikijs/langs/vb"),
  () => import("@shikijs/langs/wasm"),
  () => import("@shikijs/langs/xml"),
  () => import("@shikijs/langs/yaml"),
];

const warmUpTokenizer = (core: HighlighterCore): HighlighterCore => {
  core.codeToTokens("ř", { lang: "typescript", theme: THEME });
  return core;
};

let pending: Promise<HighlighterCore> | null = null;
let ready: HighlighterCore | null = null;

const highlighter = (): Promise<HighlighterCore> => {
  pending ??= createHighlighterCore({
    themes: [import("@shikijs/themes/vesper")],
    langs: GRAMMARS,
    engine: createJavaScriptRegexEngine(),
  })
    .then(warmUpTokenizer)
    .then((core) => {
      ready = core;
      return core;
    });
  return pending;
};

export const warmHighlighter = (): Promise<void> =>
  highlighter().then(
    () => undefined,
    () => undefined,
  );

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
  const [core, setCore] = useState<HighlighterCore | null>(() => ready);
  useEffect(() => {
    if (ready !== null) {
      return undefined;
    }
    let live = true;
    void highlighter()
      .then((loaded) => {
        if (live) {
          setCore(loaded);
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return (
    <div className="ho-md">
      <Markdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={
          core === null
            ? []
            : [[rehypeShikiFromHighlighter, core, { theme: THEME, colorReplacements: PALETTE }]]
        }
        components={COMPONENTS}
      >
        {text}
      </Markdown>
    </div>
  );
}
