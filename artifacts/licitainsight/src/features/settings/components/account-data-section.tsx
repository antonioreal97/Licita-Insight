import { useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import { isApiError } from '@/api';
import { Button } from '@/components/common/action-button';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useDeleteAccount, useExportAccountData } from '../hooks/use-account-data';

const CONFIRM_WORD = 'EXCLUIR';

function withRef(message: string, error: unknown) {
  return isApiError(error) && error.requestId ? `${message} (ref. ${error.requestId})` : message;
}

function exportErrorMessage(error: unknown) {
  if (isApiError(error) && error.code === 'NETWORK_ERROR') return 'Sem conexão com o servidor. Verifique a conexão e tente de novo.';
  return withRef('Não foi possível gerar o arquivo com seus dados. Tente de novo.', error);
}

function deleteErrorMessage(error: unknown) {
  if (isApiError(error) && error.code === 'BILLING_UNAVAILABLE')
    return withRef('Não conseguimos cancelar sua assinatura no Asaas agora, então nada foi excluído. Tente de novo em alguns minutos.', error);
  if (isApiError(error) && error.code === 'NETWORK_ERROR') return 'Sem conexão com o servidor. Nada foi excluído. Verifique a conexão e tente de novo.';
  return withRef('Não foi possível excluir a conta. Nada foi excluído. Tente de novo.', error);
}

const errorBox = 'rounded-lg border border-destructive-subtle-border bg-destructive-subtle px-3 py-2 type-meta text-destructive-subtle-foreground';

/** LGPD rights (account-v1 "LGPD"): export and delete. Outside the subscription gate, so it works without a plan. */
export function AccountDataSection() {
  const exportData = useExportAccountData();

  return (
    <section id="seus-dados" aria-labelledby="settings-data" className="scroll-mt-24 rounded-xl border border-border bg-card p-5 sm:p-7" data-testid="section-account-data">
      <h2 id="settings-data" className="type-section">
        Seus dados
      </h2>
      <p className="mt-1 type-meta text-muted-foreground">Seus direitos pela LGPD. Disponível com ou sem assinatura.</p>
      <div className="mt-5 divide-y divide-border">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
          <span className="min-w-0 flex-1">
            <span className="block type-ui font-medium">Baixar meus dados</span>
            <span className="mt-0.5 block type-meta text-muted-foreground">
              Arquivo JSON com perfil, sessões ativas, editais salvos, buscas salvas, notificações e a situação da assinatura.
            </span>
          </span>
          <Button variant="outline" data-testid="button-export-data" loading={exportData.isPending} onClick={() => exportData.mutate()}>
            <Download size={14} aria-hidden />
            Baixar meus dados
          </Button>
          {exportData.isError && (
            <p role="alert" data-testid="text-export-error" className={`basis-full ${errorBox}`}>
              {exportErrorMessage(exportData.error)}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
          <span className="min-w-0 flex-1">
            <span className="block type-ui font-medium">Excluir minha conta</span>
            <span className="mt-0.5 block type-meta text-muted-foreground">Apaga a conta e os dados pessoais de forma definitiva.</span>
          </span>
          <DeleteAccountButton />
        </div>
      </div>
    </section>
  );
}

function DeleteAccountButton() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const remove = useDeleteAccount();
  const confirmed = typed === CONFIRM_WORD;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (remove.isPending) return;
        setOpen(next);
        if (next) {
          setTyped('');
          remove.reset();
        }
      }}
    >
      <Button variant="destructive" data-testid="button-delete-account" onClick={() => setOpen(true)}>
        <Trash2 size={14} aria-hidden />
        Excluir minha conta
      </Button>
      <AlertDialogContent className="sm:max-w-md" data-testid="dialog-delete-account">
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (confirmed) remove.mutate();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="type-title">Excluir sua conta?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 type-meta text-muted-foreground">
                <p>
                  Apagamos de forma definitiva seu perfil, editais salvos e monitorados, buscas salvas, notificações e sessões abertas. Não dá para desfazer.
                </p>
                <p>Se você tiver uma assinatura ativa, ela é cancelada no Asaas antes da exclusão.</p>
                <p>Se quiser uma cópia, use “Baixar meus dados” antes.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="field">
            Digite {CONFIRM_WORD} para confirmar
            <input
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              autoFocus
              data-testid="input-delete-account-confirm"
            />
          </label>
          {remove.isError && (
            <p role="alert" data-testid="text-delete-account-error" className={errorBox}>
              {deleteErrorMessage(remove.error)}
            </p>
          )}
          <AlertDialogFooter className="gap-2">
            <Button type="button" variant="outline" disabled={remove.isPending} onClick={() => setOpen(false)} data-testid="button-cancel-delete-account">
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" loading={remove.isPending} disabled={!confirmed} data-testid="button-confirm-delete-account">
              Excluir conta
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
