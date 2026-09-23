import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import {
  Bell,
  Bookmark,
  ChevronDown,
  FileSearch,
  LayoutDashboard,
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
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from '@/hooks/use-toast';

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
      <div className="border-t border-sidebar-border p-3">
        <div className={`flex items-center gap-3 rounded-lg p-2 ${collapsed ? 'justify-center' : ''}`}>
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sidebar-accent text-xs font-bold text-sidebar-strong-foreground">MA</div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-sidebar-strong-foreground">Marina Almeida</div>
              <div className="truncate type-meta text-sidebar-subtle-foreground">Operações · Atlas Engenharia</div>
            </div>
          )}
          {!collapsed && <ChevronDown size={14} strokeWidth={1.75} className="text-sidebar-subtle-foreground" />}
        </div>
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
              {/* TODO(notifications): no notifications API yet. aria-disabled (not disabled) keeps the tooltip reachable. */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    aria-label="Notificações"
                    aria-disabled="true"
                    data-testid="button-notifications"
                    onClick={() => toast({ title: 'Notificações em breve', description: 'Ainda não há alertas de editais para mostrar aqui.' })}
                    className={`cursor-not-allowed opacity-60 ${headerIconButton}`}
                  >
                    <Bell size={18} strokeWidth={1.75} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Notificações em breve</TooltipContent>
              </Tooltip>
              <div className="ml-2 hidden h-7 w-px bg-border sm:block" />
              <span className="hidden text-xs font-medium text-muted-foreground sm:block">Marina Almeida</span>
              <div className="grid h-8 w-8 place-items-center rounded-full bg-primary-subtle text-3xs font-bold text-primary-subtle-foreground">MA</div>
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
