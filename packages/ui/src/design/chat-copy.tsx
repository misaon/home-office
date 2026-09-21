import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useDesign } from "./store.ts";

const SHOWN_MS = 1400;

const BUTTON =
  "w-22 h-22 grid place-items-center rounded-6 border border-transparent bg-toast/80 text-ink-label cursor-pointer transition-all duration-200 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-accent-soft hover:border-accent-a30 hover:bg-accent-a08";

export function CopyButton({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}): React.JSX.Element {
  const { t } = useTranslation();
  const flash = useDesign((s) => s.flash);
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={t("chat.copy")}
      title={t("chat.copy")}
      onClick={(event) => {
        event.stopPropagation();
        void navigator.clipboard.writeText(text).then(
          () => {
            setDone(true);
            flash(t("chat.copied"));
            setTimeout(() => {
              setDone(false);
            }, SHOWN_MS);
          },
          () => {
            flash(t("chat.copyFailed"));
          },
        );
      }}
      className={`${BUTTON} ${done ? "opacity-100 text-good-soft" : ""} ${className}`}
    >
      {done ? <Check size={11} strokeWidth={1.8} /> : <Copy size={11} strokeWidth={1.6} />}
    </button>
  );
}
