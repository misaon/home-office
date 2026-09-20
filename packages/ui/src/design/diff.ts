export type DiffLine = {
  kind: "same" | "add" | "del";
  text: string;
  oldNo: number | null;
  newNo: number | null;
};

export type Diff = { lines: DiffLine[]; added: number; removed: number; complete: boolean };

type Op = { kind: DiffLine["kind"]; oldIndex: number; newIndex: number };

const EDIT_CAP = 1500;

const splitLines = (text: string): string[] => {
  const lines = text.split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }
  return lines;
};

function shortestEdit(a: readonly string[], b: readonly string[]): Int32Array[] | null {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const v = new Int32Array(2 * max + 3);
  const at = (k: number): number => k + max + 1;
  v[at(1)] = 0;
  const trace: Int32Array[] = [];
  for (let d = 0; d <= max; d += 1) {
    if (d > EDIT_CAP) {
      return null;
    }
    trace.push(v.slice(at(-d - 1), at(d + 1) + 1));
    for (let k = -d; k <= d; k += 2) {
      const down = k === -d || (k !== d && (v[at(k - 1)] ?? 0) < (v[at(k + 1)] ?? 0));
      let x = down ? (v[at(k + 1)] ?? 0) : (v[at(k - 1)] ?? 0) + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x += 1;
        y += 1;
      }
      v[at(k)] = x;
      if (x >= n && y >= m) {
        return trace;
      }
    }
  }
  return trace;
}

function backtrack(trace: readonly Int32Array[], n: number, m: number): Op[] {
  const ops: Op[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0; d -= 1) {
    const v = trace[d];
    if (v === undefined) {
      break;
    }
    const at = (k: number): number => k + d + 1;
    const k = x - y;
    const down = k === -d || (k !== d && (v[at(k - 1)] ?? 0) < (v[at(k + 1)] ?? 0));
    const previousK = down ? k + 1 : k - 1;
    const previousX = v[at(previousK)] ?? 0;
    const previousY = previousX - previousK;
    while (x > previousX && y > previousY) {
      ops.push({ kind: "same", oldIndex: x - 1, newIndex: y - 1 });
      x -= 1;
      y -= 1;
    }
    if (d > 0) {
      ops.push(
        x === previousX
          ? { kind: "add", oldIndex: -1, newIndex: previousY }
          : { kind: "del", oldIndex: previousX, newIndex: -1 },
      );
    }
    x = previousX;
    y = previousY;
  }
  return ops.toReversed();
}

const replaceAll = (n: number, m: number): Op[] => [
  ...Array.from({ length: n }, (_, index): Op => ({ kind: "del", oldIndex: index, newIndex: -1 })),
  ...Array.from({ length: m }, (_, index): Op => ({ kind: "add", oldIndex: -1, newIndex: index })),
];

function diffLines(before: string | null, after: string): Diff {
  const a = before === null ? [] : splitLines(before);
  const b = splitLines(after);
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) {
    head += 1;
  }
  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) {
    tail += 1;
  }
  const middleA = a.slice(head, a.length - tail);
  const middleB = b.slice(head, b.length - tail);
  const trace = shortestEdit(middleA, middleB);
  const middle =
    trace === null
      ? replaceAll(middleA.length, middleB.length)
      : backtrack(trace, middleA.length, middleB.length);
  const lines: DiffLine[] = [];
  let added = 0;
  let removed = 0;
  for (let index = 0; index < head; index += 1) {
    lines.push({ kind: "same", text: a[index] ?? "", oldNo: index + 1, newNo: index + 1 });
  }
  for (const op of middle) {
    if (op.kind === "same") {
      const oldNo = head + op.oldIndex;
      const newNo = head + op.newIndex;
      lines.push({ kind: "same", text: a[oldNo] ?? "", oldNo: oldNo + 1, newNo: newNo + 1 });
    } else if (op.kind === "add") {
      const newNo = head + op.newIndex;
      added += 1;
      lines.push({ kind: "add", text: b[newNo] ?? "", oldNo: null, newNo: newNo + 1 });
    } else {
      const oldNo = head + op.oldIndex;
      removed += 1;
      lines.push({ kind: "del", text: a[oldNo] ?? "", oldNo: oldNo + 1, newNo: null });
    }
  }
  for (let index = 0; index < tail; index += 1) {
    const oldNo = a.length - tail + index;
    const newNo = b.length - tail + index;
    lines.push({ kind: "same", text: a[oldNo] ?? "", oldNo: oldNo + 1, newNo: newNo + 1 });
  }
  return { lines, added, removed, complete: trace !== null };
}

const CONTEXT = 3;

export type DiffRow = DiffLine | { kind: "gap"; hidden: number };

export function hunksOf(lines: readonly DiffLine[]): DiffRow[] {
  const keep = new Uint8Array(lines.length);
  for (const [index, line] of lines.entries()) {
    if (line.kind !== "same") {
      for (
        let near = Math.max(0, index - CONTEXT);
        near <= Math.min(lines.length - 1, index + CONTEXT);
        near += 1
      ) {
        keep[near] = 1;
      }
    }
  }
  const rows: DiffRow[] = [];
  let hidden = 0;
  for (const [index, line] of lines.entries()) {
    if (keep[index] === 1) {
      if (hidden > 0) {
        rows.push({ kind: "gap", hidden });
        hidden = 0;
      }
      rows.push(line);
    } else {
      hidden += 1;
    }
  }
  if (hidden > 0) {
    rows.push({ kind: "gap", hidden });
  }
  return rows;
}

const cache = new WeakMap<object, Diff>();

export const diffOf = (change: { before: string | null; after: string }): Diff => {
  const known = cache.get(change);
  if (known !== undefined) {
    return known;
  }
  const computed = diffLines(change.before, change.after);
  cache.set(change, computed);
  return computed;
};
