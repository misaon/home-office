const MARKER = /^(?<indent>\s*)(?<bullet>[-*]|\d+[.)])\s+(?<rest>.*)$/u;

type Continued = { value: string; caret: number };

const INDENT = "  ";

const MAX_INPUT_HEIGHT = 168;

const reindent = (value: string, caret: number, deeper: boolean): Continued | null => {
  const before = value.slice(0, caret);
  const start = before.lastIndexOf("\n") + 1;
  const breakAt = value.indexOf("\n", caret);
  const line = value.slice(start, breakAt === -1 ? value.length : breakAt);
  if (MARKER.exec(line) === null) {
    return null;
  }
  if (deeper) {
    return {
      value: value.slice(0, start) + INDENT + value.slice(start),
      caret: caret + INDENT.length,
    };
  }
  if (!line.startsWith(INDENT)) {
    return null;
  }
  return {
    value: value.slice(0, start) + line.slice(INDENT.length) + value.slice(start + line.length),
    caret: Math.max(start, caret - INDENT.length),
  };
};

const continueList = (value: string, caret: number): Continued | null => {
  const before = value.slice(0, caret);
  const line = before.slice(before.lastIndexOf("\n") + 1);
  const found = MARKER.exec(line)?.groups;
  if (found === undefined) {
    return null;
  }
  const { indent = "", bullet = "", rest = "" } = found;
  if (rest.trim() === "") {
    const start = before.length - line.length;
    return { value: value.slice(0, start) + value.slice(caret), caret: start };
  }
  const next = /^\d/u.test(bullet)
    ? `${String(Math.trunc(Number(bullet)) + 1)}${bullet.slice(-1)} `
    : `${bullet} `;
  const insert = `\n${indent}${next}`;
  return { value: before + insert + value.slice(caret), caret: caret + insert.length };
};

const apply = (
  field: HTMLTextAreaElement,
  moved: Continued,
  write: (draft: string) => void,
): void => {
  write(moved.value);
  requestAnimationFrame(() => {
    field.setSelectionRange(moved.caret, moved.caret);
  });
};

export const onTab = (
  event: React.KeyboardEvent<HTMLTextAreaElement>,
  write: (draft: string) => void,
): void => {
  if (event.key !== "Tab") {
    return;
  }
  const field = event.currentTarget;
  const moved = reindent(field.value, field.selectionStart, !event.shiftKey);
  if (moved === null) {
    return;
  }
  event.preventDefault();
  apply(field, moved, write);
};

export const onEnter = (
  event: React.KeyboardEvent<HTMLTextAreaElement>,
  submit: () => void,
  write: (draft: string) => void,
): void => {
  if (event.key !== "Enter" || event.nativeEvent.isComposing) {
    return;
  }
  if (!event.shiftKey) {
    event.preventDefault();
    submit();
    return;
  }
  const field = event.currentTarget;
  const carried = continueList(field.value, field.selectionStart);
  if (carried === null) {
    return;
  }
  event.preventDefault();
  apply(field, carried, write);
};

export const fitToText = (box: HTMLTextAreaElement | null): void => {
  if (box === null) {
    return;
  }
  box.style.height = "auto";
  box.style.height = `${Math.min(box.scrollHeight, MAX_INPUT_HEIGHT)}px`;
};
