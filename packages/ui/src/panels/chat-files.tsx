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

const CARD = "flex items-center gap-2 rounded-md border border-line bg-ink/60 px-2 py-1.5 text-2xs";

/** An image opens in the viewer; anything else is a card that saves the file. */
function Attached({ attachment }: { attachment: Attachment }): React.JSX.Element {
  const { t } = useTranslation();
  const url = useAttachmentUrl(attachment);
  const [open, setOpen] = useState(false);
  if (!isImageType(attachment.mime)) {
    return (
      <a
        className={`${CARD} text-gray-300 hover:border-accent/60`}
        href={url ?? undefined}
        download={attachment.name}
      >
        <span className="max-w-48 truncate">{attachment.name}</span>
        <span className="text-gray-500">{formatBytes(attachment.bytes)}</span>
      </a>
    );
  }
  return (
    <>
      <button
        type="button"
        className="block overflow-hidden rounded-md border border-line hover:border-accent/60"
        title={t("chat.imageOpen", { name: attachment.name })}
        disabled={url === null}
        onClick={() => {
          setOpen(true);
        }}
      >
        {url === null ? (
          <span className={`${CARD} text-gray-500`}>{attachment.name}</span>
        ) : (
          <img src={url} alt={attachment.name} className="max-h-48 max-w-full object-contain" />
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
        <span key={file.id} className={`${CARD} text-gray-300`}>
          <span className="max-w-40 truncate">{file.name}</span>
          <span className="text-gray-500">{formatBytes(file.bytes)}</span>
          <button
            type="button"
            className="text-gray-500 hover:text-red-300"
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
