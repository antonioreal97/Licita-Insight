import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { Bell, Bookmark, ChevronDown, CircleHelp, FileSearch, LayoutDashboard, Menu, Moon, PanelLeftClose, PanelLeftOpen, Search, Settings, Sun, Target, X } from 'lucide-react';

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
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-200 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'} ${collapsed ? 'lg:w-[76px]' : ''}`}>
        <div className="flex h-[76px] items-center gap-3 border-b border-sidebar-border px-5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-sidebar-primary text-[15px] font-bold text-sidebar-primary-foreground">LI</div>
          {!collapsed && <div className="min-w-0"><div className="font-semibold tracking-[-0.02em] text-white">Licita <span className="text-sidebar-primary">Insight</span></div><div className="font-mono text-[9px] uppercase tracking-[0.14em] text-slate-400">procurement intelligence</div></div>}
          <button aria-label="Fechar menu" data-testid="button-close-menu" onClick={() => setOpen(false)} className="ml-auto rounded-md p-1 text-slate-400 hover:bg-sidebar-accent lg:hidden"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-6">
          {!collapsed && <div className="mb-3 px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">Workspace</div>}
          <nav className="space-y-1">
            {navItems.map(({ href, label, icon: Icon }) => {
              const active = location === href || (href === '/search' && location.startsWith('/tenders/'));
              return <Link key={href} href={href} onClick={() => setOpen(false)} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`} className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors ${active ? 'bg-sidebar-primary/15 text-sidebar-primary' : 'text-slate-400 hover:bg-sidebar-accent hover:text-slate-100'}`}><Icon size={17} strokeWidth={active ? 2.4 : 1.8} /><span className={collapsed ? 'sr-only' : ''}>{label}</span>{label === 'Monitoramento' && !collapsed && <span className="ml-auto rounded-full bg-accent px-1.5 py-0.5 font-mono text-[9px] font-bold text-accent-foreground">3</span>}</Link>;
            })}
          </nav>
          {!collapsed && <div className="mb-3 mt-10 px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">Conta</div>}
          <nav className="space-y-1">
            <Link href="/settings" onClick={() => setOpen(false)} data-testid="link-nav-configuracoes" className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium ${location === '/settings' ? 'bg-sidebar-primary/15 text-sidebar-primary' : 'text-slate-400 hover:bg-sidebar-accent hover:text-slate-100'}`}><Settings size={17} /><span className={collapsed ? 'sr-only' : ''}>Configurações</span></Link>
            <Link href="/design-system" onClick={() => setOpen(false)} data-testid="link-nav-design-system" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-slate-400 hover:bg-sidebar-accent hover:text-slate-100"><CircleHelp size={17} /><span className={collapsed ? 'sr-only' : ''}>Design system</span></Link>
          </nav>
        </div>
        <div className="border-t border-sidebar-border p-3">
          <div className={`flex items-center gap-3 rounded-lg p-2 ${collapsed ? 'justify-center' : ''}`}>
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#d3b18c] text-xs font-bold text-[#3e2c20]">MA</div>
            {!collapsed && <div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold text-slate-100">Marina Almeida</div><div className="truncate text-[11px] text-slate-500">Operações · Atlas Engenharia</div></div>}
            {!collapsed && <ChevronDown size={14} className="text-slate-500" />}
          </div>
        </div>
      </aside>
      {open && <button aria-label="Fechar navegação" data-testid="button-overlay-menu" onClick={() => setOpen(false)} className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden" />}
      <div className={`min-h-[100dvh] transition-[padding] duration-200 ${collapsed ? 'lg:pl-[76px]' : 'lg:pl-[248px]'}`}>
        <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur-sm sm:px-8">
          <div className="flex items-center gap-3"><button aria-label="Abrir menu" data-testid="button-open-menu" onClick={() => setOpen(true)} className="rounded-lg p-2 hover:bg-muted lg:hidden"><Menu size={20} /></button><button aria-label="Recolher barra lateral" data-testid="button-collapse-sidebar" onClick={() => setCollapsed(!collapsed)} className="hidden rounded-lg p-2 text-muted-foreground hover:bg-muted lg:block">{collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}</button><div className="hidden font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground sm:block">Ambiente de demonstração</div></div>
          <div className="flex items-center gap-2"><button aria-label="Alternar tema" data-testid="button-toggle-theme" onClick={() => setDark(!dark)} className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">{dark ? <Sun size={18} /> : <Moon size={18} />}</button><button aria-label="Notificações" data-testid="button-notifications" className="relative rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><Bell size={18} /><span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent" /></button><div className="ml-2 hidden h-7 w-px bg-border sm:block" /><span className="hidden text-xs font-medium text-muted-foreground sm:block">Marina Almeida</span><div className="grid h-8 w-8 place-items-center rounded-full bg-[#d3b18c] text-[10px] font-bold text-[#3e2c20]">MA</div></div>
        </header>
        <main className="mx-auto max-w-[1440px] px-4 py-7 sm:px-8 lg:px-10">{children}</main>
      </div>
    </div>
  );
}