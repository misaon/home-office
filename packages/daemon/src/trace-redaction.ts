export const SECRET_MIN_CHARS = 8;
const REDACTED = "***";

const CREDENTIAL_SHAPES: readonly RegExp[] = [
  /Bearer [A-Za-z0-9._~+/=-]{8,}/gu,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu,
  /\bsk-ant-[A-Za-z0-9_-]{8,}/gu,
  /\bsk-[A-Za-z0-9_-]{20,}/gu,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/gu,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/gu,
  /\bAKIA[0-9A-Z]{16}\b/gu,
  /\bAIza[0-9A-Za-z_-]{30,}/gu,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/gu,
  /\/\/[^\s/@"]+:[^\s/@"]+@/gu,
];

export const redactSecrets = (text: string, secrets: ReadonlySet<string>): string => {
  let redacted = text;
  for (const secret of secrets) {
    redacted = redacted.replaceAll(secret, REDACTED);
    redacted = redacted.replaceAll(JSON.stringify(secret).slice(1, -1), REDACTED);
  }
  for (const shape of CREDENTIAL_SHAPES) {
    redacted = redacted.replaceAll(shape, (match) =>
      match.startsWith("Bearer ")
        ? `Bearer ${REDACTED}`
        : match.startsWith("//")
          ? `//${REDACTED}@`
          : REDACTED,
    );
  }
  return redacted;
};
