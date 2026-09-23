import { useState, type FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import { isApiError } from '@/api';
import { Button } from '@/components/common/action-button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { ToastAction } from '@/components/ui/toast';
import { toast } from '@/hooks/use-toast';
import { signInWithGoogle, useSession } from '@/features/auth/hooks/use-session';
import { useCreateSavedSearch, useSavedSearches } from '@/features/saved-searches/hooks/use-saved-searches';
import { savedSearchQuery } from '@/services/account-service';
import { searchParamsFromUrl } from '@/services/search-service';
import { useSearchUrlState } from '../hooks/use-search-url-state';
import { SearchSummary } from './search-summary';

const NAME_MAX = 80;

function saveErrorMessage(error: unknown) {
  if (isApiError(error) && error.code === 'CONFLICT') return 'Você atingiu o limite de 50 buscas salvas. Exclua uma em Buscas salvas e tente de novo.';
  if (isApiError(error) && error.code === 'INVALID_PARAMETER')
    return 'O servidor recusou o nome ou os filtros. Use um nome de 1 a 80 caracteres e revise os filtros.';
  if (isApiError(error) && error.code === 'NETWORK_ERROR') return 'Sem conexão com o servidor. Tente de novo.';
  return isApiError(error) && error.requestId ? `Não foi possível salvar. Tente de novo. ref. ${error.requestId}` : 'Não foi possível salvar. Tente de novo.';
}

const savedSearchHref = (id: string) => `/saved-searches#saved-search-${id}`;

/** Signed out → Google sign-in (back to this search). Signed in → dialog to name the search and turn alerts on. */
export function SaveSearchButton() {
  const { params } = useSearchUrlState();
  const session = useSession();
  const savedSearches = useSavedSearches();
  const create = useCreateSavedSearch();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [alertsEnabled, setAlertsEnabled] = useState(true);

  const query = savedSearchQuery(params);
  // Re-canonicalize the stored query so a different key order/encoding from the server still matches.
  const existing = savedSearches.data?.data.find((search) => savedSearchQuery(searchParamsFromUrl(search.query)) === query);

  const start = () => {
    if (session.status === 'anonymous') return signInWithGoogle();
    if (session.status !== 'authenticated') {
      toast({
        variant: session.error ? 'destructive' : 'default',
        title: session.error ? 'Não foi possível verificar sua sessão' : 'Verificando sua sessão',
        description: session.error ? 'Recarregue a página e tente de novo.' : 'Aguarde um instante e tente de novo.',
      });
      return;
    }
    if (existing) return navigate(savedSearchHref(existing.id));
    setName((params.q ?? 'Busca sem termo').slice(0, NAME_MAX));
    setAlertsEnabled(true);
    create.reset();
    setOpen(true);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate(
      { name, params, alertsEnabled },
      {
        onSuccess: (search) => {
          setOpen(false);
          toast({
            title: 'Busca salva',
            description: search.alertsEnabled ? 'Avisaremos aqui no app quando surgirem editais novos.' : `“${search.name}” está em Buscas salvas.`,
            action: (
              <ToastAction altText="Ver buscas salvas" data-testid="button-toast-view-saved-searches" onClick={() => navigate('/saved-searches')}>
                Ver buscas salvas
              </ToastAction>
            ),
          });
        },
        onError: (error) => console.error('[saved-searches] Falha ao salvar a busca.', error),
      },
    );
  };

  const nameInvalid = name.trim().length === 0;
  // 409 `duplicate` (e.g. saved in another tab since the list loaded) carries the id of the search that already exists.
  const duplicateId = isApiError(create.error) ? create.error.detail('duplicate')?.existingId : undefined;

  return (
    <>
      <Button
        variant="outline"
        aria-pressed={existing ? true : undefined}
        data-testid="button-save-search"
        title={existing ? `Salva como “${existing.name}”. Abrir Buscas salvas` : 'Salvar esta busca e receber alertas de editais novos'}
        className="w-9 px-0 sm:w-auto sm:px-3.5"
        onClick={start}
      >
        {existing ? <BookmarkCheck size={14} aria-hidden /> : <Bookmark size={14} aria-hidden />}
        {/* Icon-only on phones so it shares the title row; the name stays for screen readers. */}
        <span className="sr-only sm:not-sr-only">{existing ? 'Busca salva' : 'Salvar busca'}</span>
      </Button>
      <Dialog open={open} onOpenChange={(next) => !create.isPending && setOpen(next)}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-save-search">
          <form onSubmit={submit} className="grid gap-5">
            <DialogHeader>
              <DialogTitle className="type-title">Salvar busca</DialogTitle>
              <DialogDescription className="type-meta text-muted-foreground">Ela fica em Buscas salvas, pronta para abrir de novo.</DialogDescription>
            </DialogHeader>
            <label className="field">
              Nome
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={NAME_MAX}
                required
                autoFocus
                aria-invalid={nameInvalid || (isApiError(create.error) && create.error.code === 'INVALID_PARAMETER') || undefined}
                data-testid="input-saved-search-name"
              />
            </label>
            <div>
              <div className="mb-2 type-label text-muted-foreground">Filtros</div>
              <SearchSummary params={params} />
            </div>
            <label className="flex items-start justify-between gap-4 rounded-lg border border-border bg-surface-sunken p-3">
              <span>
                <span className="block type-ui font-semibold text-foreground">Receber alertas de novos editais</span>
                <span className="block type-meta text-muted-foreground">
                  Aviso aqui no app quando a coleta diária trouxer editais que batem com esta busca.
                </span>
              </span>
              <Switch checked={alertsEnabled} onCheckedChange={setAlertsEnabled} data-testid="switch-saved-search-alerts" className="mt-0.5" />
            </label>
            {duplicateId ? (
              <p
                role="alert"
                className="rounded-lg bg-warning-subtle px-3 py-2 type-meta text-warning-subtle-foreground"
                data-testid="text-save-search-duplicate"
              >
                Você já salvou esta busca.{' '}
                <Link
                  href={savedSearchHref(duplicateId)}
                  className="font-semibold underline underline-offset-2 focus-visible:focus-ring"
                  data-testid="link-save-search-duplicate"
                >
                  Ver em Buscas salvas
                </Link>
              </p>
            ) : (
              create.isError && (
                <p
                  role="alert"
                  className="rounded-lg border border-destructive-subtle-border bg-destructive-subtle px-3 py-2 type-meta text-destructive-subtle-foreground"
                >
                  {saveErrorMessage(create.error)}
                </p>
              )
            )}
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={create.isPending} data-testid="button-cancel-save-search">
                Cancelar
              </Button>
              <Button type="submit" loading={create.isPending} disabled={nameInvalid} data-testid="button-confirm-save-search">
                Salvar busca
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
