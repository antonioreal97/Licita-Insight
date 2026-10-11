import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useSearch } from 'wouter';
import {
  Bell,
  Bookmark,
  CheckCheck,
  ChevronDown,
  Clapperboard,
  FileSearch,
  Globe,
  LayoutDashboard,
  Landmark,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Sun,
  Target,
  type LucideIcon,
} from 'lucide-react';
import type { User } from '@/api';
import { BrandLogo } from '@/components/brand-icon';
import { Button } from '@/components/common/action-button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { signInWithGoogle, useSession, useSignOut } from '@/features/auth/hooks/use-session';
import { AccessBadge, TrialEndingBanner } from '@/features/billing/components/trial-notice';
import { useBilling } from '@/features/billing/hooks/use-billing';
import { IncludedInAccessHint } from '@/features/opportunities/components/access-gate';
import { useOpportunityAccess } from '@/features/opportunities/hooks/use-opportunities';
import { optionalStorageAllowed } from '@/features/privacy/cookie-consent';
import { LegalLinks } from '@/features/legal/legal-content';
import { queryKeys } from '@/services/query-keys';
import { NotificationItem } from '@/features/monitoring/components/notification-item';
import { useMarkNotificationsRead, useNotifications, useUnreadCount } from '@/features/monitoring/hooks/use-notifications';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type NavItem = { href: string; label: string; icon: LucideIcon; testId: string };

/** The international tab of the hub: same page as the cultural calls, told apart by the query string. */
const INTERNATIONAL_HREF = '/oportunidades?scope=international';

/** `title` is shown above the group; `label` names the <nav> for screen readers. */
const navGroups: { label: string; title?: string; items: NavItem[] }[] = [
  {
    label: 'Navegação principal',
    items: [
      { href: '/dashboard', label: 'Visão geral', icon: LayoutDashboard, testId: 'link-nav-visão-geral' },
      { href: '/search', label: 'Explorar editais', icon: Search, testId: 'link-nav-explorar-editais' },
      { href: '/oportunidades', label: 'Chamadas culturais', icon: Clapperboard, testId: 'link-nav-chamadas-culturais' },
      { href: INTERNATIONAL_HREF, label: 'Internacionais', icon: Globe, testId: 'link-nav-internacionais' },
      { href: '/transparencia', label: 'Transparência', icon: Landmark, testId: 'link-nav-transparencia' },
      { href: '/saved-searches', label: 'Buscas salvas', icon: Bookmark, testId: 'link-nav-buscas-salvas' },
      { href: '/saved-tenders', label: 'Editais salvos', icon: FileSearch, testId: 'link-nav-editais-salvos' },
      { href: '/monitoring', label: 'Monitoramento', icon: Target, testId: 'link-nav-monitoramento' },
    ],
  },
  {
    label: 'Conta',
    title: 'Conta',
    items: [
      { href: '/settings', label: 'Configurações', icon: Settings, testId: 'link-nav-configuracoes' },
      // Internal reference page: never shown to customers.
    ],
  },
];

const headerIconButton = 'rounded-lg p-2 text-muted-foreground transition-colors duration-fast ease-standard hover:bg-muted hover:text-foreground';

const COLLAPSED_KEY = 'licita-sidebar-collapsed';

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === 'true';
  } catch (error) {
    console.error('Não foi possível ler o estado da barra lateral.', error);
    return false;
  }
}

// Sidebar body, shared by the fixed desktop sidebar (lg+) and the drawer below lg.
function SidebarContent({ collapsed, location, onNavigate }: { collapsed: boolean; location: string; onNavigate?: () => void }) {
  // Cultural calls need access (trial or subscription): say so on the nav item before the user clicks.
  const access = useOpportunityAccess();
  const opportunitiesLocked = access.state === 'anonymous' || access.state === 'no-access';
  const internationalScope = new URLSearchParams(useSearch()).get('scope') === 'international';
  return (
    <>
      <div className={`flex h-header-mobile items-center gap-3 border-b border-sidebar-border px-5 lg:h-header ${onNavigate ? 'pr-12' : ''}`}>
        {collapsed ? <BrandLogo symbol className="mx-auto h-6" /> : <BrandLogo className="h-12" />}
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-6">
        {navGroups.map((group, index) => (
          <div key={group.label}>
            {collapsed
              ? index > 0 && <div className="mx-3 my-4 h-px bg-sidebar-border" />
              : group.title && <div className={`mb-3 px-3 type-eyebrow text-sidebar-subtle-foreground ${index > 0 ? 'mt-10' : ''}`}>{group.title}</div>}
            <nav aria-label={group.label} className="space-y-1">
              {group.items.map(({ href, label, icon: Icon, testId }) => {
                const locked = href.startsWith('/oportunidades') && opportunitiesLocked;
                const name = locked && collapsed ? `${label} (incluso no acesso)` : label;
                const active =
                  href === INTERNATIONAL_HREF
                    ? location === '/oportunidades' && internationalScope
                    : (location === href && !(href === '/oportunidades' && internationalScope)) ||
                      (href === '/search' && location.startsWith('/tenders/')) ||
                      (href === '/oportunidades' && location.startsWith('/oportunidades/'));
                const link = (
                  <Link
                    key={href}
                    href={href}
                    onClick={onNavigate}
                    data-testid={testId}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-3 rounded-lg py-2.5 type-ui font-medium transition-colors duration-fast ease-standard focus-visible:outline-sidebar-ring ${collapsed ? 'justify-center px-0' : 'px-3'} ${active ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-strong-foreground'}`}
                  >
                    <Icon size={17} strokeWidth={active ? 2 : 1.75} className="shrink-0" />
                    {/* The hint sits under the label: side by side it doesn't fit the sidebar width. */}
                    <span className={collapsed ? 'sr-only' : 'flex min-w-0 flex-col'}>
                      {name}
                      {locked && !collapsed && <IncludedInAccessHint className="text-sidebar-muted-foreground" />}
                    </span>
                  </Link>
                );
                if (!collapsed) return link;
                // The link already has its accessible name (sr-only label); don't also announce the tooltip as a description.
                return (
                  <Tooltip key={href} delayDuration={300}>
                    <TooltipTrigger asChild aria-describedby={undefined}>
                      {link}
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={10}>
                      {name}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </nav>
          </div>
        ))}
      </div>
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  // index.html applies the saved theme before first paint; start from what it did.
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  // Set when the drawer closes because a link was followed: focus then goes to <main> (App.tsx), not back to "Abrir menu".
  const navigatedFromDrawer = useRef(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    const persist = () => {
      if (!optionalStorageAllowed()) return;
      try {
        localStorage.setItem('licita-theme', dark ? 'dark' : 'light');
      } catch (error) {
        console.error('Não foi possível salvar o tema.', error);
      }
    };
    persist();
    window.addEventListener('licita-cookie-consent', persist);
    return () => window.removeEventListener('licita-cookie-consent', persist);
  }, [dark]);

  useEffect(() => {
    const persist = () => {
      if (!optionalStorageAllowed()) return;
      try {
        localStorage.setItem(COLLAPSED_KEY, String(collapsed));
      } catch (error) {
        console.error('Não foi possível salvar o estado da barra lateral.', error);
      }
    };
    persist();
    window.addEventListener('licita-cookie-consent', persist);
    return () => window.removeEventListener('licita-cookie-consent', persist);
  }, [collapsed]);

  // The drawer only exists below lg. If the window grows past lg while it is open, close it so the modal doesn't keep the page inert.
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const close = () => desktop.matches && setOpen(false);
    desktop.addEventListener('change', close);
    return () => desktop.removeEventListener('change', close);
  }, []);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <a
        href="#conteudo"
        data-testid="link-skip-to-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-toast focus:rounded-lg focus:bg-surface-raised focus:px-4 focus:py-2 focus:type-ui focus:font-semibold focus:text-foreground "
      >
        Pular para o conteúdo
      </a>
      <aside
        className={`fixed inset-y-0 left-0 z-nav hidden w-sidebar flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-slow ease-emphasized lg:flex ${collapsed ? 'lg:w-sidebar-collapsed' : ''}`}
      >
        <SidebarContent collapsed={collapsed} location={location} />
      </aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          aria-describedby={undefined}
          closeLabel="Fechar menu"
          closeProps={{
            'data-testid': 'button-close-menu',
            className: 'text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-strong-foreground focus-visible:outline-sidebar-ring',
          }}
          data-testid="drawer-navigation"
          className="flex w-72 max-w-[85vw] flex-col gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground sm:max-w-[85vw] lg:hidden"
          onCloseAutoFocus={(event) => {
            if (!navigatedFromDrawer.current) return;
            navigatedFromDrawer.current = false;
            event.preventDefault();
          }}
        >
          <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
          <SidebarContent
            collapsed={false}
            location={location}
            onNavigate={() => {
              navigatedFromDrawer.current = true;
              setOpen(false);
            }}
          />
        </SheetContent>
        <div className={`min-h-[100dvh] transition-[padding] duration-slow ease-emphasized ${collapsed ? 'lg:pl-sidebar-collapsed' : 'lg:pl-sidebar'}`}>
          <header className="sticky top-0 z-sticky flex h-header-mobile items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur-sm sm:px-8 lg:h-header">
            <div className="flex items-center gap-3">
              <SheetTrigger asChild>
                <button aria-label="Abrir menu" data-testid="button-open-menu" className={`-ml-2 lg:hidden ${headerIconButton}`}>
                  <Menu size={20} strokeWidth={1.75} />
                </button>
              </SheetTrigger>
              <Link href="/dashboard" aria-label="Pardal Digital — Visão geral" className="lg:hidden">
                <BrandLogo className="h-8" />
              </Link>
              <button
                aria-label={collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
                aria-expanded={!collapsed}
                data-testid="button-collapse-sidebar"
                onClick={() => setCollapsed(!collapsed)}
                className={`hidden lg:block ${headerIconButton}`}
              >
                {collapsed ? <PanelLeftOpen size={19} strokeWidth={1.75} /> : <PanelLeftClose size={19} strokeWidth={1.75} />}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                aria-label="Tema escuro"
                aria-pressed={dark}
                data-testid="button-toggle-theme"
                onClick={() => setDark(!dark)}
                className={headerIconButton}
              >
                {dark ? <Sun size={18} strokeWidth={1.75} /> : <Moon size={18} strokeWidth={1.75} />}
              </button>
              <NotificationBell />
              <div className="ml-1 hidden h-7 w-px bg-border sm:block" />
              <AccessBadge />
              <AccountMenu />
            </div>
          </header>
          <TrialEndingBanner />
          <main id="conteudo" tabIndex={-1} className="mx-auto max-w-page px-4 py-7 outline-none sm:px-8 lg:px-10">
            {children}
          </main>
          <footer className="mx-auto flex max-w-page flex-col gap-2 border-t border-border px-4 py-6 type-meta text-muted-foreground sm:px-8 lg:px-10">
            <span>© {new Date().getFullYear()} Pardal Digital</span>
            <LegalLinks />
          </footer>
        </div>
      </Sheet>
    </div>
  );
}

function initials(user: User) {
  const words = (user.name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return user.email.slice(0, 1).toUpperCase();
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
}

/** Google photo with an initials fallback (also shown while the photo loads or if it fails). */
export function UserAvatar({ user, className }: { user: User; className?: string }) {
  return (
    <Avatar className={cn('size-8', className)}>
      {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" referrerPolicy="no-referrer" />}
      <AvatarFallback className="bg-primary-subtle text-xs font-bold text-primary-subtle-foreground">{initials(user)}</AvatarFallback>
    </Avatar>
  );
}

const menuItem = 'cursor-pointer gap-2.5 rounded-lg px-2.5 py-2 type-ui';

function AccountMenu() {
  const { user, status, error } = useSession();
  const signOut = useSignOut();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (error) console.error('[auth] Não foi possível verificar a sessão.', error);
  }, [error]);

  if (status === 'loading' && !error) {
    return (
      <div role="status" aria-label="Carregando conta" className="flex items-center gap-2">
        <span aria-hidden className="hidden h-3 w-24 animate-pulse rounded-lg bg-muted sm:block" />
        <span aria-hidden className="size-8 animate-pulse rounded-full bg-muted" />
      </div>
    );
  }

  if (error && !user) {
    return (
      <Button variant="outline" size="sm" data-testid="button-header-session-retry" onClick={() => queryClient.refetchQueries({ queryKey: queryKeys.session })}>
        Tentar de novo
      </Button>
    );
  }

  if (!user) {
    return (
      <Button variant="outline" size="sm" data-testid="button-header-sign-in" onClick={() => signInWithGoogle()}>
        Entrar
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          data-testid="button-account-menu"
          aria-label={`Conta de ${user.name ?? user.email}`}
          className="flex items-center gap-2 rounded-lg p-1 text-muted-foreground transition-colors duration-fast ease-standard hover:bg-muted hover:text-foreground sm:pl-2"
        >
          <span className="hidden max-w-40 truncate type-ui font-medium sm:block">{user.name ?? user.email}</span>
          <UserAvatar user={user} />
          <ChevronDown size={14} strokeWidth={1.75} aria-hidden className="hidden sm:block" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-64 rounded-xl bg-surface-raised p-1.5 ">
        <DropdownMenuLabel className="flex items-center gap-3 px-2.5 py-2 font-normal">
          <UserAvatar user={user} className="size-9" />
          <span className="min-w-0">
            <span className="block truncate type-ui font-semibold text-foreground">{user.name ?? 'Sua conta'}</span>
            <span className="block truncate type-meta text-muted-foreground">{user.email}</span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className={menuItem}>
          <Link href="/settings" data-testid="link-account-settings">
            <Settings strokeWidth={1.75} aria-hidden />
            Configurações
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid="button-sign-out"
          disabled={signOut.isPending}
          // Keep the menu open so "Saindo…" is visible; success navigates away, failure shows a toast.
          onSelect={(event) => {
            event.preventDefault();
            signOut.mutate();
          }}
          className={menuItem}
        >
          <LogOut strokeWidth={1.75} aria-hidden />
          {signOut.isPending ? 'Saindo…' : 'Sair'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationBell() {
  const { status } = useSession();
  const [open, setOpen] = useState(false);
  const unread = useUnreadCount();
  if (status !== 'authenticated') return null;

  const count = unread.data ?? 0;
  const label = count === 0 ? 'Notificações' : `Notificações, ${count} ${count === 1 ? 'não lida' : 'não lidas'}`;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button aria-label={label} data-testid="button-notifications" className={cn('relative', headerIconButton)}>
          <Bell size={18} strokeWidth={1.75} />
          {count > 0 && (
            <span
              aria-hidden
              data-testid="badge-unread-count"
              className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-pill bg-accent px-1 type-data text-xs font-bold text-accent-foreground ring-2 ring-background"
            >
              {count > 9 ? '9+' : count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        aria-label="Notificações"
        align="end"
        sideOffset={8}
        className="w-[min(24rem,calc(100vw-2rem))] rounded-xl bg-surface-raised p-0 "
      >
        {/* Mounted only while open, so the list is fetched on demand (the badge polls the cheap count). */}
        <NotificationPanel unreadCount={count} onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

function NotificationPanel({ unreadCount, onClose }: { unreadCount: number; onClose: () => void }) {
  const billing = useBilling();
  const list = useNotifications({ unreadOnly: false, page: 1, pageSize: 8 });
  const markRead = useMarkNotificationsRead();
  const notifications = list.data?.data ?? [];
  const markFailed = (error: unknown) => {
    console.error('[notifications] Falha ao marcar como lida.', error);
    toast({ variant: 'destructive', title: 'Não foi possível marcar como lida', description: 'Verifique a conexão e tente novamente.' });
  };

  if (billing.isSuccess && !billing.data.entitled) {
    return (
      <div data-testid="popover-notifications" className="px-6 py-10 text-center">
        <p className="type-ui font-semibold text-foreground">Assine para acompanhar editais</p>
        <p className="mt-1 type-meta text-muted-foreground">Alertas de prazo, status, valor e documentos entram com a assinatura.</p>
        <Link
          href="/settings?billing=required#assinatura"
          data-testid="link-notifications-subscribe"
          onClick={onClose}
          className="mt-4 inline-flex rounded-lg text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:focus-ring"
        >
          Ver assinatura
        </Link>
      </div>
    );
  }

  return (
    <div data-testid="popover-notifications">
      <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-3">
        <h2 className="type-section text-foreground">Notificações</h2>
        <Button
          variant="ghost"
          size="sm"
          data-testid="button-mark-all-read"
          disabled={unreadCount === 0}
          loading={markRead.isPending && markRead.variables?.all === true}
          onClick={() => markRead.mutateAsync({ all: true }).catch(markFailed)}
          className="-mr-2"
        >
          <CheckCheck size={14} aria-hidden />
          Marcar todas como lidas
        </Button>
      </div>
      <div className="max-h-[min(28rem,65vh)] overflow-y-auto">
        {list.isPending ? (
          <div role="status" aria-label="Carregando notificações" className="divide-y divide-border-subtle">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} aria-hidden className="flex gap-3 px-4 py-3">
                <span className="size-8 shrink-0 animate-pulse rounded-full bg-muted" />
                <span className="flex-1 space-y-2 pt-1">
                  <span className="block h-3 w-2/5 animate-pulse rounded-lg bg-muted" />
                  <span className="block h-3 w-4/5 animate-pulse rounded-lg bg-muted" />
                </span>
              </div>
            ))}
          </div>
        ) : list.isError ? (
          <div role="alert" className="px-4 py-8 text-center">
            <p className="type-ui font-semibold text-destructive">Não foi possível carregar as notificações</p>
            <Button variant="outline" size="sm" data-testid="button-notifications-retry" onClick={() => list.refetch()} className="mt-3">
              Tentar novamente
            </Button>
          </div>
        ) : notifications.length === 0 ? (
          <p data-testid="text-notifications-empty" className="px-6 py-10 text-center type-meta text-muted-foreground">
            Nenhuma notificação ainda. Monitore editais ou ative alertas em buscas salvas.
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {notifications.map((notification) => (
              <li key={notification.id}>
                <NotificationItem
                  compact
                  notification={notification}
                  onSelect={(n) => {
                    // mutateAsync: the panel unmounts on close, and a failure must still reach the toast.
                    if (n.readAt === null) markRead.mutateAsync({ ids: [n.id] }).catch(markFailed);
                    onClose();
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="border-t border-border-subtle p-1.5">
        <Link
          href="/monitoring"
          data-testid="link-notifications-all"
          onClick={onClose}
          className="block rounded-lg px-3 py-2 text-center type-ui font-semibold text-primary transition-colors duration-fast ease-standard hover:bg-muted"
        >
          Ver tudo
        </Link>
      </div>
    </div>
  );
}
