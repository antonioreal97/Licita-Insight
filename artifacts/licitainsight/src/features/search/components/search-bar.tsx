import { useEffect, useState, type FormEvent } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/common/action-button';

type Props = { value: string; onSubmit: (q: string) => void };

/** Draft text is local; it's committed to the URL only on submit. */
export function SearchBar({ value, onSubmit }: Props) {
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit(draft.trim());
  };

  return (
    <form role="search" onSubmit={submit} className="flex gap-2">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={17} />
        <input
          type="search"
          aria-label="Pesquisar licitações"
          data-testid="input-search-tenders"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ex.: tecnologia educacional, prefeitura de Recife..."
          className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-4 text-sm outline-none ring-primary/20 placeholder:text-muted-foreground focus:ring-2"
        />
      </div>
      <Button type="submit" className="h-11 px-5">
        Pesquisar
      </Button>
    </form>
  );
}
