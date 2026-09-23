import { useEffect, useRef, type ReactNode } from 'react';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { isApiError } from '@/api';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { AppShell } from '@/components/app-shell';
import AuthPage, { LoginRedirect } from '@/features/auth/auth-page';
import { RequireAuth } from '@/features/auth/components/require-auth';
import DashboardPage from '@/features/dashboard/dashboard-page';
import DesignSystemPage from '@/features/design-system/design-system-page';
import LandingPage from '@/features/landing/landing-page';
import MonitoringPage from '@/features/monitoring/monitoring-page';
import SavedSearchesPage from '@/features/saved-searches/saved-searches-page';
import SavedTendersPage from '@/features/saved-tenders/saved-tenders-page';
import SearchPage from '@/features/search/search-page';
import SettingsPage from '@/features/settings/settings-page';
import TenderDetailPage from '@/features/tenders/tender-detail-page';
import { queryKeys } from '@/services/query-keys';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

// A 401 from any /me call means the session ended: re-check it so RequireAuth redirects and buttons show the signed-out state.
const onUnauthenticated = (error: unknown) => {
  if (isApiError(error) && error.status === 401) queryClient.invalidateQueries({ queryKey: queryKeys.session });
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
  '/': 'Licita Insight · Editais públicos do PNCP',
  '/login': 'Entrar · Licita Insight',
  '/register': 'Criar conta · Licita Insight',
  '/forgot-password': 'Recuperar acesso · Licita Insight',
  '/dashboard': 'Visão geral · Licita Insight',
  '/search': 'Explorar editais · Licita Insight',
  '/saved-searches': 'Buscas salvas · Licita Insight',
  '/saved-tenders': 'Editais salvos · Licita Insight',
  '/monitoring': 'Monitoramento · Licita Insight',
  '/settings': 'Configurações · Licita Insight',
  '/design-system': 'Design system · Licita Insight',
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
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={LandingPage} />
        <Route path="/login" component={AuthPage} />
        <Route path="/register" component={LoginRedirect} />
        <Route path="/forgot-password" component={LoginRedirect} />
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
                <SavedSearchesPage />
              </RequireAuth>
            </AppShell>
          )}
        </Route>
        <Route path="/saved-tenders">
          {() => (
            <AppShell>
              <RequireAuth>
                <SavedTendersPage />
              </RequireAuth>
            </AppShell>
          )}
        </Route>
        <Route path="/monitoring">
          {() => (
            <AppShell>
              <RequireAuth>
                <MonitoringPage />
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
        <Route path="/design-system">
          {() => (
            <AppShell>
              <DesignSystemPage />
            </AppShell>
          )}
        </Route>
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
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
