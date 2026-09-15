import type { OfficeLayout } from "@ho/protocol";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { OFFICE_SIZE } from "@ho/sim";
import { layoutsQuery } from "../queries.ts";
import { requireClient } from "../rpc.ts";
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

/**
 * The internal office editor. Compiled into development bundles only — `ui-build.ts` resolves this
 * module to a stub for production. Left button paints, right button erases, and Save writes
 * `layouts/<id>.json` in the repository through the daemon.
 */
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

  // R rotates the piece being held, the way Prison Architect does, unless a field has the keyboard.
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
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="border-0 p-0 m-0 max-w-none max-h-none w-full h-full bg-transparent text-inherit overflow-hidden outline-none focus:outline-none focus-visible:outline-none backdrop:bg-scrim-a74 backdrop:backdrop-blur-[10px] backdrop:animate-fade-280"
      aria-label={t("editor.title")}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="h-full flex bg-ground">
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
              const result = erasing ? erase(draft, tool, rect) : paint(draft, tool, rect, brush);
              setDraft(result.next);
              setNote(result.note);
            }}
          />
        </div>
      </div>
    </dialog>
  );
}
