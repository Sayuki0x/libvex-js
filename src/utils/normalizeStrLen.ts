export function normalizeStrLen(s: string, len: number) {
  while (s.length < len) {
    s += " ";
  }
  return s;
}
