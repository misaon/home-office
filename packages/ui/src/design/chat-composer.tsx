import { type ChatSendInput } from "@ho/protocol";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { rejects, upload } from "../attachments.ts";
import { requireClient } from "../rpc.ts";
import { ChatAttachment } from "./chat-attachment.tsx";
import { ChatToolbar } from "./chat-toolbar.tsx";
import { ChatWorking } from "./chat-working.tsx";
import type { Floor } from "./data.ts";
import { useDesign } from "./store.ts";

const BOX: React.CSSProperties = {
  position: "relative",
  borderRadius: "15px",
  padding: "12px",
  transition: "border-color .25s,background .25s,box-shadow .25s",
};

const DROP: React.CSSProperties = {
  position: "absolute",
  inset: "0",
  zIndex: 5,
  borderRadius: "15px",
  background: "rgba(14,12,6,.9)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  pointerEvents: "none",
  animation: "fadeIn .16s ease both",
};

const INPUT: React.CSSProperties = {
  width: "100%",
  border: "0",
  background: "transparent",
  fontSize: "13.5px",
  padding: "2px 2px 10px",
};

/** Where a message is written: what is attached, what it costs, and the button that sends it. */
export function ChatComposer({ floor }: { floor: Floor }): React.JSX.Element {
  const { t } = useTranslation();
  const draft = useDesign((s) => s.draft);
  const attachment = useDesign((s) => s.attachment);
  const set = useDesign((s) => s.set);
  const flash = useDesign((s) => s.flash);
  const [dragging, setDragging] = useState(false);
  // dragenter/dragleave fire for every child the pointer crosses; counting them is what keeps the
  // highlight from blinking while the file travels over the composer's own controls.
  const depth = useRef(0);

  const send = useMutation({
    mutationFn: (input: ChatSendInput) => requireClient().chat.send(input),
    onError: (error: Error) => {
      flash(error.message);
    },
  });

  const submit = (): void => {
    const text = draft.trim();
    if (text === "" && attachment === null) {
      return;
    }
    send.mutate({
      projectId: floor.id,
      text: text === "" ? t("chat.lookAtThis") : text,
      attachments: attachment === null ? [] : [attachment],
    });
    set({ draft: "", attachment: null, attachOpen: false, query: "" });
  };

  const attach = (chosen: File): void => {
    void attachNow(chosen);
  };

  const attachNow = async (chosen: File): Promise<void> => {
    set({ attachOpen: false });
    const refusal = rejects(chosen);
    if (refusal !== null) {
      flash(t("chat.attachRejected", { name: refusal }));
      return;
    }
    try {
      set({ attachment: await upload(chosen) });
    } catch (error) {
      flash(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div style={{ flex: "0 0 auto", padding: "12px 16px 16px" }}>
      <ChatWorking floor={floor} />
      <div
        onDragEnter={(e) => {
          e.preventDefault();
          depth.current += 1;
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          depth.current -= 1;
          if (depth.current <= 0) {
            depth.current = 0;
            setDragging(false);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          depth.current = 0;
          setDragging(false);
          const dropped = e.dataTransfer.files[0];
          if (dropped !== undefined) {
            attach(dropped);
          }
        }}
        style={{
          ...BOX,
          border: `1px solid ${dragging ? "rgba(255,197,49,.6)" : "#2C2C32"}`,
          background: dragging ? "rgba(255,197,49,.05)" : "#111114",
        }}
        className="ho-8d048f"
      >
        {dragging ? (
          <div style={DROP}>
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#FFC531"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 16V4" />
              <polyline points="7,9 12,4 17,9" />
              <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
            </svg>
            <span style={{ fontSize: "12.5px", color: "#FFD666", fontWeight: "500" }}>
              {t("chat.dropHere")}
            </span>
          </div>
        ) : null}
        {attachment === null ? null : <ChatAttachment file={attachment.name} />}
        <input
          value={draft}
          onChange={(e) => {
            set({ draft: e.target.value });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={t("chat.placeholder")}
          style={INPUT}
        />
        <ChatToolbar floor={floor} onSend={submit} onAttach={attach} />
      </div>
    </div>
  );
}
