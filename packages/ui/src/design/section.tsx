/** A titled block inside the internal office editor's drawer. */
export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div>
      <div
        style={{
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: "10px",
          letterSpacing: ".16em",
          textTransform: "uppercase",
          color: "#ABA8A1",
          marginBottom: "10px",
        }}
      >
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "11px" }}>{children}</div>
    </div>
  );
}
