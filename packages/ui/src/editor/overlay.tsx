import type { OfficeLayout } from "@ho/protocol";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { OFFICE_SIZE } from "@ho/sim";
import { layoutsQuery } from "../queries.ts";
import { requireClient } from "../rpc.ts";
import { Dialog } from "@base-ui/react/dialog";
import { BACKDROP } from "../design/dialog-sheet.tsx";
import { EditorCanvas } from "./canvas.tsx";
import { EditorDrawer } from "./drawer.tsx";
import {
  type Brush,
  emptyDraft,
  erase,
  type Note,
  type OfficeDraft,
  paint,
  rotate,
  type Tool,
} from "./draft.ts";

export function EditorOverlay({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { t } = useTranslation();
  const queries = useQueryClient();
  const [draft, setDraft] = useState<OfficeDraft>(() =>
    emptyDraft(t("editor.newOffice"), OFFICE_SIZE.width, OFFICE_SIZE.height),
  );
  const [tool, setTool] = useState<Tool>("wall");
  const [brush, setBrush] = useState<Brush>({
    wall: "wall",
    room: "team-room",
    door: "door",
    object: "desk-developer",
    facing: "s",
  });
  const [note, setNote] = useState<Note | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() === "r" && document.activeElement?.tagName !== "INPUT") {
        setBrush(rotate);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  const save = useMutation({
    mutationFn: (office: OfficeLayout) => requireClient().layouts.save(office),
    onSuccess: () => queries.invalidateQueries({ queryKey: layoutsQuery.queryKey }),
  });
  return (
    <Dialog.Root
      open
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className={BACKDROP} />
        <Dialog.Viewport className="fixed inset-0 z-90">
          <Dialog.Popup
            aria-label={t("editor.title")}
            className="w-full h-full outline-none flex bg-ground"
          >
            <EditorDrawer
              draft={draft}
              setDraft={setDraft}
              tool={tool}
              setTool={setTool}
              brush={brush}
              setBrush={setBrush}
              note={note}
              setNote={setNote}
              save={save}
              onClose={onClose}
            />
            <div className="min-w-0 flex-1 bg-floor">
              <EditorCanvas
                draft={draft}
                tool={tool}
                brush={brush}
                onRotate={() => {
                  setBrush(rotate);
                }}
                onPaint={(rect, erasing) => {
                  const result = erasing
                    ? erase(draft, tool, rect)
                    : paint(draft, tool, rect, brush);
                  setDraft(result.next);
                  setNote(result.note);
                }}
              />
            </div>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
