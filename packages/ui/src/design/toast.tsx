import { useDesign } from "./store.ts";

/** What just happened, said once and then gone. */
export function Toast(): React.JSX.Element | null {
  const toast = useDesign((s) => s.toast);
  if (toast === null) {
    return null;
  }
  return (
    <div className="fixed bottom-28 left-1/2 z-90 flex items-center gap-10 py-11 px-16 rounded-12 bg-toast border border-accent-a35 shadow-toast animate-toast">
      <span className="w-7 h-7 rounded-half bg-accent shadow-glow-gold flex-[0_0_auto]" />
      <span className="text-12h text-ink-warm">{toast}</span>
    </div>
  );
}
