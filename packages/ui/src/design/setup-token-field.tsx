import type { SecretKeyName } from "@ho/protocol";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { requireClient } from "../rpc.ts";
import { Button, FIELD, Failure } from "./controls.tsx";

/**
 * Pasting one secret, where the checklist needs it. A step that is already satisfied says so and offers
 * to replace it rather than leaving an open field behind.
 */
export function SecretField({
  secret,
  label,
  stored,
}: {
  secret: SecretKeyName;
  label: string;
  stored: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();
  const queries = useQueryClient();
  const [value, setValue] = useState("");
  const [replacing, setReplacing] = useState(false);

  const invalidate = (): void => {
    void queries.invalidateQueries({ queryKey: ["doctor"] });
    void queries.invalidateQueries({ queryKey: ["secrets-status"] });
  };
  const save = useMutation({
    mutationFn: () => requireClient().secrets.set({ key: secret, value: value.trim() }),
    onSuccess: () => {
      setValue("");
      setReplacing(false);
      invalidate();
    },
  });
  const forget = useMutation({
    mutationFn: () => requireClient().secrets.delete({ key: secret }),
    onSuccess: invalidate,
  });

  if (stored && !replacing) {
    return (
      <div className="flex items-center gap-9 flex-wrap">
        <span className="text-11h text-ink-meta flex-1 min-w-140">{t("tokens.storedNote")}</span>
        <Button
          onClick={() => {
            setReplacing(true);
          }}
        >
          {t("tokens.replaceAction")}
        </Button>
        <Button
          tone="danger"
          disabled={forget.isPending}
          onClick={() => {
            forget.mutate();
          }}
        >
          {t("tokens.forget")}
        </Button>
        <Failure error={forget.error} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-8 flex-wrap">
        <input
          type="password"
          value={value}
          aria-label={label}
          onChange={(e) => {
            setValue(e.target.value);
          }}
          placeholder={stored ? t("tokens.replace") : t("tokens.paste")}
          className={`${FIELD} flex-1 min-w-160 font-mono placeholder:text-ink-ghost`}
        />
        <Button
          tone="primary"
          disabled={value.trim() === "" || save.isPending}
          onClick={() => {
            save.mutate();
          }}
        >
          {t("common.save")}
        </Button>
      </div>
      <Failure error={save.error} />
    </div>
  );
}
