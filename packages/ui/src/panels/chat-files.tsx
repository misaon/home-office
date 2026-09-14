import { type Attachment, formatBytes, isImageType } from "@ho/protocol";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { attachmentUrl } from "../attachments.ts";
import { ImageViewer } from "../kit/image-viewer.tsx";

/** The bytes of an attachment as a URL this page can show, or null while it loads or if it failed. */
function useAttachmentUrl(attachment: Attachment): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void attachmentUrl(attachment).then(
      (value) => {
        if (!cancelled) {
          setUrl(value);
        }
      },
      () => {
        if (!cancelled) {
          setUrl(null);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attachment]);
  return url;
}

const FILE =
  "flex items-center gap-2 rounded-lg border border-border bg-background/60 px-2.5 py-1.5 text-2xs";

/**
 * Every image takes the same tile, whether or not its bytes have arrived. The office does not record an
 * image's dimensions, so anything that sized itself to the picture would resize the bubble under the
 * reader the moment the blob resolved.
 */
const THUMB =
  "flex h-32 w-44 items-center justify-center overflow-hidden rounded-xl border bg-background/60";

/** An image opens in the viewer; anything else is a card that saves the file. */
function Attached({ attachment }: { attachment: Attachment }): React.JSX.Element {
  const { t } = useTranslation();
  const url = useAttachmentUrl(attachment);
  const [open, setOpen] = useState(false);
  if (!isImageType(attachment.mime)) {
    return (
      <a
        className={`${FILE} text-foreground/80 hover:border-primary/60 hover:text-foreground`}
        href={url ?? undefined}
        download={attachment.name}
      >
        <span className="max-w-48 truncate">{attachment.name}</span>
        <span className="text-muted-foreground">{formatBytes(attachment.bytes)}</span>
      </a>
    );
  }
  return (
    <>
      <button
        type="button"
        className={`${THUMB} animate-pop border-border transition-[transform,border-color] duration-[var(--duration-base)] ease-[var(--ease-soft)] hover:-translate-y-px hover:border-primary/60`}
        title={t("chat.imageOpen", { name: attachment.name })}
        disabled={url === null}
        onClick={() => {
          setOpen(true);
        }}
      >
        {url === null ? (
          <span className="animate-pulse truncate px-3 text-2xs text-muted-foreground">
            {attachment.name}
          </span>
        ) : (
          <img src={url} alt={attachment.name} className="max-h-full max-w-full object-contain" />
        )}
      </button>
      {open && url !== null ? (
        <ImageViewer
          src={url}
          name={attachment.name}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

/** What a message carries besides its text. */
export function MessageFiles({
  attachments,
}: {
  attachments: readonly Attachment[];
}): React.JSX.Element | null {
  if (attachments.length === 0) {
    return null;
  }
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {attachments.map((attachment) => (
        <Attached key={attachment.id} attachment={attachment} />
      ))}
    </div>
  );
}

/** The files waiting to go with the message being written, each removable before it is sent. */
export function PendingFiles({
  files,
  remove,
}: {
  files: readonly Attachment[];
  remove: (id: string) => void;
}): React.JSX.Element | null {
  const { t } = useTranslation();
  if (files.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {files.map((file) => (
        <span key={file.id} className={`${FILE} animate-pop text-foreground/80`}>
          <span className="max-w-40 truncate">{file.name}</span>
          <span className="text-muted-foreground">{formatBytes(file.bytes)}</span>
          <button
            type="button"
            className="rounded px-1 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
            title={t("common.remove")}
            onClick={() => {
              remove(file.id);
            }}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}
