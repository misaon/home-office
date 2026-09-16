import { type ChatSendInput } from "@ho/protocol";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { rejects, upload } from "../attachments.ts";
import { requireClient } from "../rpc.ts";
import { ChatAttachment } from "./chat-attachment.tsx";
import { ChatToolbar } from "./chat-toolbar.tsx";
import { ChatWorking } from "./chat-working.tsx";
import type { Floor } from "./data.ts";
import { useDesign, useOfficeMutation } from "./store.ts";

const BOX = "relative rounded-15 p-12 transition-[border-color,background,box-shadow] duration-250";

const DROP =
  "absolute inset-0 z-5 rounded-15 bg-drop flex flex-col items-center justify-center gap-8 pointer-events-none animate-fade-160";

const INPUT = "w-full border-0 bg-transparent text-13h pt-2 px-2 pb-10";

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

  const send = useOfficeMutation({
    mutationFn: (input: ChatSendInput) => requireClient().chat.send(input),
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
    set({ draft: "", attachment: null, query: "" });
  };

  const attach = (chosen: File): void => {
    void attachNow(chosen);
  };

  const attachNow = async (chosen: File): Promise<void> => {
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
    <div className="flex-[0_0_auto] pt-12 px-16 pb-16">
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
          const [dropped] = e.dataTransfer.files;
          if (dropped !== undefined) {
            attach(dropped);
          }
        }}
        className={`hover:border-accent-a40 hover:shadow-halo ${BOX} border ${dragging ? "border-accent-a60" : "border-border-strong"} ${dragging ? "bg-accent-a05" : "bg-card-lit"}`}
      >
        {dragging ? (
          <div className={DROP}>
            <svg
              className="stroke-accent"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 16V4" />
              <polyline points="7,9 12,4 17,9" />
              <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
            </svg>
            <span className="text-12h text-accent-soft font-medium">{t("chat.dropHere")}</span>
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
          className={`${INPUT} placeholder:text-ink-ghost`}
        />
        <ChatToolbar floor={floor} onSend={submit} onAttach={attach} />
      </div>
    </div>
  );
}
