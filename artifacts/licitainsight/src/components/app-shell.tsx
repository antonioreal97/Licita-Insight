import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import {
  Bell,
  Bookmark,
  CheckCheck,
  ChevronDown,
  FileSearch,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Sun,
  Target,
  type LucideIcon,
} from 'lucide-react';
import type { User } from '@/api';
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
import { NotificationItem } from '@/features/monitoring/components/notification-item';
import { useMarkNotificationsRead, useNotifications, useUnreadCount } from '@/features/monitoring/hooks/use-notifications';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type NavItem = { href: string; label: string; icon: LucideIcon; testId: string };

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: 'Workspace',
    items: [
      { href: '/dashboard', label: 'Visão geral', icon: LayoutDashboard, testId: 'link-nav-visão-geral' },
      { href: '/search', label: 'Explorar editais', icon: Search, testId: 'link-nav-explorar-editais' },
      { href: '/saved-searches', label: 'Buscas salvas', icon: Bookmark, testId: 'link-nav-buscas-salvas' },
      { href: '/saved-tenders', label: 'Editais salvos', icon: FileSearch, testId: 'link-nav-editais-salvos' },
      { href: '/monitoring', label: 'Monitoramento', icon: Target, testId: 'link-nav-monitoramento' },
    ],
  },
  {
    label: 'Conta',
    items: [
      { href: '/settings', label: 'Configurações', icon: Settings, testId: 'link-nav-configuracoes' },
      { href: '/design-system', label: 'Design system', icon: Palette, testId: 'link-nav-design-system' },
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
  return (
    <>
      <div className={`flex h-14 items-center gap-3 border-b border-sidebar-border px-5 lg:h-header ${onNavigate ? 'pr-12' : ''}`}>
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-sidebar-primary type-section font-bold tracking-normal text-sidebar-primary-foreground">
          LI
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="font-semibold tracking-heading text-sidebar-strong-foreground">
              Licita <span className="text-sidebar-primary">Insight</span>
            </div>
            <div className="truncate type-label text-sidebar-muted-foreground">procurement intelligence</div>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-6">
        {navGroups.map((group, index) => (
          <div key={group.label}>
            {collapsed ? (
              index > 0 && <div className="mx-3 my-4 h-px bg-sidebar-border" />
            ) : (
              <div className={`mb-3 px-3 type-eyebrow text-sidebar-subtle-foreground ${index > 0 ? 'mt-10' : ''}`}>{group.label}</div>
            )}
            <nav aria-label={group.label} className="space-y-1">
              {group.items.map(({ href, label, icon: Icon, testId }) => {
                const active = location === href || (href === '/search' && location.startsWith('/tenders/'));
                const link = (
                  <Link
                    key={href}
                    href={href}
                    onClick={onNavigate}
                    data-testid={testId}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-3 rounded-lg py-2.5 type-ui font-medium transition-colors duration-fast ease-standard focus-visible:outline-sidebar-ring ${collapsed ? 'justify-center px-0' : 'px-3'} ${active ? 'bg-sidebar-primary/15 text-sidebar-primary' : 'text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-strong-foreground'}`}
                  >
                    <Icon size={17} strokeWidth={active ? 2 : 1.75} className="shrink-0" />
                    <span className={collapsed ? 'sr-only' : ''}>{label}</span>
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
                      {label}
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
    try {
      localStorage.setItem('licita-theme', dark ? 'dark' : 'light');
    } catch (error) {
      console.error('Não foi possível salvar o tema.', error);
    }
  }, [dark]);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, String(collapsed));
    } catch (error) {
      console.error('Não foi possível salvar o estado da barra lateral.', error);
    }
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
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-toast focus:rounded-lg focus:bg-surface-raised focus:px-4 focus:py-2 focus:type-ui focus:font-semibold focus:text-foreground focus:shadow-lg"
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
          <header className="sticky top-0 z-sticky flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur-sm sm:px-8 lg:h-header">
            <div className="flex items-center gap-3">
              <SheetTrigger asChild>
                <button aria-label="Abrir menu" data-testid="button-open-menu" className={`-ml-2 lg:hidden ${headerIconButton}`}>
                  <Menu size={20} strokeWidth={1.75} />
                </button>
              </SheetTrigger>
              <Link
                href="/dashboard"
                aria-label="Licita Insight — Visão geral"
                className="grid size-7 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground lg:hidden"
              >
                LI
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
              <div className="hidden type-eyebrow text-muted-foreground sm:block">Fonte: PNCP</div>
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
              <AccountMenu />
            </div>
          </header>
          <main id="conteudo" tabIndex={-1} className="mx-auto max-w-page px-4 py-7 outline-none sm:px-8 lg:px-10">
            {children}
          </main>
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
      <AvatarFallback className="bg-primary-subtle text-3xs font-bold text-primary-subtle-foreground">{initials(user)}</AvatarFallback>
    </Avatar>
  );
}

const menuItem = 'cursor-pointer gap-2.5 rounded-md px-2.5 py-2 type-ui focus:bg-muted focus:text-foreground';

function AccountMenu() {
  const { user, status, error } = useSession();
  const signOut = useSignOut();

  useEffect(() => {
    if (error) console.error('[auth] Não foi possível verificar a sessão; mostrando "Entrar".', error);
  }, [error]);

  if (status === 'loading' && !error) {
    return (
      <div role="status" aria-label="Carregando conta" className="flex items-center gap-2">
        <span aria-hidden className="hidden h-3 w-24 animate-pulse rounded-sm bg-muted sm:block" />
        <span aria-hidden className="size-8 animate-pulse rounded-full bg-muted" />
      </div>
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
      <DropdownMenuContent align="end" sideOffset={8} className="z-popover w-64 rounded-xl bg-surface-raised p-1.5 shadow-lg">
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
              className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 type-data text-3xs font-bold text-accent-foreground ring-2 ring-background"
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
        className="z-popover w-[min(24rem,calc(100vw-2rem))] rounded-xl bg-surface-raised p-0 shadow-lg"
      >
        {/* Mounted only while open, so the list is fetched on demand (the badge polls the cheap count). */}
        <NotificationPanel unreadCount={count} onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

function NotificationPanel({ unreadCount, onClose }: { unreadCount: number; onClose: () => void }) {
  const list = useNotifications({ unreadOnly: false, page: 1, pageSize: 8 });
  const markRead = useMarkNotificationsRead();
  const notifications = list.data?.data ?? [];
  const markFailed = (error: unknown) => {
    console.error('[notifications] Falha ao marcar como lida.', error);
    toast({ variant: 'destructive', title: 'Não foi possível marcar como lida', description: 'Verifique a conexão e tente novamente.' });
  };

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
                  <span className="block h-3 w-2/5 animate-pulse rounded-sm bg-muted" />
                  <span className="block h-3 w-4/5 animate-pulse rounded-sm bg-muted" />
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
          className="block rounded-md px-3 py-2 text-center type-ui font-semibold text-primary transition-colors duration-fast ease-standard hover:bg-muted"
        >
          Ver tudo
        </Link>
      </div>
    </div>
  );
}
