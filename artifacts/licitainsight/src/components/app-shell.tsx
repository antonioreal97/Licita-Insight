import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import {
  Bell,
  Bookmark,
  ChevronDown,
  CircleHelp,
  FileSearch,
  LayoutDashboard,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Sun,
  Target,
  X,
} from 'lucide-react';
const navItems = [
  { href: '/dashboard', label: 'Visão geral', icon: LayoutDashboard },
  { href: '/search', label: 'Explorar editais', icon: Search },
  { href: '/saved-searches', label: 'Buscas salvas', icon: Bookmark },
  { href: '/saved-tenders', label: 'Editais salvos', icon: FileSearch },
  { href: '/monitoring', label: 'Monitoramento', icon: Target },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem('licita-theme') === 'dark');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('licita-theme', dark ? 'dark' : 'light');
  }, [dark]);

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
        className={`fixed inset-y-0 left-0 z-nav flex w-sidebar flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-slow ease-emphasized lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'} ${collapsed ? 'lg:w-sidebar-collapsed' : ''}`}
      >
        <div className="flex h-header items-center gap-3 border-b border-sidebar-border px-5">
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
          <button
            aria-label="Fechar menu"
            data-testid="button-close-menu"
            onClick={() => setOpen(false)}
            className="ml-auto rounded-md p-1 text-sidebar-muted-foreground transition-colors duration-fast hover:bg-sidebar-accent hover:text-sidebar-strong-foreground focus-visible:outline-sidebar-ring lg:hidden"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-6">
          {!collapsed && <div className="mb-3 px-3 type-eyebrow text-sidebar-subtle-foreground">Workspace</div>}
          <nav className="space-y-1">
            {navItems.map(({ href, label, icon: Icon }) => {
              const active = location === href || (href === '/search' && location.startsWith('/tenders/'));
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}
                  aria-current={active ? 'page' : undefined}
                  className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 type-ui font-medium transition-colors duration-fast focus-visible:outline-sidebar-ring ${active ? 'bg-sidebar-primary/15 text-sidebar-primary' : 'text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-strong-foreground'}`}
                >
                  <Icon size={17} strokeWidth={active ? 2.4 : 1.8} />
                  <span className={collapsed ? 'sr-only' : ''}>{label}</span>
                </Link>
              );
            })}
          </nav>
          {!collapsed && <div className="mb-3 mt-10 px-3 type-eyebrow text-sidebar-subtle-foreground">Conta</div>}
          <nav className="space-y-1">
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              data-testid="link-nav-configuracoes"
              aria-current={location === '/settings' ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 type-ui font-medium transition-colors duration-fast focus-visible:outline-sidebar-ring ${location === '/settings' ? 'bg-sidebar-primary/15 text-sidebar-primary' : 'text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-strong-foreground'}`}
            >
              <Settings size={17} />
              <span className={collapsed ? 'sr-only' : ''}>Configurações</span>
            </Link>
            <Link
              href="/design-system"
              onClick={() => setOpen(false)}
              data-testid="link-nav-design-system"
              aria-current={location === '/design-system' ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 type-ui font-medium transition-colors duration-fast focus-visible:outline-sidebar-ring ${location === '/design-system' ? 'bg-sidebar-primary/15 text-sidebar-primary' : 'text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-strong-foreground'}`}
            >
              <CircleHelp size={17} />
              <span className={collapsed ? 'sr-only' : ''}>Design system</span>
            </Link>
          </nav>
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
            {!collapsed && <ChevronDown size={14} className="text-sidebar-subtle-foreground" />}
          </div>
        </div>
      </aside>
      {open && (
        <button
          aria-label="Fechar navegação"
          data-testid="button-overlay-menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-overlay bg-scrim/40 lg:hidden"
        />
      )}
      <div className={`min-h-[100dvh] transition-[padding] duration-base ease-standard ${collapsed ? 'lg:pl-sidebar-collapsed' : 'lg:pl-sidebar'}`}>
        <header className="sticky top-0 z-sticky flex h-header items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur-sm sm:px-8">
          <div className="flex items-center gap-3">
            <button
              aria-label="Abrir menu"
              data-testid="button-open-menu"
              onClick={() => setOpen(true)}
              className="rounded-lg p-2 transition-colors duration-fast hover:bg-muted lg:hidden"
            >
              <Menu size={20} />
            </button>
            <button
              aria-label="Recolher barra lateral"
              data-testid="button-collapse-sidebar"
              onClick={() => setCollapsed(!collapsed)}
              className="hidden rounded-lg p-2 text-muted-foreground transition-colors duration-fast hover:bg-muted hover:text-foreground lg:block"
            >
              {collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
            </button>
            <div className="hidden type-eyebrow text-muted-foreground sm:block">
              Fonte: PNCP
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              aria-label="Alternar tema"
              data-testid="button-toggle-theme"
              onClick={() => setDark(!dark)}
              className="rounded-lg p-2 text-muted-foreground transition-colors duration-fast hover:bg-muted hover:text-foreground"
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              aria-label="Notificações"
              data-testid="button-notifications"
              className="relative rounded-lg p-2 text-muted-foreground transition-colors duration-fast hover:bg-muted hover:text-foreground"
            >
              <Bell size={18} />
            </button>
            <div className="ml-2 hidden h-7 w-px bg-border sm:block" />
            <span className="hidden text-xs font-medium text-muted-foreground sm:block">Marina Almeida</span>
            <div className="grid h-8 w-8 place-items-center rounded-full bg-primary-subtle text-3xs font-bold text-primary-subtle-foreground">MA</div>
          </div>
        </header>
        <main id="conteudo" tabIndex={-1} className="mx-auto max-w-page px-4 py-7 outline-none sm:px-8 lg:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}
