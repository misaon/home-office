import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { requireClient } from "../rpc.ts";
import { Modal } from "./dialog-sheet.tsx";
import { type DiffLine, type DiffRow, diffOf, hunksOf } from "./diff.ts";
import { Segmented } from "./segmented.tsx";
import { type DiffPick, useDesign, useOfficeMutation } from "./store.ts";
import { MONO } from "./tokens.ts";

const SHEET =
  "w-[min(1240px,97vw)] h-[min(880px,calc(100vh-64px))] flex flex-col rounded-18 overflow-hidden border border-accent-a30 bg-dialog shadow-sheet animate-pop-420";

const BAR =
  "flex-[0_0_auto] flex items-center gap-12 py-12 px-16 border-b border-border bg-card-lit";

const PATH = `flex-1 min-w-0 ${MONO} text-12h text-ink-soft overflow-hidden text-ellipsis whitespace-nowrap`;

const COUNT = `${MONO} text-11h flex-[0_0_auto]`;

const BODY = `flex-1 min-h-0 overflow-auto bg-sunk ${MONO} text-11 leading-log`;

const LINE = "flex min-w-max";

const GUTTER = "flex-[0_0_52px] text-right pr-8 select-none text-ink-lane tabular-nums";

const MARK = "flex-[0_0_16px] text-center select-none";

const TEXT = "whitespace-pre pr-16";

const GAP = `${MONO} text-10 text-ink-label text-center py-4 bg-card border-y border-line select-none`;

const FOOT =
  "flex-[0_0_auto] flex items-center gap-10 py-12 px-16 bg-card-lit border-t border-border";

const CLOSE =
  "py-8 px-13 rounded-9 border-0 bg-accent text-accent-ink text-12 font-semibold cursor-pointer whitespace-nowrap flex-[0_0_auto]";

const NOTE =
  "flex-1 min-w-0 h-32 py-0 px-11 rounded-10 bg-sunk border border-border-strong text-12h placeholder:text-ink-ghost";

const SEND =
  "w-32 h-32 flex-[0_0_32px] grid place-items-center border-0 rounded-10 bg-accent text-accent-ink cursor-pointer transition-all duration-220 disabled:opacity-40";

type View = "changes" | "whole";

const TONE: Record<DiffLine["kind"], { row: string; mark: string; text: string }> = {
  same: { row: "", mark: "", text: "text-ink-mute" },
  add: { row: "bg-good-a10", mark: "+", text: "text-good-soft" },
  del: { row: "bg-bad-a10", mark: "−", text: "text-bad-soft" },
};

function Row({
  row,
  ref,
}: {
  row: DiffRow;
  ref: React.Ref<HTMLDivElement> | undefined;
}): React.JSX.Element {
  const { t } = useTranslation();
  if (row.kind === "gap") {
    return <div className={GAP}>{t("diff.hidden", { count: row.hidden })}</div>;
  }
  const tone = TONE[row.kind];
  return (
    <div ref={ref} className={`${LINE} ${tone.row}`}>
      <span className={GUTTER}>{row.oldNo ?? ""}</span>
      <span className={GUTTER}>{row.newNo ?? ""}</span>
      <span className={`${MARK} ${tone.text}`}>{tone.mark}</span>
      <span className={`${TEXT} ${tone.text}`}>{row.text}</span>
    </div>
  );
}

function NoteToAgent({ pick }: { pick: DiffPick }): React.JSX.Element {
  const { t } = useTranslation();
  const flash = useDesign((s) => s.flash);
  const [text, setText] = useState("");
  const send = useOfficeMutation({
    mutationFn: (note: string) =>
      requireClient().tasks.comment({ id: pick.taskId, path: pick.change.path, text: note }),
    onSuccess: () => {
      setText("");
      flash(t("diff.commentSent"));
    },
  });
  const submit = (): void => {
    const note = text.trim();
    if (note !== "") {
      send.mutate(note);
    }
  };
  return (
    <div className="flex-1 min-w-0 flex items-center gap-8">
      <input
        value={text}
        onChange={(event) => {
          setText(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submit();
          }
        }}
        placeholder={t("diff.commentPlaceholder")}
        title={t("diff.commentHint")}
        aria-label={t("diff.comment")}
        className={NOTE}
      />
      <button
        type="button"
        aria-label={t("diff.comment")}
        title={t("diff.commentHint")}
        disabled={send.isPending || text.trim() === ""}
        onClick={submit}
        className={SEND}
      >
        <Send size={13} strokeWidth={1.7} />
      </button>
    </div>
  );
}

export function DiffDialog({ pick }: { pick: DiffPick }): React.JSX.Element {
  const { t } = useTranslation();
  const { change } = pick;
  const set = useDesign((s) => s.set);
  const [view, setView] = useState<View>("whole");
  const first = useRef<HTMLDivElement>(null);
  const diff = diffOf(change);
  const rows: DiffRow[] = view === "whole" ? diff.lines : hunksOf(diff.lines);
  const firstChange = rows.findIndex((row) => row.kind !== "same" && row.kind !== "gap");
  const close = (): void => {
    set({ diff: null });
  };

  useEffect(() => {
    first.current?.scrollIntoView({ block: "center" });
  }, [view, change]);

  const notice = change.truncated
    ? t("diff.truncated")
    : diff.added + diff.removed === 0
      ? t("diff.unchanged")
      : null;

  return (
    <Modal open label={t("diff.title")} onClose={close}>
      <div className={SHEET}>
        <div className={BAR}>
          <span className={PATH} title={change.path}>
            {change.path}
          </span>
          {change.before === null ? (
            <span className={`${COUNT} text-accent-quote`}>{t("diff.newFile")}</span>
          ) : null}
          <span className={`${COUNT} text-good-soft`}>{`+${String(diff.added)}`}</span>
          <span className={`${COUNT} text-bad-soft`}>{`−${String(diff.removed)}`}</span>
          <div className="w-220 flex-[0_0_220px]">
            <Segmented<View>
              label={t("diff.title")}
              value={view}
              options={[
                { value: "changes", label: t("diff.changes") },
                { value: "whole", label: t("diff.wholeFile") },
              ]}
              onChange={setView}
            />
          </div>
        </div>
        <div className={BODY}>
          {rows.length === 0 ? (
            <div className="p-24 text-center text-12h text-ink-label">{t("diff.unchanged")}</div>
          ) : (
            rows.map((row, index) => (
              <Row
                key={
                  row.kind === "gap"
                    ? `gap-${String(index)}`
                    : `${row.kind}-${String(row.oldNo)}-${String(row.newNo)}`
                }
                row={row}
                ref={index === firstChange ? first : undefined}
              />
            ))
          )}
        </div>
        <div className={FOOT}>
          {notice === null ? null : (
            <span className="flex-[0_0_auto] max-w-[40%] text-11h text-ink-meta">{notice}</span>
          )}
          <NoteToAgent pick={pick} />
          <button type="button" onClick={close} className={CLOSE}>
            {t("common.close")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
