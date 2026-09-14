import { isImageType, type Attachment } from "@ho/protocol";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { attachmentUrl } from "../attachments.ts";
import { MONO } from "./tokens.ts";
import { useDesign } from "./store.ts";

/** The strip under the picture: what the file is, and the way out. */
function LightboxBar({
  attachment,
  onClose,
}: {
  attachment: Attachment;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div
      style={{
        flex: "0 0 auto",
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "13px 16px",
        background: "#111114",
        borderTop: "1px solid #26262C",
      }}
    >
      <span
        style={{
          flex: "1",
          minWidth: "0",
          ...MONO,
          fontSize: "11.5px",
          color: "#CFCCC6",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {`${attachment.name} · ${(attachment.bytes / 1024).toFixed(0)} kB`}
      </span>
      <button
        type="button"
        onClick={onClose}
        style={{
          padding: "8px 13px",
          borderRadius: "9px",
          border: "0",
          background: "var(--a,#FFC531)",
          color: "#150F02",
          fontSize: "12px",
          fontWeight: "600",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {t("common.close")}
      </button>
    </div>
  );
}

/** An attachment at full size, over everything, closed by clicking anywhere. */
export function Lightbox({ attachment }: { attachment: Attachment }): React.JSX.Element {
  const { t } = useTranslation();
  const set = useDesign((s) => s.set);
  const [url, setUrl] = useState<string | null>(null);
  const close = (): void => {
    set({ lightbox: null });
  };

  useEffect(() => {
    let live = true;
    void attachmentUrl(attachment).then((value) => {
      if (live) {
        setUrl(value);
      }
    });
    return () => {
      live = false;
    };
  }, [attachment]);

  return (
    <div
      role="presentation"
      onClick={close}
      style={{
        position: "fixed",
        inset: "0",
        zIndex: 85,
        background: "rgba(6,6,7,.86)",
        backdropFilter: "blur(14px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "14px",
        padding: "24px",
        animation: "fadeIn .26s ease both",
      }}
    >
      <div
        style={{
          width: "min(1240px,97vw)",
          flex: "1 1 auto",
          minHeight: "0",
          display: "flex",
          flexDirection: "column",
          borderRadius: "18px",
          overflow: "hidden",
          border: "1px solid rgba(255,197,49,.3)",
          boxShadow: "0 50px 120px rgba(0,0,0,.75)",
          animation: "popIn .42s cubic-bezier(.2,.9,.3,1.05) both",
        }}
      >
        <div
          style={{
            flex: "1",
            minHeight: "0",
            background: "#0C0C0E",
            display: "grid",
            placeItems: "center",
            overflow: "hidden",
          }}
        >
          {!isImageType(attachment.mime) ? (
            <span style={{ ...MONO, fontSize: "13px", color: "#E4C778" }}>{attachment.name}</span>
          ) : url === null ? (
            <span style={{ ...MONO, fontSize: "13px", color: "#E4C778" }}>
              {t("common.checking")}
            </span>
          ) : (
            <img
              src={url}
              alt={attachment.name}
              style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
            />
          )}
        </div>
        <LightboxBar attachment={attachment} onClose={close} />
      </div>
      <span style={{ fontSize: "11.5px", color: "#A6A39C", flex: "0 0 auto" }}>
        {t("chat.clickToClose")}
      </span>
    </div>
  );
}
