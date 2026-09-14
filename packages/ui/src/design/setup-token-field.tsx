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
      <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "11.5px", color: "#A6A39C", flex: "1", minWidth: "140px" }}>
          {t("tokens.storedNote")}
        </span>
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
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <input
          type="password"
          value={value}
          aria-label={label}
          onChange={(e) => {
            setValue(e.target.value);
          }}
          placeholder={stored ? t("tokens.replace") : t("tokens.paste")}
          style={{
            ...FIELD,
            flex: "1",
            minWidth: "160px",
            fontFamily: "'JetBrains Mono',monospace",
          }}
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
