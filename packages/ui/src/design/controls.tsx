import { errorMessage } from "@ho/protocol";
import { MONO } from "./tokens.ts";

/**
 * The handful of controls the office's dialogs need, in the drawing's own language. The panels style
 * their buttons inline because each is drawn once; these exist because the setup checklist and the
 * add-project dialog repeat the same three shapes many times over.
 */

const BASE: React.CSSProperties = {
  borderRadius: "10px",
  fontSize: "12.5px",
  cursor: "pointer",
  whiteSpace: "nowrap",
  transition: "all .22s",
  padding: "9px 15px",
};

export type Tone = "primary" | "quiet" | "danger";

const TONES: Record<Tone, React.CSSProperties> = {
  primary: { border: "0", background: "var(--a,#FFC531)", color: "#150F02", fontWeight: "600" },
  quiet: { border: "1px solid #2C2C32", background: "transparent", color: "#CFCCC6" },
  danger: {
    border: "1px solid rgba(255,122,122,.3)",
    background: "rgba(255,122,122,.1)",
    color: "#FFB3B3",
  },
};

const HOVER: Record<Tone, string> = { primary: "hopm", quiet: "hop3", danger: "hopp" };

export function Button({
  tone = "quiet",
  children,
  ...rest
}: { tone?: Tone } & React.ButtonHTMLAttributes<HTMLButtonElement>): React.JSX.Element {
  return (
    <button type="button" {...rest} style={{ ...BASE, ...TONES[tone] }} className={HOVER[tone]}>
      {children}
    </button>
  );
}

export const FIELD: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: "10px",
  border: "1px solid #2C2C32",
  background: "#0A0A0C",
  fontSize: "12.5px",
};

/** The small upper-case caption every form field is labelled with. */
export function Caption({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div
      style={{
        ...MONO,
        fontSize: "10px",
        letterSpacing: ".12em",
        textTransform: "uppercase",
        color: "#ABA8A1",
        marginBottom: "7px",
      }}
    >
      {children}
    </div>
  );
}

/** What went wrong, said where it went wrong, in the one colour the design keeps for it. */
export function Failure({ error }: { error: unknown }): React.JSX.Element | null {
  if (error === null || error === undefined) {
    return null;
  }
  return (
    <div
      style={{
        marginTop: "10px",
        padding: "9px 11px",
        borderRadius: "10px",
        border: "1px solid rgba(255,122,122,.3)",
        background: "rgba(255,122,122,.08)",
        color: "#FFB3B3",
        fontSize: "11.5px",
        lineHeight: "1.6",
        animation: "riseIn .28s ease both",
      }}
    >
      {errorMessage(error)}
    </div>
  );
}
