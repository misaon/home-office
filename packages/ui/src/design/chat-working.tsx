import { useTranslation } from "react-i18next";
import type { Floor } from "./data.ts";
import { useBossSession } from "./live.ts";
import { requireClient } from "../rpc.ts";
import { useDesign, useOfficeMutation } from "./store.ts";

const BAR =
  "flex items-center gap-10 py-9 px-11 rounded-12 bg-accent-a07 border border-accent-a26 mb-10 animate-rise-300";

const STOP =
  "flex items-center gap-7 py-6 px-11 rounded-9 border border-bad-a35 bg-bad-a10 text-bad-soft text-11h cursor-pointer flex-[0_0_auto] transition-all duration-200";

/** While the floor's boss is running: what it is at, and the one way to cut it off. */
export function ChatWorking({ floor }: { floor: Floor }): React.JSX.Element | null {
  const { t } = useTranslation();
  const flash = useDesign((s) => s.flash);
  const confirm = useDesign((s) => s.confirm);
  const running = useBossSession(floor.id);

  const stop = useOfficeMutation({
    mutationFn: (id: NonNullable<typeof running>["sessionId"]) =>
      requireClient().sessions.stop({ id }),
    onSuccess: () => {
      flash(t("chat.stopped", { name: running?.name ?? "" }));
    },
  });

  if (running === null) {
    return null;
  }
  return (
    <div className={BAR}>
      <span className="relative w-7 h-7 flex-[0_0_7px]">
        <span className="absolute inset-0 rounded-half bg-accent" />
        <span className="absolute inset-0 rounded-half bg-accent animate-ring-2000" />
      </span>
      <span className="flex-1 min-w-0 text-12 text-ink-warm overflow-hidden text-ellipsis whitespace-nowrap">
        {`${running.name} · ${running.doing}`}
      </span>
      <button
        type="button"
        disabled={stop.isPending}
        onClick={() => {
          confirm({
            danger: false,
            title: t("chat.stopTitle", { name: running.name }),
            body: t("chat.stopBody"),
            okLabel: t("chat.stopOk", { name: running.name }),
            cancelLabel: t("chat.stopCancel"),
            act: () => {
              stop.mutate(running.sessionId);
            },
          });
        }}
        className={`hover:bg-bad-a20 hover:border-bad-a55 ${STOP}`}
      >
        <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
          <rect x="2.5" y="2.5" width="7" height="7" rx="1.4" />
        </svg>
        {t("chat.stop")}
      </button>
    </div>
  );
}
