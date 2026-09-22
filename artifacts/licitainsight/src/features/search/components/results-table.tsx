import { Link } from 'wouter';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import type { TenderSummary } from '@/api';
import { formatCurrency, formatDate } from '@/lib/format';
import { StatusBadge } from '@/features/tenders/components/status-badge';

type Props = { tenders: TenderSummary[]; isSaved: (id: string) => boolean; onToggleSave: (id: string) => void };

export function ResultsTable({ tenders, isSaved, onToggleSave }: Props) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-border bg-muted/50 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-5 py-3">Edital</th>
            <th className="px-4 py-3">Órgão</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Valor estimado</th>
            <th className="px-4 py-3">Abertura</th>
            <th>
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {tenders.map((t) => {
            const saved = isSaved(t.id);
            return (
              <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                <td className="max-w-[330px] px-5 py-4">
                  <Link href={`/tenders/${t.id}`} className="line-clamp-2 font-semibold hover:text-primary">
                    {t.title}
                  </Link>
                  {t.tenderNumber && <div className="mt-1 font-mono text-[10px] text-muted-foreground">{t.tenderNumber}</div>}
                </td>
                <td className="px-4 py-4 text-muted-foreground">{t.organization.name}</td>
                <td className="px-4 py-4">
                  <StatusBadge status={t.status} />
                </td>
                <td className="whitespace-nowrap px-4 py-4 font-mono font-bold">{formatCurrency(t.estimatedValue)}</td>
                <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">{formatDate(t.openingAt)}</td>
                <td className="px-4 py-4">
                  <button
                    aria-label={saved ? 'Remover dos salvos' : 'Salvar edital'}
                    aria-pressed={saved}
                    data-testid={`button-table-save-${t.id}`}
                    onClick={() => onToggleSave(t.id)}
                    className="text-muted-foreground hover:text-primary"
                  >
                    {saved ? <BookmarkCheck size={16} className="text-primary" /> : <Bookmark size={16} />}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
