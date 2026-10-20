/**
 * The board's columns scroll sideways inside one region; nothing else on the page may scroll horizontally.
 * `scrollIntoView()` and a plain `focus()` scroll every scrollable ancestor, so the board never calls them: it focuses with
 * `preventScroll` and moves the region itself (and only the window, vertically) with these helpers.
 */

type Box = { left: number; right: number; top: number; bottom: number };

export type ScrollRegion = {
  scrollLeft: number;
  clientWidth: number;
  getBoundingClientRect(): Box;
  scrollTo(options: { left: number; behavior?: ScrollBehavior }): void;
};

export type RevealTarget = { getBoundingClientRect(): Box };

export type FocusTarget = { focus(options?: { preventScroll?: boolean }): void };

/** The window, only for the vertical axis. */
export type VerticalViewport = { innerHeight: number; scrollBy(options: { top: number; behavior?: ScrollBehavior }): void };

export type RevealOptions = {
  /** `start`: the target's left edge to the region's left edge ("Ir para a etapa"); `nearest`: the least movement (focus). */
  align: 'start' | 'nearest';
  behavior?: ScrollBehavior;
  /** Room kept between the target and the region's edges: the region's padding, so focus rings are not clipped. */
  inset?: number;
  /** Height covered at the top of the window (sticky header). */
  topInset?: number;
};

/** `scrollLeft` that brings `target` into the region; the region's current value when it is already in view (`nearest`). */
export function regionScrollLeft(region: Pick<ScrollRegion, 'scrollLeft' | 'clientWidth'> & { left: number }, target: { left: number; right: number }, align: RevealOptions['align'], inset = 0): number {
  const left = target.left - region.left + region.scrollLeft - inset;
  if (align === 'start') return Math.max(0, Math.round(left));
  const right = target.right - region.left + region.scrollLeft + inset;
  if (left < region.scrollLeft) return Math.max(0, Math.round(left));
  if (right > region.scrollLeft + region.clientWidth) return Math.max(0, Math.round(Math.min(left, right - region.clientWidth)));
  return region.scrollLeft;
}

/** Vertical offset for the window so `target` is visible below the sticky header; 0 when it already is. */
export function windowScrollTop(target: { top: number; bottom: number }, viewportHeight: number, topInset = 0): number {
  if (target.top < topInset) return Math.round(target.top - topInset);
  if (target.bottom > viewportHeight) return Math.round(Math.min(target.bottom - viewportHeight, target.top - topInset));
  return 0;
}

/** Scrolls the region (horizontally) and the window (vertically) so `target` shows. No other element is touched. */
export function revealInRegion(region: ScrollRegion, target: RevealTarget, viewport: VerticalViewport | null, { align, behavior = 'auto', inset = 0, topInset = 0 }: RevealOptions) {
  const box = region.getBoundingClientRect();
  const left = regionScrollLeft({ scrollLeft: region.scrollLeft, clientWidth: region.clientWidth, left: box.left }, target.getBoundingClientRect(), align, inset);
  if (left !== region.scrollLeft) region.scrollTo({ left, behavior });
  if (!viewport) return;
  const top = windowScrollTop(target.getBoundingClientRect(), viewport.innerHeight, topInset);
  if (top !== 0) viewport.scrollBy({ top, behavior });
}

/** Focus without letting the browser scroll ancestors, then reveal `target` through the region only. */
export function focusInRegion(region: ScrollRegion, target: RevealTarget, focusable: FocusTarget, viewport: VerticalViewport | null, options: RevealOptions) {
  focusable.focus({ preventScroll: true });
  revealInRegion(region, target, viewport, options);
}
