import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { AppShell } from '@/components/app-shell';
import { AuthPage, DashboardPage, DesignSystemPage, LandingPage, MonitoringPage, SavedSearchesPage, SavedTendersPage, SearchPage, SettingsPage, TenderDetailPage } from '@/pages/pages';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={LandingPage} />
        <Route path="/login">{() => <AuthPage mode="login" />}</Route>
        <Route path="/register">{() => <AuthPage mode="register" />}</Route>
        <Route path="/forgot-password">{() => <AuthPage mode="forgot" />}</Route>
        <Route path="/dashboard">{() => <AppShell><DashboardPage /></AppShell>}</Route>
        <Route path="/search">{() => <AppShell><SearchPage /></AppShell>}</Route>
        <Route path="/tenders/:id">{() => <AppShell><TenderDetailPage /></AppShell>}</Route>
        <Route path="/saved-searches">{() => <AppShell><SavedSearchesPage /></AppShell>}</Route>
        <Route path="/saved-tenders">{() => <AppShell><SavedTendersPage /></AppShell>}</Route>
        <Route path="/monitoring">{() => <AppShell><MonitoringPage /></AppShell>}</Route>
        <Route path="/settings">{() => <AppShell><SettingsPage /></AppShell>}</Route>
        <Route path="/design-system">{() => <AppShell><DesignSystemPage /></AppShell>}</Route>
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
