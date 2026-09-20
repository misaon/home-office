import { useEffect, useRef, useState } from "react";

const STICK_WITHIN = 80;

type Left = { thread: string; growth: string };

export function useFollowLatest(
  thread: string,
  growth: string,
  scrollToBottom: () => void,
): { behind: boolean; onScroll: (element: HTMLDivElement) => void; jump: () => void } {
  const [left, setLeft] = useState<Left | null>(null);
  const byCode = useRef(false);
  const following = left === null || left.thread !== thread;

  useEffect(() => {
    if (following) {
      byCode.current = true;
      scrollToBottom();
    }
  }, [following, thread, growth, scrollToBottom]);

  const onScroll = (element: HTMLDivElement): void => {
    if (byCode.current) {
      byCode.current = false;
      return;
    }
    const near = element.scrollHeight - element.scrollTop - element.clientHeight < STICK_WITHIN;
    if (near) {
      setLeft(null);
    } else if (left === null || left.thread !== thread) {
      setLeft({ thread, growth });
    }
  };

  const jump = (): void => {
    setLeft(null);
    byCode.current = true;
    scrollToBottom();
  };

  return { behind: !following && left.growth !== growth, onScroll, jump };
}
