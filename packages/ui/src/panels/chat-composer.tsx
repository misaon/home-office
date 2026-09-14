import { type Attachment, ATTACHMENT_TYPES, ATTACHMENTS_MAX } from "@ho/protocol";
import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { rejects, upload } from "../attachments.ts";
import { Failure } from "../kit/controls.tsx";
import { Reveal } from "../kit/reveal.tsx";
import { PendingFiles } from "./chat-files.tsx";
import { UsageChip } from "./chat-usage.tsx";

/** What the file picker offers; the office takes the same list however a file arrives. */
const ACCEPT = Object.keys(ATTACHMENT_TYPES)
  .map((extension) => `.${extension}`)
  .join(",");

/** Two lines to start with, eight at most: past that the transcript matters more than the draft. */
const MIN_HEIGHT = 40;
const MAX_HEIGHT = 160;

function ClipIcon(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10.8 5.2 6.3 9.7a1.6 1.6 0 0 0 2.3 2.3l4.8-4.8a3.2 3.2 0 0 0-4.5-4.5L3.8 8a4.8 4.8 0 0 0 6.8 6.8l3.7-3.7" />
    </svg>
  );
}

/** The composer's own bottom edge: what the draft has cost, and the one way to add a file to it. */
function Toolbar({
  to,
  attach,
}: {
  to: React.ReactNode;
  attach: (picked: readonly File[]) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-1 px-1.5 pb-1.5 text-2xs text-muted">
      <span className="min-w-0 flex-1 truncate px-1">{to}</span>
      <UsageChip />
      <label
        className="flex shrink-0 cursor-pointer items-center rounded-lg px-2 py-1 text-muted hover:bg-line/50 hover:text-text"
        title={t("chat.attach")}
      >
        <ClipIcon />
        <span className="sr-only">{t("chat.attach")}</span>
        <input
          type="file"
          multiple
          className="hidden"
          accept={ACCEPT}
          onChange={(e) => {
            attach([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
      </label>
    </div>
  );
}

type Props = {
  /** Only said when it is not obvious: answering a question names who asked it. */
  to: React.ReactNode;
  placeholder: string;
  text: string;
  setText: (text: string) => void;
  files: Attachment[];
  setFiles: (update: (current: Attachment[]) => Attachment[]) => void;
  disabled: boolean;
  failure: unknown;
  submit: () => void;
};

/**
 * Where a message is written: the text, the files that go with it, and the drop target for both. It is
 * one box rather than a stack of rows — the field grows with the draft and its controls sit on its own
 * bottom edge, so an empty composer costs the transcript two lines instead of a third of the panel. A
 * dropped or picked file is uploaded straight away, so sending is only ever the descriptors.
 */
export function Composer({
  to,
  placeholder,
  text,
  setText,
  files,
  setFiles,
  disabled,
  failure,
  submit,
}: Props): React.JSX.Element {
  const { t } = useTranslation();
  const field = useRef<HTMLTextAreaElement>(null);
  const [dropping, setDropping] = useState(false);
  const [uploadError, setUploadError] = useState<unknown>(null);

  // The field is measured, not counted in rows: a wrapped line is a line the reader can see.
  useLayoutEffect(() => {
    const element = field.current;
    if (element !== null) {
      element.style.height = "0px";
      element.style.height = `${String(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, element.scrollHeight)))}px`;
    }
  }, [text]);

  const attach = (picked: readonly File[]): void => {
    setUploadError(null);
    const rejected = picked.map((file) => rejects(file)).filter((name) => name !== null);
    if (rejected.length > 0) {
      setUploadError(new Error(t("chat.attachRejected", { names: rejected.join(", ") })));
    }
    for (const file of picked.filter((f) => rejects(f) === null).slice(0, ATTACHMENTS_MAX)) {
      void upload(file).then(
        (attachment) => {
          setFiles((current) =>
            current.some((f) => f.id === attachment.id)
              ? current
              : [...current, attachment].slice(0, ATTACHMENTS_MAX),
          );
        },
        (error: unknown) => {
          setUploadError(error);
        },
      );
    }
  };

  return (
    <div
      className="shrink-0 border-t border-line bg-panel px-3 py-2.5"
      onDragOver={(e) => {
        e.preventDefault();
        setDropping(true);
      }}
      // `dragleave` fires for the composer when the pointer crosses onto one of its own children, so a
      // drag over the textarea would blink the drop highlight off and on the whole way in.
      onDragLeave={(e) => {
        const left = e.relatedTarget;
        if (!(left instanceof Node) || !e.currentTarget.contains(left)) {
          setDropping(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDropping(false);
        attach([...e.dataTransfer.files]);
      }}
    >
      <Failure error={failure ?? uploadError} />
      <Reveal open={files.length > 0}>
        <div className="pb-2">
          <PendingFiles
            files={files}
            remove={(id) => {
              setFiles((current) => current.filter((f) => f.id !== id));
            }}
          />
        </div>
      </Reveal>
      <div
        className={`rounded-xl border bg-ink/60 px-1.5 pt-1 pb-0.5 transition-colors duration-[var(--duration-base)] ${
          dropping
            ? "border-accent/60 bg-accent/[0.09]"
            : "border-line focus-within:border-line-strong"
        }`}
      >
        <textarea
          ref={field}
          aria-label={t("chat.label")}
          title={t("chat.sendHint")}
          maxLength={20_000}
          rows={2}
          disabled={disabled}
          className="block w-full resize-none bg-transparent px-1.5 pt-1.5 pb-1 text-sm text-text placeholder:text-faint focus:outline-none"
          placeholder={placeholder}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <Toolbar to={to} attach={attach} />
      </div>
    </div>
  );
}
