export interface DiffPart { type: "same" | "add" | "del"; text: string }

/** Word-level diff (LCS) between an AI draft and the clinician's final text. */
export function diffWords(before: string, after: string): DiffPart[] {
  const a = before.split(/(\s+)/).filter(Boolean);
  const b = after.split(/(\s+)/).filter(Boolean);
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);

  const out: DiffPart[] = [];
  const push = (type: DiffPart["type"], text: string) => {
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += text;
    else out.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { push("same", a[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { push("del", a[i]); i++; }
    else { push("add", b[j]); j++; }
  }
  while (i < n) push("del", a[i++]);
  while (j < m) push("add", b[j++]);
  return out;
}
