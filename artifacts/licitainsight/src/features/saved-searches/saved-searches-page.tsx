import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowRight, BookmarkPlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { isApiError, type SavedSearch } from '@/api';
import { Button } from '@/components/common/action-button';
import { PageTitle } from '@/components/common/page-title';
import { ErrorState } from '@/components/common/query-states';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import { ToastAction } from '@/components/ui/toast';
import { toast } from '@/hooks/use-toast';
import { SearchSummary } from '@/features/search/components/search-summary';
import { savedQueryHref } from '@/features/search/lib/search-defaults';
import { formatDateTime, formatNumber } from '@/lib/format';
import { searchParamsFromUrl } from '@/services/search-service';
import { useDeleteSavedSearch, useMarkSavedSearchSeen, useRestoreSavedSearch, useSavedSearches, useUpdateSavedSearch } from './hooks/use-saved-searches';

const primaryLinkClass =
  'inline-flex h-9 shrink-0 items-center gap-2 rounded-pill bg-action px-3.5 type-ui font-semibold text-action-foreground shadow-xs transition-[background-color,scale] duration-fast ease-standard hover:bg-action-hover active:scale-[0.98] active:bg-action-active focus-visible:focus-ring';

function errorDescription(error: unknown) {
  if (isApiError(error) && error.code === 'CONFLICT') return 'Você atingiu o limite de 50 buscas salvas.';
  if (isApiError(error) && error.code === 'INVALID_PARAMETER') return 'Use um nome de 1 a 80 caracteres.';
  if (isApiError(error) && error.code === 'NETWORK_ERROR') return 'Sem conexão com o servidor. Tente de novo.';
  return isApiError(error) && error.requestId ? `Tente de novo. ref. ${error.requestId}` : 'Tente de novo.';
}

function restoreErrorToast(error: unknown) {
  if (isApiError(error) && error.detail('restore_expired')) return { title: 'Não é mais possível desfazer (o prazo de 30 s passou)' };
  const description = isApiError(error) && error.detail('duplicate') ? 'Já existe outra busca salva com os mesmos filtros.' : errorDescription(error);
  return { title: 'Não foi possível restaurar a busca', description };
}

function ListSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Carregando buscas salvas" className="overflow-hidden rounded-xl border border-border bg-card">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} aria-hidden className="flex items-start justify-between gap-4 border-b border-border-subtle px-4 py-4 last:border-0 sm:px-5">
          <div className="min-w-0 flex-1">
            <div className="h-4 w-1/3 animate-pulse rounded-sm bg-muted" />
            <div className="mt-2.5 flex gap-1.5">
              <div className="h-5 w-24 animate-pulse rounded-full bg-muted" />
              <div className="h-5 w-20 animate-pulse rounded-full bg-muted" />
            </div>
            <div className="mt-2.5 h-3 w-40 animate-pulse rounded-sm bg-muted" />
          </div>
          <div className="h-9 w-28 animate-pulse rounded-lg bg-muted" />
        </div>
      ))}
    </div>
  );
}

export default function SavedSearchesPage() {
  const list = useSavedSearches();
  const restore = useRestoreSavedSearch();
  const remove = useDeleteSavedSearch();
  const [toDelete, setToDelete] = useState<SavedSearch | null>(null);
  // `/saved-searches#saved-search-<id>` (from "Você já salvou esta busca"): scroll to that row and highlight it once the list loads.
  const [targetId] = useState(() => window.location.hash.slice(1));
  const loaded = list.data !== undefined;
  useEffect(() => {
    if (loaded && targetId) document.getElementById(targetId)?.scrollIntoView({ block: 'center' });
  }, [loaded, targetId]);

  const confirmDelete = () => {
    if (!toDelete) return;
    const search = toDelete;
    remove.mutate(search.id, {
      onSuccess: () => {
        setToDelete(null);
        toast({
          title: `“${search.name}” excluída`,
          action: (
            // Restore keeps the id and history; the API allows it for 30 s after the delete.
            <ToastAction
              altText="Desfazer exclusão"
              data-testid="button-undo-delete-saved-search"
              onClick={() =>
                restore.mutate(search.id, {
                  onError: (error) => {
                    console.error('[saved-searches] Falha ao desfazer exclusão.', error);
                    toast({ variant: 'destructive', ...restoreErrorToast(error) });
                  },
                })
              }
            >
              Desfazer
            </ToastAction>
          ),
        });
      },
      onError: (error) => console.error('[saved-searches] Falha ao excluir.', error),
    });
  };

  const count = list.data?.data.length ?? 0;

  return (
    <>
      <PageTitle
        title="Buscas salvas"
        description="Consultas que você escolheu acompanhar. Com alertas ligados, avisamos aqui no app quando a coleta diária traz editais novos."
        action={
          <Link href="/search" data-testid="button-new-saved-search" className={`${primaryLinkClass} self-start sm:self-auto`}>
            <Plus size={15} aria-hidden="true" />
            Nova busca
          </Link>
        }
      />
      {list.isPending ? (
        <ListSkeleton />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : count === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong bg-card px-6 py-14 text-center" data-testid="empty-saved-searches">
          <BookmarkPlus size={18} aria-hidden className="mx-auto text-foreground-subtle" />
          <h2 className="mt-3 type-ui font-semibold text-foreground">Nenhuma busca salva</h2>
          <p className="mx-auto mt-1 max-w-sm type-meta text-muted-foreground">
            Faça uma busca, aplique os filtros que importam e use “Salvar busca” para receber alertas de editais novos.
          </p>
          <Link href="/search" data-testid="link-empty-saved-searches-search" className={`${primaryLinkClass} mt-4`}>
            Explorar editais
          </Link>
        </div>
      ) : (
        <>
          <p aria-live="polite" className="mb-3 type-meta text-muted-foreground" data-testid="text-saved-searches-count">
            {count} {count === 1 ? 'busca salva' : 'buscas salvas'} de 50
            {list.isFetching && ' · atualizando…'}
          </p>
          <ul className="overflow-hidden rounded-xl border border-border bg-card">
            {list.data.data.map((search) => (
              <SavedSearchRow
                key={search.id}
                search={search}
                highlighted={targetId === `saved-search-${search.id}`}
                onDelete={() => {
                  remove.reset();
                  setToDelete(search);
                }}
              />
            ))}
          </ul>
        </>
      )}

      <AlertDialog open={toDelete !== null} onOpenChange={(open) => !open && !remove.isPending && setToDelete(null)}>
        <AlertDialogContent data-testid="dialog-delete-saved-search">
          <AlertDialogHeader>
            <AlertDialogTitle className="type-title">Excluir “{toDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription className="type-body text-muted-foreground">
              A busca sai da lista e deixa de gerar alertas. Os editais continuam no banco.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {remove.isError && (
            <p
              role="alert"
              className="rounded-lg border border-destructive-subtle-border bg-destructive-subtle px-3 py-2 type-meta text-destructive-subtle-foreground"
            >
              Não foi possível excluir. {errorDescription(remove.error)}
            </p>
          )}
          <AlertDialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setToDelete(null)} disabled={remove.isPending} data-testid="button-cancel-delete-saved-search">
              Cancelar
            </Button>
            <Button variant="destructive" loading={remove.isPending} onClick={confirmDelete} data-testid="button-confirm-delete-saved-search">
              Excluir busca
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function SavedSearchRow({ search, highlighted, onDelete }: { search: SavedSearch; highlighted: boolean; onDelete: () => void }) {
  const [, navigate] = useLocation();
  const update = useUpdateSavedSearch();
  const markSeen = useMarkSavedSearchSeen();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(search.name);
  const nameId = `saved-search-name-${search.id}`;

  const open = () => {
    if (search.newMatchesCount > 0)
      markSeen.mutate(search.id, { onError: (error) => console.error('[saved-searches] Falha ao marcar a busca como vista.', error) });
    navigate(savedQueryHref(search.query));
  };

  const rename = (event: FormEvent) => {
    event.preventDefault();
    const next = name.trim();
    if (next === search.name) return setEditing(false);
    update.mutate(
      { id: search.id, name: next },
      {
        onSuccess: () => setEditing(false),
        onError: (error) => console.error('[saved-searches] Falha ao renomear.', error),
      },
    );
  };

  const toggleAlerts = (alertsEnabled: boolean) =>
    update.mutate(
      { id: search.id, alertsEnabled },
      {
        onError: (error) => {
          console.error('[saved-searches] Falha ao alterar alertas.', error);
          toast({
            variant: 'destructive',
            title: alertsEnabled ? 'Não foi possível ligar os alertas' : 'Não foi possível desligar os alertas',
            description: errorDescription(error),
          });
        },
      },
    );

  return (
    <li
      id={`saved-search-${search.id}`}
      aria-labelledby={nameId}
      data-testid={`row-saved-search-${search.id}`}
      data-highlighted={highlighted || undefined}
      className="flex flex-col gap-4 border-b border-border-subtle px-4 py-4 last:border-0 data-highlighted:bg-primary-subtle sm:flex-row sm:items-start sm:justify-between sm:px-5"
    >
      <div className="min-w-0 flex-1">
        {editing ? (
          <form onSubmit={rename} className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor={`${nameId}-input`}>
              Nome da busca
            </label>
            <input
              id={`${nameId}-input`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setName(search.name);
                  setEditing(false);
                  update.reset();
                }
              }}
              maxLength={80}
              autoFocus
              aria-invalid={update.isError || name.trim().length === 0 || undefined}
              aria-describedby={update.isError ? `${nameId}-error` : undefined}
              data-testid={`input-rename-saved-search-${search.id}`}
              className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 type-ui text-foreground transition-colors duration-fast ease-standard focus:border-ring aria-[invalid=true]:border-destructive sm:max-w-sm"
            />
            <Button size="sm" type="submit" loading={update.isPending} disabled={name.trim().length === 0} data-testid={`button-save-rename-${search.id}`}>
              Salvar
            </Button>
            <Button
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => {
                setName(search.name);
                setEditing(false);
                update.reset();
              }}
            >
              Cancelar
            </Button>
            {update.isError && (
              <p id={`${nameId}-error`} role="alert" className="w-full type-meta text-destructive">
                Não foi possível renomear. {errorDescription(update.error)}
              </p>
            )}
          </form>
        ) : (
          <div className="flex min-w-0 items-center gap-2">
            <h2 id={nameId} className="min-w-0 truncate type-ui font-semibold text-foreground" title={search.name}>
              {search.name}
            </h2>
            {search.newMatchesCount > 0 && (
              <span
                className="shrink-0 rounded-full bg-accent px-2 py-px type-data text-2xs font-bold text-accent-foreground"
                data-testid={`badge-new-${search.id}`}
              >
                {formatNumber(search.newMatchesCount)} {search.newMatchesCount === 1 ? 'novo' : 'novos'}
              </span>
            )}
            <button
              type="button"
              aria-label={`Renomear “${search.name}”`}
              data-testid={`button-rename-saved-search-${search.id}`}
              onClick={() => {
                setName(search.name);
                update.reset();
                setEditing(true);
              }}
              className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors duration-fast ease-standard hover:bg-muted hover:text-foreground focus-visible:focus-ring"
            >
              <Pencil size={13} aria-hidden />
            </button>
          </div>
        )}
        <SearchSummary params={searchParamsFromUrl(search.query)} className="mt-2" />
        <p className="mt-2 type-meta text-muted-foreground">
          {search.lastCheckedAt ? `Verificada pela coleta em ${formatDateTime(search.lastCheckedAt)}` : 'Ainda não verificada pela coleta'}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-3 sm:justify-end">
        <label className="inline-flex items-center gap-2 type-meta font-medium text-muted-foreground">
          <Switch
            checked={search.alertsEnabled}
            onCheckedChange={toggleAlerts}
            disabled={update.isPending}
            aria-describedby={nameId}
            data-testid={`switch-alerts-${search.id}`}
          />
          Alertas
        </label>
        <Button variant="outline" size="sm" onClick={open} data-testid={`button-open-saved-search-${search.id}`}>
          Abrir busca
          <ArrowRight size={14} aria-hidden />
        </Button>
        <Button variant="ghost" size="sm" aria-label={`Excluir “${search.name}”`} onClick={onDelete} data-testid={`button-delete-saved-search-${search.id}`}>
          <Trash2 size={14} aria-hidden />
        </Button>
      </div>
    </li>
  );
}
