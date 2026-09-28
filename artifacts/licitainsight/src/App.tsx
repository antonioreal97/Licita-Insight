import { useEffect, useRef, type ReactNode } from 'react';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { isApiError } from '@/api';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { AppShell } from '@/components/app-shell';
import AuthPage, { LoginRedirect } from '@/features/auth/auth-page';
import { useIdleSession } from '@/features/auth/hooks/use-session';
import { RequireAuth } from '@/features/auth/components/require-auth';
import { RequireSubscription } from '@/features/billing/components/require-subscription';
import DashboardPage from '@/features/dashboard/dashboard-page';
import DesignSystemPage from '@/features/design-system/design-system-page';
import LandingPage from '@/features/landing/landing-page';
import MonitoringPage from '@/features/monitoring/monitoring-page';
import SavedSearchesPage from '@/features/saved-searches/saved-searches-page';
import SavedTendersPage from '@/features/saved-tenders/saved-tenders-page';
import OpportunitiesPage from '@/features/opportunities/opportunities-page';
import OpportunityDetailPage from '@/features/opportunities/opportunity-detail-page';
import SearchPage from '@/features/search/search-page';
import SettingsPage from '@/features/settings/settings-page';
import TenderDetailPage from '@/features/tenders/tender-detail-page';
import UnsubscribePage from '@/features/unsubscribe/unsubscribe-page';
import { CookieNotice } from '@/features/privacy/cookie-notice';
import { queryKeys } from '@/services/query-keys';
import { toast } from '@/hooks/use-toast';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

// A 401 from any /me call means the session ended: drop the user's data (bookmarks must not stay filled), re-check the
// session so RequireAuth redirects, and say why — once, even if several requests fail together.
let lastExpiredNotice = 0;
const onUnauthenticated = (error: unknown) => {
  if (!isApiError(error) || error.status !== 401) return;
  queryClient.removeQueries({ queryKey: queryKeys.me.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.session });
  if (Date.now() - lastExpiredNotice < 10_000) return;
  lastExpiredNotice = Date.now();
  toast({ variant: 'destructive', title: 'Sua sessão expirou', description: 'Entre de novo com o Google para continuar.' });
};

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onUnauthenticated }),
  mutationCache: new MutationCache({ onError: onUnauthenticated }),
});
// Account data: retry only transient failures (network, 5xx, 429). A 401/403/404 won't pass on retry.
const retryTransient = (failureCount: number, error: unknown) => isApiError(error) && error.isTransient && failureCount < 2;
queryClient.setQueryDefaults(queryKeys.me.all, { retry: retryTransient });
queryClient.setQueryDefaults(queryKeys.session, { retry: retryTransient });

// Static routes only. Pages with dynamic titles (tender detail, 404) set document.title themselves, so this never touches them.
const routeTitles: Record<string, string> = {
  '/': 'LicitAI · Editais públicos do PNCP',
  '/login': 'Entrar · LicitAI',
  '/register': 'Criar conta · LicitAI',
  '/forgot-password': 'Recuperar acesso · LicitAI',
  '/descadastro': 'Descadastro de e-mails · LicitAI',
  '/dashboard': 'Visão geral · LicitAI',
  '/search': 'Explorar editais · LicitAI',
  '/oportunidades': 'Chamadas culturais · LicitAI',
  '/saved-searches': 'Buscas salvas · LicitAI',
  '/saved-tenders': 'Editais salvos · LicitAI',
  '/monitoring': 'Monitoramento · LicitAI',
  '/settings': 'Configurações · LicitAI',
  '/design-system': 'Design system · LicitAI',
};

function useRouteAnnouncement() {
  const [location] = useLocation();
  const previous = useRef(location);
  useEffect(() => {
    const title = routeTitles[location];
    if (title) document.title = title;
    // Move focus to the page on in-app navigation (not on first load), so keyboard and screen reader users start at the new content.
    if (previous.current === location) return;
    previous.current = location;
    document.getElementById('conteudo')?.focus({ preventScroll: true });
  }, [location]);
}

function Router() {
  useRouteAnnouncement();
  useIdleSession();
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={LandingPage} />
        <Route path="/login" component={AuthPage} />
        <Route path="/register" component={LoginRedirect} />
        <Route path="/forgot-password" component={LoginRedirect} />
        <Route path="/descadastro" component={UnsubscribePage} />
        <Route path="/dashboard">
          {() => (
            <AppShell>
              <DashboardPage />
            </AppShell>
          )}
        </Route>
        <Route path="/search">
          {() => (
            <AppShell>
              <SearchPage />
            </AppShell>
          )}
        </Route>
        <Route path="/oportunidades/:id">
          {() => (
            <AppShell>
              <OpportunityDetailPage />
            </AppShell>
          )}
        </Route>
        <Route path="/oportunidades">
          {() => (
            <AppShell>
              <OpportunitiesPage />
            </AppShell>
          )}
        </Route>
        <Route path="/tenders/:id">
          {() => (
            <AppShell>
              <TenderDetailPage />
            </AppShell>
          )}
        </Route>
        <Route path="/saved-searches">
          {() => (
            <AppShell>
              <RequireAuth>
                <RequireSubscription>
                  <SavedSearchesPage />
                </RequireSubscription>
              </RequireAuth>
            </AppShell>
          )}
        </Route>
        <Route path="/saved-tenders">
          {() => (
            <AppShell>
              <RequireAuth>
                <RequireSubscription>
                  <SavedTendersPage />
                </RequireSubscription>
              </RequireAuth>
            </AppShell>
          )}
        </Route>
        <Route path="/monitoring">
          {() => (
            <AppShell>
              <RequireAuth>
                <RequireSubscription>
                  <MonitoringPage />
                </RequireSubscription>
              </RequireAuth>
            </AppShell>
          )}
        </Route>
        <Route path="/settings">
          {() => (
            <AppShell>
              <RequireAuth>
                <SettingsPage />
              </RequireAuth>
            </AppShell>
          )}
        </Route>
        {import.meta.env.DEV && (
          <Route path="/design-system">
            {() => (
              <AppShell>
                <DesignSystemPage />
              </AppShell>
            )}
          </Route>
        )}
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <CookieNotice />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
