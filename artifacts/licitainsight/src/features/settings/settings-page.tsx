import { Info, LogOut } from 'lucide-react';
import { Link } from 'wouter';
import { Button } from '@/components/common/action-button';
import { PageTitle } from '@/components/common/page-title';
import { UserAvatar } from '@/components/app-shell';
import { useSession, useSignOut } from '@/features/auth/hooks/use-session';
import { formatDate } from '@/lib/format';

// TODO(settings): no preferences API yet. Profile comes from the Google session (read-only); nothing here pretends to persist.
const sections = [
  { name: 'Perfil e conta', soon: false },
  { name: 'Notificações', soon: false },
  { name: 'Preferências de busca', soon: true },
  { name: 'Aparência', soon: true },
];

const alertRows = [
  {
    name: 'Novos resultados',
    desc: 'Ative alertas em uma busca salva para saber quando surgirem editais novos.',
    href: '/saved-searches',
    cta: 'Buscas salvas',
  },
  {
    name: 'Mudanças em editais',
    desc: 'Monitore um edital para ser avisado quando prazo, status, valor ou documentos mudarem.',
    href: '/monitoring',
    cta: 'Monitoramento',
  },
];

export default function SettingsPage() {
  // Rendered inside <RequireAuth>, so the session is known here.
  const { user } = useSession();
  const signOut = useSignOut();

  return (
    <>
      <PageTitle eyebrow="workspace" title="Configurações" description="Sua conta e como o Licita Insight avisa você." />
      <p
        role="note"
        data-testid="text-settings-readonly"
        className="mb-6 flex items-start gap-2 rounded-lg border border-border bg-muted px-4 py-3 type-meta text-muted-foreground"
      >
        <Info size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
        Nome, e-mail e foto vêm da sua conta Google e não são editados aqui. Preferências de busca e aparência ainda não são configuráveis.
      </p>
      <div className="grid gap-6 xl:grid-cols-[220px_1fr]">
        {/* Section list, not tabs: the page is short enough to scroll; later sections are labelled as coming later. */}
        <ul aria-label="Seções" className="flex gap-2 overflow-x-auto xl:block xl:space-y-1">
          {sections.map(({ name, soon }, index) => (
            <li
              key={name}
              data-testid={`button-settings-${index}`}
              className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold ${soon ? 'text-muted-foreground' : 'text-foreground'}`}
            >
              {name}
              {soon && <span className="rounded-xs bg-secondary px-1 py-px type-label font-bold text-secondary-foreground">em breve</span>}
            </li>
          ))}
        </ul>
        <div className="space-y-6">
          <section aria-labelledby="settings-profile" className="rounded-xl border border-border bg-card p-5 sm:p-7">
            <h2 id="settings-profile" className="type-section">
              Perfil e conta
            </h2>
            {user && (
              <div className="mt-5 flex flex-wrap items-center gap-4">
                <UserAvatar user={user} className="size-14" />
                <div className="min-w-0 flex-1">
                  <div data-testid="text-settings-name" className="truncate type-body font-semibold">
                    {user.name ?? 'Nome não informado'}
                  </div>
                  <div data-testid="text-settings-email" className="truncate type-ui text-muted-foreground">
                    {user.email}
                  </div>
                  <div className="mt-1 type-meta text-muted-foreground">
                    Conta Google · desde <span className="type-data">{formatDate(user.createdAt)}</span>
                  </div>
                </div>
                <Button variant="outline" data-testid="button-settings-sign-out" loading={signOut.isPending} onClick={() => signOut.mutate()}>
                  <LogOut size={14} aria-hidden />
                  Sair
                </Button>
              </div>
            )}
          </section>
          <section aria-labelledby="settings-notifications" className="rounded-xl border border-border bg-card p-5 sm:p-7">
            <h2 id="settings-notifications" className="type-section">
              Notificações
            </h2>
            <p className="mt-1 type-meta text-muted-foreground">Os avisos aparecem no sino, no topo da página. Não enviamos e-mails.</p>
            <div className="mt-5 divide-y divide-border">
              {alertRows.map(({ name, desc, href, cta }, index) => (
                <div
                  key={name}
                  data-testid={`row-notification-${index}`}
                  className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block type-ui font-medium">{name}</span>
                    <span className="mt-0.5 block type-meta text-muted-foreground">{desc}</span>
                  </span>
                  <Link href={href} className="type-ui font-semibold text-primary hover:underline">
                    {cta}
                  </Link>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
