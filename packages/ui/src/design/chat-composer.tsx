import { type ChatSendInput, type ChatThreadTarget, errorMessage } from "@ho/protocol";
import { ArrowRight, Upload } from "lucide-react";
import type { TFunction } from "i18next";
import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { rejects, upload } from "../attachments.ts";
import { requireClient } from "../rpc.ts";
import { ChatAttachment } from "./chat-attachment.tsx";
import { fitToText, onEnter, onTab } from "./chat-editing.ts";
import { ChatToolbar } from "./chat-toolbar.tsx";
import type { Floor, Message, SessionCard, ThreadPick } from "./data.ts";
import { type Design, useDesign, useOfficeMutation } from "./store.ts";

const BOX = "relative rounded-15 p-12 transition-[border-color,background,box-shadow] duration-250";

const DROP =
  "absolute inset-0 z-5 rounded-15 bg-drop flex flex-col items-center justify-center gap-8 pointer-events-none animate-fade-160";

const INPUT =
  "w-full block resize-none overflow-y-auto border-0 bg-transparent text-13h leading-text pt-2 px-2 pb-10";

function DropHint(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className={DROP}>
      <Upload size={22} strokeWidth={1.6} className="text-accent" />
      <span className="text-12h text-accent-soft font-medium">{t("chat.dropHere")}</span>
    </div>
  );
}

async function attachFile(
  chosen: File,
  set: Design["set"],
  flash: Design["flash"],
  t: TFunction,
): Promise<void> {
  const refusal = rejects(chosen);
  if (refusal !== null) {
    flash(t("chat.attachRejected", { name: refusal }));
    return;
  }
  try {
    set({ attachment: await upload(chosen) });
  } catch (error) {
    flash(errorMessage(error));
  }
}

const targetOf = (active: ThreadPick | "new"): ChatThreadTarget =>
  active === "new" || active === "main" ? { kind: "new" } : { kind: "thread", id: active };

const ANSWERING = "flex items-center gap-7 mb-8 px-2 text-10h text-warn";

function AnsweringHint({ name }: { name: string }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className={ANSWERING}>
      <ArrowRight size={11} strokeWidth={1.5} />
      <span>{t("chat.answering", { name })}</span>
    </div>
  );
}

export function ChatComposer({
  floor,
  active,
  pending,
  running,
}: {
  floor: Floor;
  active: ThreadPick | "new";
  pending: NonNullable<Message["asks"]> | null;
  running: SessionCard | undefined;
}): React.JSX.Element {
  const { t } = useTranslation();
  const draft = useDesign((s) => s.draft);
  const attachment = useDesign((s) => s.attachment);
  const set = useDesign((s) => s.set);
  const flash = useDesign((s) => s.flash);
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const box = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    fitToText(box.current);
  }, [draft]);

  const send = useOfficeMutation({
    mutationFn: (input: ChatSendInput) => requireClient().chat.send(input),
    onSuccess: (result) => {
      if (result.message.threadId !== undefined) {
        set({ thread: result.message.threadId });
      }
    },
    onError: (_error, input) => {
      set((s) => (s.draft === "" ? { draft: input.text } : {}));
    },
  });

  const submit = (): void => {
    const text = draft.trim();
    if (text === "" && attachment === null) {
      return;
    }
    const body = text === "" ? t("chat.lookAtThis") : text;
    const attachments = attachment === null ? [] : [attachment];
    send.mutate(
      pending === null
        ? { projectId: floor.id, text: body, attachments, thread: targetOf(active) }
        : { taskId: pending.taskId, text: body, attachments },
    );
    set({ draft: "", attachment: null, query: "" });
  };

  const attach = (chosen: File): void => {
    void attachFile(chosen, set, flash, t);
  };

  return (
    <div className="flex-[0_0_auto] pt-12 px-16 pb-16">
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
        {dragging ? <DropHint /> : null}
        {pending === null ? null : <AnsweringHint name={pending.who} />}
        {attachment === null ? null : <ChatAttachment file={attachment.name} />}
        <textarea
          ref={box}
          rows={1}
          value={draft}
          onChange={(e) => {
            set({ draft: e.target.value });
          }}
          onKeyDown={(e) => {
            const write = (next: string): void => {
              set({ draft: next });
            };
            onTab(e, write);
            onEnter(e, submit, write);
          }}
          placeholder={
            pending !== null
              ? t("chat.placeholderAnswer")
              : running !== undefined
                ? t("chat.placeholderRunning", { name: running.name })
                : active === "new" || active === "main"
                  ? t("chat.placeholderNew")
                  : t("chat.placeholder")
          }
          className={`${INPUT} placeholder:text-ink-ghost`}
        />
        <ChatToolbar floor={floor} active={active} onSend={submit} onAttach={attach} />
      </div>
    </div>
  );
}
