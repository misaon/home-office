import { type ChatSendInput } from "@ho/protocol";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { rejects, upload } from "../attachments.ts";
import { requireClient } from "../rpc.ts";
import { ChatAttachment } from "./chat-attachment.tsx";
import { ChatToolbar } from "./chat-toolbar.tsx";
import type { Floor } from "./data.ts";
import { useDesign } from "./store.ts";

const BOX: React.CSSProperties = {
  borderRadius: "15px",
  border: "1px solid #2C2C32",
  background: "#111114",
  padding: "12px",
  transition: "border-color .25s,box-shadow .25s",
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
      <div style={BOX} className="hopa">
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
