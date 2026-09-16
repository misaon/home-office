export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div>
      <div className="font-mono text-10 tracking-caps-wider uppercase text-ink-label mb-10">
        {title}
      </div>
      <div className="flex flex-col gap-11">{children}</div>
    </div>
  );
}
