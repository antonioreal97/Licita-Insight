import { useState } from 'react';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  saved: boolean;
  onToggle: () => void;
  /** id of the element naming the tender (row title). */
  describedBy?: string;
  testId: string;
  iconSize?: number;
  className?: string;
};

/**
 * Icon-only bookmark toggle for result rows and the table. After a click the new icon scales 0.9 → 1
 * (duration-fast, ease-emphasized, no bounce) and an aria-live note announces the change — never on mount.
 */
export function SaveButton({ saved, onToggle, describedBy, testId, iconSize = 17, className }: Props) {
  const [toggled, setToggled] = useState(false);
  const label = saved ? 'Remover dos salvos' : 'Salvar edital';
  const Icon = saved ? BookmarkCheck : Bookmark;
  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-describedby={describedBy}
        aria-pressed={saved}
        title={label}
        data-testid={testId}
        onClick={() => {
          setToggled(true);
          onToggle();
        }}
        className={cn(
          'grid place-items-center rounded-lg transition-[background-color,color,scale] duration-fast ease-standard hover:bg-muted active:scale-[0.98]',
          saved ? 'text-primary' : 'text-muted-foreground hover:text-primary',
          className,
        )}
      >
        <Icon key={String(saved)} size={iconSize} aria-hidden="true" className={cn(toggled && 'animate-in zoom-in-90 duration-fast ease-emphasized')} />
      </button>
      <span className="sr-only" aria-live="polite">
        {toggled ? (saved ? 'Edital salvo' : 'Edital removido dos salvos') : ''}
      </span>
    </>
  );
}
