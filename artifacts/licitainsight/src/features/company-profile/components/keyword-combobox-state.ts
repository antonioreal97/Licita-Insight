export function moveComboboxIndex(current: number, key: 'ArrowDown' | 'ArrowUp', length: number): number {
  if (length <= 0) return -1;
  if (key === 'ArrowDown') return current < length - 1 ? current + 1 : 0;
  return current > 0 ? current - 1 : length - 1;
}
