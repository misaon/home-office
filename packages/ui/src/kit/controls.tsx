import { errorMessage } from "@ho/protocol";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge as ShadcnBadge } from "@/components/ui/badge";
import { Button as ShadcnButton } from "@/components/ui/button";
import { Field as ShadcnField, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * The office's own vocabulary, spoken in shadcn/ui. Every element below is one of its components; what
 * lives here is the office's names for them — the words the panels already use — and the two or three
 * arrangements a panel repeats, such as a switch with its consequence written beside it.
 */

const VARIANT = {
  primary: "default",
  quiet: "outline",
  ghost: "ghost",
  danger: "destructive",
} as const;

export function Button({
  children,
  onClick,
  variant = "quiet",
  disabled = false,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: keyof typeof VARIANT;
  disabled?: boolean;
  title?: string;
}): React.JSX.Element {
  return (
    <ShadcnButton
      type="button"
      variant={VARIANT[variant]}
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      {children}
    </ShadcnButton>
  );
}

/** A labelled control with room around it: the label, the control, then one line of help or error. */
export function Field({
  id,
  label,
  hint,
  tone = "muted",
  children,
}: {
  id: string;
  label: string;
  hint?: React.ReactNode;
  tone?: "muted" | "error";
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <ShadcnField>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children}
      {hint === undefined ? null : (
        <FieldDescription className={tone === "error" ? "text-destructive" : ""}>
          {hint}
        </FieldDescription>
      )}
    </ShadcnField>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}): React.JSX.Element {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => {
        const picked = options.find((option) => option.value === next);
        if (picked !== undefined) {
          onChange(picked.value);
        }
      }}
    >
      <TabsList>
        {options.map((option) => (
          <TabsTrigger key={option.value} value={option.value}>
            {option.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

/** A section of a panel: an uppercase heading and its rows, separated from what came before. */
export function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <h3 className="text-2xs font-semibold tracking-widest text-muted-foreground uppercase">
          {title}
        </h3>
        <Separator className="flex-1" />
        {aside}
      </div>
      {children}
    </section>
  );
}

const TONE = {
  neutral: "secondary",
  accent: "default",
  good: "good",
  warn: "warn",
  bad: "destructive",
} as const;

/** A count or a state, said in one word. */
export function Badge({
  children,
  tone = "neutral",
  title,
}: {
  children: React.ReactNode;
  tone?: keyof typeof TONE;
  title?: string;
}): React.JSX.Element {
  const shade = TONE[tone];
  return (
    <ShadcnBadge
      variant={shade === "good" || shade === "warn" ? "outline" : shade}
      title={title}
      className={shade === "good" ? "text-good" : shade === "warn" ? "text-warn" : ""}
    >
      {children}
    </ShadcnBadge>
  );
}

/** What a failed request said, or nothing while there is nothing to say. */
export function Failure({ error }: { error: unknown }): React.JSX.Element | null {
  return error === null || error === undefined ? null : (
    <Alert variant="destructive">
      <AlertDescription>{errorMessage(error)}</AlertDescription>
    </Alert>
  );
}
