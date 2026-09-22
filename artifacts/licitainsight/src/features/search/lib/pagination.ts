export type PageItem = number | 'ellipsis-start' | 'ellipsis-end';

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => from + index);

/**
 * 1 2 3 4 5 … 20 · 1 … 9 10 11 … 20 · 1 … 16 17 18 19 20
 * Always first/last and the current page ± `siblings`; the number of slots stays constant so the control doesn't jump.
 */
export function pageItems(page: number, totalPages: number, siblings = 1): PageItem[] {
  const total = Math.max(1, totalPages);
  const slots = siblings * 2 + 5;
  if (total <= slots) return range(1, total);
  const left = Math.max(page - siblings, 1);
  const right = Math.min(page + siblings, total);
  const showLeftDots = left > 3;
  const showRightDots = right < total - 2;
  const edgeCount = 3 + siblings * 2;
  if (!showLeftDots) return [...range(1, edgeCount), 'ellipsis-end', total];
  if (!showRightDots) return [1, 'ellipsis-start', ...range(total - edgeCount + 1, total)];
  return [1, 'ellipsis-start', ...range(left, right), 'ellipsis-end', total];
}
