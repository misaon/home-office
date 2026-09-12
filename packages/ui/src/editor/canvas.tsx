import { useEffect, useRef } from "react";
import { useKindName } from "../i18n/kinds.ts";
import type { Draft, Kinds, Rect, Tool } from "./draft.ts";
import { EditorScene } from "./scene.ts";

/** The Pixi canvas, wired to the draft: it redraws on every edit and reports what a drag covered. */
export function EditorCanvas({
  draft,
  tool,
  kinds,
  onPaint,
  onRotate,
}: {
  draft: Draft;
  tool: Tool;
  kinds: Kinds;
  onPaint: (rect: Rect, erasing: boolean) => void;
  onRotate: () => void;
}): React.JSX.Element {
  const kindName = useKindName();
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<EditorScene | null>(null);
  const latest = useRef(draft);
  const held = useRef({ tool, kinds });
  // The scene is built asynchronously, so it reads the callback through a ref: an effect that assigns it
  // would have run while the scene was still null, and the first drag would have gone nowhere.
  const handler = useRef(onPaint);
  const turn = useRef(onRotate);
  const namer = useRef(kindName);
  useEffect(() => {
    latest.current = draft;
    scene.current?.setDraft(draft);
  }, [draft]);
  useEffect(() => {
    namer.current = kindName;
    scene.current?.setKindName(kindName);
  }, [kindName]);
  useEffect(() => {
    held.current = { tool, kinds };
    scene.current?.setTool(tool, kinds);
  }, [tool, kinds]);
  useEffect(() => {
    handler.current = onPaint;
    turn.current = onRotate;
  }, [onPaint, onRotate]);
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
      created.onPaint = (rect, erasing) => {
        handler.current(rect, erasing);
      };
      created.onRotate = () => {
        turn.current();
      };
      created.setTool(held.current.tool, held.current.kinds);
      created.setDraft(latest.current);
    });
    return () => {
      disposed = true;
      scene.current = null;
      created.destroy();
    };
  }, []);
  return <div ref={host} className="h-full w-full" />;
}
