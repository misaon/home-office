import { isImageType, type Attachment } from "@ho/protocol";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { attachmentUrl } from "../attachments.ts";
import { MONO } from "./tokens.ts";
import { useDesign } from "./store.ts";

const FRAME: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: "10px",
  height: "118px",
  borderRadius: "10px",
  cursor: "pointer",
  overflow: "hidden",
  padding: "0",
  border: "1px solid rgba(255,197,49,.3)",
  background: "#0C0C0E",
  transition: "all .22s",
};

/** A file hanging on a message: the picture itself when it is one, its name when it is not. */
export function ChatThumb({ attachment }: { attachment: Attachment }): React.JSX.Element {
  const { t } = useTranslation();
  const set = useDesign((s) => s.set);
  const [url, setUrl] = useState<string | null>(null);
  const image = isImageType(attachment.mime);

  useEffect(() => {
    if (!image) {
      return undefined;
    }
    let live = true;
    void attachmentUrl(attachment).then((value) => {
      if (live) {
        setUrl(value);
      }
    });
    return () => {
      live = false;
    };
  }, [attachment, image]);

  return (
    <button
      type="button"
      title={attachment.name}
      onClick={() => {
        set({ lightbox: attachment });
      }}
      style={FRAME}
      className="hop9"
    >
      {url === null ? (
        <span style={{ ...MONO, fontSize: "10px", color: "#E4C778" }}>
          {image ? t("common.checking") : `${attachment.name} · ${t("chat.imageOpen")}`}
        </span>
      ) : (
        <img
          src={url}
          alt={attachment.name}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      )}
    </button>
  );
}
