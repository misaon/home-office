import { Popover } from "@base-ui/react/popover";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { UsageMenu, useContextFill } from "./chat-usage-menu.tsx";
import type { Floor } from "./data.ts";
import { Plus } from "lucide-react";
import { MONO } from "./tokens.ts";
import { useBossSession } from "./live.ts";
import { requireClient } from "../rpc.ts";
import { useDesign, useOfficeMutation } from "./store.ts";

const SQUARE =
  "w-28 h-28 grid place-items-center border border-border-strong rounded-8 py-1 px-6 cursor-pointer transition-all duration-250 bg-transparent text-ink-quiet";

const METER =
  "flex items-center gap-7 h-28 py-0 px-10 border border-border-strong rounded-8 cursor-pointer transition-all duration-200";

const SEND =
  "w-32 h-32 flex-[0_0_32px] grid place-items-center border-0 rounded-10 py-1 px-6 bg-accent text-accent-ink cursor-pointer transition-all duration-220 ease-soft";

export function ChatToolbar({
  floor,
  onSend,
  onAttach,
}: {
  floor: Floor;
  onSend: () => void;
  onAttach: (file: File) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [usageOpen, setUsageOpen] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const fill = useContextFill(floor.id);
  const running = useBossSession(floor.id);
  const flash = useDesign((s) => s.flash);
  const stop = useOfficeMutation({
    mutationFn: (id: NonNullable<typeof running>["sessionId"]) =>
      requireClient().sessions.stop({ id }),
    onSuccess: () => {
      flash(t("chat.stopped", { name: running?.name ?? "" }));
    },
  });

  return (
    <div className="flex items-center gap-8">
      <input
        ref={file}
        type="file"
        hidden
        onChange={(e) => {
          const chosen = e.target.files?.[0];
          e.target.value = "";
          if (chosen !== undefined) {
            onAttach(chosen);
          }
        }}
      />
      <button
        type="button"
        aria-label={t("chat.attach")}
        title={t("chat.attach")}
        onClick={() => {
          file.current?.click();
        }}
        className={`hover:text-accent-soft hover:border-accent-a45 hover:rotate-90 ${SQUARE}`}
      >
        <Plus size={12} strokeWidth={1.5} />
      </button>
      <div className="flex-1" />
      <Popover.Root open={usageOpen} onOpenChange={setUsageOpen}>
        <Popover.Trigger
          title={t("usage.chipTitle")}
          className={`hover:text-accent-soft hover:border-accent-a45 flex-[0_0_auto] ${METER} ${usageOpen ? "bg-accent-a14" : "bg-transparent"} ${usageOpen ? "text-accent-soft" : "text-ink-quiet"}`}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 14 14"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <line x1="2.5" y1="11" x2="2.5" y2="7" />
            <line x1="7" y1="11" x2="7" y2="3.5" />
            <line x1="11.5" y1="11" x2="11.5" y2="5.5" />
          </svg>
          <span className={`${MONO} text-10h`}>
            {fill === null ? "—" : `${String(Math.max(1, Math.round(fill * 100)))}%`}
          </span>
        </Popover.Trigger>
        <UsageMenu
          floorId={floor.id}
          onOpenFull={() => {
            setUsageOpen(false);
          }}
        />
      </Popover.Root>
      {running === null ? (
        <button
          type="button"
          aria-label={t("chat.sendHint")}
          title={t("chat.sendHint")}
          onClick={onSend}
          className={`hover:-translate-y-2 hover:scale-106 hover:shadow-lift-md ${SEND}`}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 14 14"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          >
            <line x1="7" y1="11.5" x2="7" y2="2.5" />
            <polyline points="3,6.5 7,2.5 11,6.5" />
          </svg>
        </button>
      ) : (
        <button
          type="button"
          aria-label={t("chat.stopOk", { name: running.name })}
          title={t("chat.stopTitle", { name: running.name })}
          disabled={stop.isPending}
          onClick={() => {
            stop.mutate(running.sessionId);
          }}
          className={`hover:scale-106 ${SEND} bg-bad-mid text-accent-ink-deep`}
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor">
            <rect x="2.5" y="2.5" width="7" height="7" rx="1.4" />
          </svg>
        </button>
      )}
    </div>
  );
}
