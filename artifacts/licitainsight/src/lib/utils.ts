import { extendTailwindMerge } from 'tailwind-merge';

import { clsx, type ClassValue } from 'clsx';

/**
 * tailwind-merge taught about the design-system utilities declared with @utility in index.css.
 * - `type-*` roles set the font size (plus line height, and sometimes weight/tracking), so they conflict with `text-<size>`
 *   and with each other: the last one wins. `type-data` only sets family and numerals, so it stays out of the group.
 * - `z-*` scale names join the z-index group, so `z-50` followed by `z-modal` keeps only `z-modal`.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ type: ['eyebrow', 'label', 'meta', 'ui', 'body', 'section', 'title', 'display-sm', 'display'] }],
      z: [{ z: ['raised', 'sticky', 'overlay', 'nav', 'modal', 'popover', 'toast'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
