import type { FacetBucket } from '@/api';

type Props = {
  label: string;
  allLabel: string;
  buckets: FacetBucket[];
  selected: string[];
  onChange: (values: string[]) => void;
  className?: string;
  testId?: string;
};

/**
 * Single-choice facet select (parity with the previous UI).
 * Search UX Specialist will replace this with a multi-select facet panel; the params already support arrays.
 */
export function FacetSelect({ label, allLabel, buckets, selected, onChange, className = '', testId }: Props) {
  const value = selected[0] ?? '';
  // Keep a selected value visible even if the current result set has zero hits for it.
  const options = value && !buckets.some((b) => b.value === value) ? [...buckets, { value, label: value, count: 0 }] : buckets;
  return (
    <select
      aria-label={label}
      data-testid={testId}
      value={value}
      onChange={(e) => onChange(e.target.value ? [e.target.value] : [])}
      className={`h-9 rounded-lg border border-input bg-background px-3 text-xs outline-none focus:ring-2 focus:ring-primary/30 ${className}`}
    >
      <option value="">{allLabel}</option>
      {options.map((bucket) => (
        <option key={bucket.value} value={bucket.value}>
          {bucket.label} ({bucket.count})
        </option>
      ))}
    </select>
  );
}
