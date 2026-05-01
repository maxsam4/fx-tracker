export function median(values: number[]): number {
  if (values.length === 0) throw new Error('median of empty array');
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

export function pctDelta(value: number, anchor: number): number {
  if (anchor === 0) return 0;
  return ((value - anchor) / anchor) * 100;
}
