import type { TenderSearchParams } from '@/api';

/**
 * One-tap shortcuts for the deadline and value questions. They only write the URL parameters that already
 * existed (`deadlineFrom`/`deadlineTo`, `valueMin`/`valueMax`), so saved searches and old links keep working.
 */

export const toISODate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const addDays = (now: Date, days: number) => {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  return toISODate(date);
};

export const DEADLINE_PRESET_DAYS = [7, 15, 30] as const;

/** "Encerra em até N dias": from today to today + N, in the browser's calendar (same values as before the redesign). */
export function deadlinePresetPatch(days: number, now = new Date()): Pick<TenderSearchParams, 'deadlineFrom' | 'deadlineTo'> {
  return { deadlineFrom: toISODate(now), deadlineTo: addDays(now, days) };
}

/** The preset the current range matches, if any. */
export function activeDeadlinePreset(params: Pick<TenderSearchParams, 'deadlineFrom' | 'deadlineTo'>, now = new Date()): number | undefined {
  return DEADLINE_PRESET_DAYS.find((days) => {
    const preset = deadlinePresetPatch(days, now);
    return params.deadlineFrom === preset.deadlineFrom && params.deadlineTo === preset.deadlineTo;
  });
}

export type ValuePreset = { id: string; valueMin?: number; valueMax?: number };

export const VALUE_PRESETS: ValuePreset[] = [
  { id: 'ate-50-mil', valueMax: 50_000 },
  { id: '50-a-500-mil', valueMin: 50_000, valueMax: 500_000 },
  { id: 'acima-500-mil', valueMin: 500_000 },
];

export const valuePresetPatch = (preset: ValuePreset): Pick<TenderSearchParams, 'valueMin' | 'valueMax'> => ({
  valueMin: preset.valueMin,
  valueMax: preset.valueMax,
});

export function activeValuePreset(params: Pick<TenderSearchParams, 'valueMin' | 'valueMax'>): ValuePreset | undefined {
  return VALUE_PRESETS.find((preset) => preset.valueMin === params.valueMin && preset.valueMax === params.valueMax);
}
