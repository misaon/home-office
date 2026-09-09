import { useEffect, useRef } from "react";
import type { Draft, Rect } from "./draft.ts";
import { EditorScene } from "./scene.ts";

/** The Pixi canvas, wired to the draft: it redraws on every edit and reports what a drag covered. */
export function EditorCanvas({
  draft,
  onPaint,
}: {
  draft: Draft;
  onPaint: (rect: Rect, erasing: boolean) => void;
}): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<EditorScene | null>(null);
  const latest = useRef(draft);
  useEffect(() => {
    latest.current = draft;
    scene.current?.setDraft(draft);
  }, [draft]);
  useEffect(() => {
    const element = host.current;
    if (element === null) {
      return undefined;
    }
    const created = new EditorScene();
    let disposed = false;
    void created.init(element).then(() => {
      if (disposed) {
        created.destroy();
        return;
      }
      scene.current = created;
      created.setDraft(latest.current);
    });
    return () => {
      disposed = true;
      scene.current = null;
      created.destroy();
    };
  }, []);
  useEffect(() => {
    if (scene.current !== null) {
      scene.current.onPaint = onPaint;
    }
  }, [onPaint]);
  return <div ref={host} className="h-full w-full" />;
}
