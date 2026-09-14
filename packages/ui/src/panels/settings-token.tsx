import type { SecretKeyName } from "@ho/protocol";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Failure } from "../kit/controls.tsx";
import { doctorQuery, secretsStatusQuery } from "../queries.ts";
import { requireClient } from "../rpc.ts";
import { Button as ShadcnButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * A password field with Save, and Forget once the secret is stored; the setup checklist and Settings share
 * it. The value never leaves the field except in the RPC, and the doctor and secret status refresh after.
 */
export function SecretField({
  secret,
  label,
  stored,
  compact = false,
}: {
  secret: SecretKeyName;
  label: string;
  stored: boolean;
  /** A finished checklist step says it is finished; it does not leave the field open behind it. */
  compact?: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [replacing, setReplacing] = useState(false);
  const queries = useQueryClient();
  const [value, setValue] = useState("");
  const changed = (): Promise<void> =>
    Promise.all([
      queries.invalidateQueries({ queryKey: secretsStatusQuery.queryKey }),
      queries.invalidateQueries({ queryKey: doctorQuery.queryKey }),
    ]).then(() => undefined);
  const store = useMutation({
    mutationFn: (token: string) => requireClient().secrets.set({ key: secret, value: token }),
    onSuccess: () => {
      setValue("");
      return changed();
    },
  });
  const forget = useMutation({
    mutationFn: () => requireClient().secrets.delete({ key: secret }),
    onSuccess: changed,
  });
  const save = (): void => {
    const token = value.trim();
    if (token !== "") {
      store.mutate(token);
    }
  };
  if (compact && stored && !replacing) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-2xs text-muted-foreground">{t("tokens.storedNote")}</span>
        <ShadcnButton
          type="button"
          variant="ghost"
          size="xs"
          className="ml-auto"
          onClick={() => {
            setReplacing(true);
          }}
        >
          {t("tokens.replaceAction")}
        </ShadcnButton>
        <ShadcnButton
          type="button"
          variant="ghost"
          size="xs"
          disabled={forget.isPending}
          onClick={() => {
            forget.mutate();
          }}
        >
          {t("tokens.forget")}
        </ShadcnButton>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          type="password"
          aria-label={label}
          autoComplete="off"
          className="font-mono"
          placeholder={stored ? t("tokens.replace") : t("tokens.paste")}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              save();
            }
          }}
        />
        <Button variant="primary" disabled={store.isPending} onClick={save}>
          {t("common.save")}
        </Button>
        {stored ? (
          <Button
            disabled={forget.isPending}
            onClick={() => {
              forget.mutate();
            }}
          >
            {t("tokens.forget")}
          </Button>
        ) : null}
      </div>
      <Failure error={store.error ?? forget.error} />
    </div>
  );
}
