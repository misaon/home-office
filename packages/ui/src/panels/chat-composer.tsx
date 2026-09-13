import { type Attachment, ATTACHMENT_TYPES, ATTACHMENTS_MAX } from "@ho/protocol";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { rejects, upload } from "../attachments.ts";
import { CONTROL, Failure } from "../kit/controls.tsx";
import { Reveal } from "../kit/reveal.tsx";
import { PendingFiles } from "./chat-files.tsx";

/** What the file picker offers; the office takes the same list however a file arrives. */
const ACCEPT = Object.keys(ATTACHMENT_TYPES)
  .map((extension) => `.${extension}`)
  .join(",");

type Props = {
  /** Who the message goes to, said in the words the panel above chose. */
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
 * Where a message is written: the text, the files that go with it, and the drop target for both. A
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
  const [dropping, setDropping] = useState(false);
  const [uploadError, setUploadError] = useState<unknown>(null);

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
      className={`shrink-0 space-y-2 border-t p-4 transition-colors duration-[var(--duration-base)] ${
        dropping ? "border-accent/60 bg-accent/[0.07]" : "border-line"
      }`}
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
      <div className="flex items-center gap-3 text-xs text-muted">
        {to}
        <label className="ml-auto cursor-pointer rounded-lg px-2 py-1 text-2xs text-muted hover:bg-line/40 hover:text-text">
          {t("chat.attach")}
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
      <textarea
        aria-label={t("chat.label")}
        maxLength={20_000}
        disabled={disabled}
        className={`${CONTROL} h-20 resize-none`}
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
    </div>
  );
}
