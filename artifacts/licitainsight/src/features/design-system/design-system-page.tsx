import type { ReactNode } from 'react';
import { ArrowRight, CircleAlert, Download, Inbox, Plus } from 'lucide-react';
import type { TenderStatus } from '@/api';
import { Button, type ActionButtonSize, type ActionButtonVariant } from '@/components/common/action-button';
import { PageTitle } from '@/components/common/page-title';
import { StatusBadge } from '@/features/tenders/components/status-badge';

// Living reference. Every value on this page is a real token from src/index.css — never hard-code here.
// Written spec: /design-system/*.md (repo root).

type Swatch = { name: string; token: string; className: string; ink?: string };

const palette: Swatch[] = [
  { name: 'Lima', token: '--lima', className: 'bg-lima', ink: 'text-petroleo' },
  { name: 'Aqua', token: '--aqua', className: 'bg-aqua', ink: 'text-petroleo' },
  { name: 'Sálvia', token: '--salvia', className: 'bg-salvia', ink: 'text-petroleo' },
  { name: 'Oliva', token: '--oliva', className: 'bg-oliva', ink: 'text-petroleo' },
  { name: 'Névoa', token: '--nevoa', className: 'bg-nevoa', ink: 'text-petroleo' },
  { name: 'Creme', token: '--creme', className: 'bg-creme', ink: 'text-petroleo' },
  { name: 'Creme claro', token: '--creme-claro', className: 'bg-creme-claro', ink: 'text-petroleo' },
  { name: 'Petróleo', token: '--petroleo', className: 'bg-petroleo', ink: 'text-creme-claro' },
  { name: 'Petróleo profundo', token: '--petroleo-profundo', className: 'bg-petroleo-profundo', ink: 'text-creme-claro' },
];

const semantic: Swatch[] = [
  { name: 'Fundo', token: '--fundo', className: 'bg-fundo', ink: 'text-texto' },
  { name: 'Fundo alt', token: '--fundo-alt', className: 'bg-fundo-alt', ink: 'text-texto' },
  { name: 'Destaque', token: '--destaque', className: 'bg-destaque', ink: 'text-texto-sobre-destaque' },
  { name: 'Superfície inversa', token: '--superficie-inversa', className: 'bg-superficie-inversa', ink: 'text-texto-inverso' },
  { name: 'Linha', token: '--linha', className: 'bg-linha' },
  { name: 'Foco', token: '--foco', className: 'bg-foco' },
];

const surfaces: Swatch[] = [
  { name: 'Background', token: '--background', className: 'bg-background' },
  { name: 'Surface', token: '--surface', className: 'bg-surface' },
  { name: 'Surface sunken', token: '--surface-sunken', className: 'bg-surface-sunken' },
  { name: 'Surface raised', token: '--surface-raised', className: 'bg-surface-raised' },
  { name: 'Muted', token: '--muted', className: 'bg-muted' },
  { name: 'Sidebar', token: '--sidebar', className: 'bg-sidebar' },
];

const ink: Swatch[] = [
  { name: 'Foreground', token: '--foreground', className: 'bg-foreground' },
  { name: 'Muted foreground', token: '--muted-foreground', className: 'bg-muted-foreground' },
  { name: 'Foreground subtle', token: '--foreground-subtle', className: 'bg-foreground-subtle' },
  { name: 'Border subtle', token: '--border-subtle', className: 'bg-border-subtle' },
  { name: 'Border', token: '--border', className: 'bg-border' },
  { name: 'Border strong', token: '--border-strong', className: 'bg-border-strong' },
];

const intent: Swatch[] = [
  { name: 'Primary', token: '--primary', className: 'bg-primary', ink: 'text-primary-foreground' },
  { name: 'Primary hover', token: '--primary-hover', className: 'bg-primary-hover', ink: 'text-primary-foreground' },
  { name: 'Primary subtle', token: '--primary-subtle', className: 'bg-primary-subtle', ink: 'text-primary-subtle-foreground' },
  { name: 'Action = destaque', token: '--action', className: 'bg-action', ink: 'text-action-foreground' },
  { name: 'Action hover', token: '--action-hover', className: 'bg-action-hover', ink: 'text-action-foreground' },
  { name: 'Inverse', token: '--inverse', className: 'bg-inverse', ink: 'text-inverse-foreground' },
  { name: 'Accent', token: '--accent', className: 'bg-accent', ink: 'text-accent-foreground' },
  { name: 'Destructive', token: '--destructive', className: 'bg-destructive', ink: 'text-destructive-foreground' },
  { name: 'Destructive subtle', token: '--destructive-subtle', className: 'bg-destructive-subtle', ink: 'text-destructive-subtle-foreground' },
];

const statuses: { status: TenderStatus; token: string; className: string; light: string; dark: string }[] = [
  { status: 'open', token: '--status-open', className: 'bg-status-open text-status-open-foreground', light: '5.7', dark: '5.7' },
  {
    status: 'under_review',
    token: '--status-under-review',
    className: 'bg-status-under-review text-status-under-review-foreground',
    light: '5.6',
    dark: '5.6',
  },
  { status: 'closed', token: '--status-closed', className: 'bg-status-closed text-status-closed-foreground', light: '6.2', dark: '6.2' },
  { status: 'suspended', token: '--status-suspended', className: 'bg-status-suspended text-status-suspended-foreground', light: '9.6', dark: '8.8' },
  { status: 'cancelled', token: '--status-cancelled', className: 'bg-status-cancelled text-status-cancelled-foreground', light: '4.9', dark: '4.7' },
];

const typeRoles: { role: string; spec: string; className: string; sample: string }[] = [
  { role: 'type-display', spec: 'título · 64 / 68 · 500', className: 'type-display', sample: 'Pardal' },
  { role: 'type-titulo-1', spec: 'título · 44 / 52 · 500', className: 'type-titulo-1', sample: 'Novos caminhos se abrem' },
  { role: 'type-titulo-2', spec: 'título · 32 / 40 · 500', className: 'type-titulo-2', sample: 'Pregão eletrônico 042/2024' },
  { role: 'type-titulo-3', spec: 'título · 24 / 32 · 500', className: 'type-titulo-3', sample: 'Resumo executivo do edital' },
  { role: 'type-title', spec: 'título · 20 / 28 · 600', className: 'type-title', sample: 'Editais que exigem atenção' },
  { role: 'type-section', spec: 'título · 16 / 22 · 600', className: 'type-section', sample: 'Documentos e anexos' },
  { role: 'type-corpo-grande', spec: 'texto · 20 / 30 · 400', className: 'type-corpo-grande', sample: 'Facilitamos processos que costumam parecer complexos.' },
  { role: 'type-corpo', spec: 'texto · 16 / 26 · 400', className: 'type-corpo', sample: 'Contratação de serviços de manutenção predial preventiva e corretiva.' },
  { role: 'type-ui', spec: 'texto · 14 / 22', className: 'type-ui font-medium', sample: 'Filtrar por modalidade, órgão e prazo' },
  { role: 'type-legenda', spec: 'texto · 14 / 20 · 400', className: 'type-legenda text-muted-foreground', sample: 'Atualizado hoje' },
  { role: 'type-meta', spec: 'texto · 12 / 18', className: 'type-meta font-medium text-muted-foreground', sample: 'Publicado há 2 dias · Prefeitura de Campinas' },
  { role: 'type-rotulo', spec: 'texto · 13 / 16 · caixa alta', className: 'type-rotulo', sample: 'Novidade' },
  { role: 'type-data', spec: 'texto · tabular', className: 'type-data text-sm', sample: 'R$ 1.284.500,00 · PE-042/2024 · 96%' },
];

const variants: { variant: ActionButtonVariant; label: string }[] = [
  { variant: 'primary', label: 'Ação principal' },
  { variant: 'outline', label: 'Secundária' },
  { variant: 'dark', label: 'Ênfase' },
  { variant: 'ghost', label: 'Terciária' },
];

const sizes: ActionButtonSize[] = ['sm', 'md', 'lg'];

const motion = [
  { token: '--duration-instant', value: '80ms', use: 'Press feedback, cor de ícone' },
  { token: '--duration-fast', value: '120ms', use: 'Hover, foco, botões, campos' },
  { token: '--duration-base', value: '180ms', use: 'Popover, dropdown, tooltip' },
  { token: '--duration-slow', value: '280ms', use: 'Sheet, dialog, sidebar' },
];

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 sm:p-7">
      <h2 className="type-section">{title}</h2>
      {description && <p className="mt-1 max-w-prose type-ui text-muted-foreground">{description}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function SwatchGrid({ label, items }: { label: string; items: Swatch[] }) {
  return (
    <div>
      <div className="type-label text-muted-foreground">{label}</div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {items.map((s) => (
          <div key={s.token} className="min-w-0">
            <div className={`grid h-14 place-items-center rounded-lg border border-border-subtle ${s.className} ${s.ink ?? ''}`}>
              {s.ink && <span className="type-meta font-semibold">Aa</span>}
            </div>
            <div className="mt-2 truncate type-meta font-semibold">{s.name}</div>
            <div className="truncate font-mono text-3xs text-muted-foreground">{s.token}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DesignSystemPage() {
  return (
    <>
      <PageTitle eyebrow="referência viva" title="Design system" description="A linguagem visual do Pardal Digital, em tokens e componentes reais." />
      <div className="space-y-6">
        <Section title="Cor" description="Tokens semânticos. Alterne o tema no topo da página: cada amostra muda junto, sem exceções.">
          <div className="space-y-7">
            <SwatchGrid label="Paleta Pardal" items={palette} />
            <SwatchGrid label="Semânticos Pardal" items={semantic} />
            <SwatchGrid label="Superfícies" items={surfaces} />
            <SwatchGrid label="Texto & bordas" items={ink} />
            <SwatchGrid label="Intenção" items={intent} />
          </div>
        </Section>

        <Section title="Status do edital" description="Pares fundo + texto com contraste AA nos dois temas. Encerrado e revogado são neutros: não pedem ação.">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left">
              <thead>
                <tr className="border-b border-border type-label text-muted-foreground">
                  <th className="pb-3 font-normal">Badge</th>
                  <th className="pb-3 font-normal">Token</th>
                  <th className="pb-3 font-normal">Classes</th>
                  <th className="pb-3 text-right font-normal">Claro</th>
                  <th className="pb-3 text-right font-normal">Escuro</th>
                </tr>
              </thead>
              <tbody>
                {statuses.map((s) => (
                  <tr key={s.status} className="border-b border-border-subtle last:border-0">
                    <td className="py-3">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="py-3 font-mono text-2xs">{s.token}</td>
                    <td className="py-3 font-mono text-2xs text-muted-foreground">{s.className}</td>
                    <td className="py-3 text-right type-data text-2xs">{s.light}:1</td>
                    <td className="py-3 text-right type-data text-2xs">{s.dark}:1</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Tipografia" description="Qurova (Quicksand por enquanto) nos títulos, Nexa (Montserrat por enquanto) no texto. Títulos em caixa normal; só o rótulo em caixa alta.">
          <div className="divide-y divide-border-subtle">
            {typeRoles.map((t) => (
              <div key={t.role} className="grid gap-1 py-4 first:pt-0 last:pb-0 sm:grid-cols-[180px_1fr] sm:items-baseline sm:gap-6">
                <div>
                  <div className="font-mono text-2xs font-bold">{t.role}</div>
                  <div className="font-mono text-3xs text-muted-foreground">{t.spec}</div>
                </div>
                <div className={`min-w-0 ${t.className}`}>{t.sample}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Botões" description="Pílula. No máximo um destaque lima por tela. Use Tab para ver o anel de foco (2px --foco, afastado 2px).">
          <div className="space-y-6">
            {variants.map(({ variant, label }) => (
              <div key={variant} className="grid gap-3 sm:grid-cols-[120px_1fr] sm:items-center">
                <div className="font-mono text-2xs font-bold">{variant}</div>
                <div className="flex flex-wrap items-center gap-3">
                  {sizes.map((size) => (
                    <Button key={size} variant={variant} size={size} data-testid={`button-system-${variant}-${size}`}>
                      {size === 'lg' && <Plus size={16} />}
                      {label}
                      {size === 'md' && variant === 'primary' && <ArrowRight size={15} />}
                    </Button>
                  ))}
                  <Button variant={variant} disabled data-testid={`button-system-${variant}-disabled`}>
                    Desabilitado
                  </Button>
                  <Button variant={variant} loading data-testid={`button-system-${variant}-loading`}>
                    Salvando
                  </Button>
                </div>
              </div>
            ))}
            <div className="grid gap-3 border-t border-border-subtle pt-6 sm:grid-cols-[120px_1fr] sm:items-center">
              <div className="font-mono text-2xs font-bold">toggle</div>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" aria-pressed="false" data-testid="button-system-toggle-off">
                  <Download size={15} />
                  Não pressionado
                </Button>
                <Button variant="outline" aria-pressed="true" data-testid="button-system-toggle-on">
                  <Download size={15} />
                  Pressionado
                </Button>
              </div>
            </div>
          </div>
        </Section>

        <Section title="Campos" description="Raio --raio-sm, borda --input (= --texto), foco com anel sólido --foco. Erro nunca só por cor: sempre com mensagem.">
          <div className="grid max-w-3xl gap-4 sm:grid-cols-3">
            <label className="field">
              Palavra-chave
              <input data-testid="input-system" placeholder="Ex.: manutenção predial" />
            </label>
            <label className="field">
              Desabilitado
              <input data-testid="input-system-disabled" placeholder="Indisponível" disabled />
            </label>
            <label className="field">
              Com erro
              <input data-testid="input-system-invalid" defaultValue="31/02/2024" aria-invalid="true" aria-describedby="ds-input-error" />
              <span id="ds-input-error" className="type-meta font-medium text-destructive">
                Data inválida
              </span>
            </label>
            <label className="field">
              Modalidade
              <select
                data-testid="select-system"
                className="h-10 rounded-lg border border-input bg-background px-3 type-ui font-normal text-foreground transition-colors duration-fast focus:border-ring dark:bg-card"
              >
                <option>Pregão eletrônico</option>
                <option>Concorrência</option>
              </select>
            </label>
          </div>
        </Section>

        <Section title="Estados" description="Vazio, carregando e erro. Sempre dizem o que aconteceu e qual é a próxima ação.">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-dashed border-border-strong p-6 text-center">
              <Inbox size={18} className="mx-auto text-foreground-subtle" />
              <div className="mt-3 type-ui font-semibold">Nenhum edital encontrado</div>
              <div className="mt-1 type-meta text-muted-foreground">Remova um filtro ou amplie o período.</div>
              <Button variant="outline" size="sm" className="mt-4" data-testid="button-system-empty-clear">
                Limpar filtros
              </Button>
            </div>
            <div className="rounded-lg border border-border p-6" aria-busy="true" aria-label="Carregando">
              <div className="h-3 w-3/4 animate-pulse rounded-sm bg-muted" />
              <div className="mt-3 h-2 w-full animate-pulse rounded-sm bg-muted" />
              <div className="mt-2 h-2 w-1/2 animate-pulse rounded-sm bg-muted" />
              <div className="mt-5 h-6 w-20 animate-pulse rounded-full bg-muted" />
            </div>
            <div className="rounded-lg border border-destructive-subtle-border bg-destructive-subtle p-6 text-destructive-subtle-foreground" role="alert">
              <CircleAlert size={18} />
              <div className="mt-3 type-ui font-semibold">Não foi possível carregar</div>
              <div className="mt-1 type-meta opacity-90">O serviço de busca não respondeu.</div>
              <Button variant="outline" size="sm" className="mt-4" data-testid="button-system-retry">
                Tentar novamente
              </Button>
            </div>
          </div>
        </Section>

        <Section title="Forma & movimento" description="Raio 8px nos campos, 14px nos cartões, 24px em diálogos e seções, pílula em botões e chips. Sem sombras nem gradientes.">
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="grid grid-cols-4 gap-3">
              {[
                { name: '--raio-sm', className: 'rounded-lg' },
                { name: '--raio-md', className: 'rounded-xl' },
                { name: '--raio-lg', className: 'rounded-2xl' },
                { name: '--raio-pill', className: 'rounded-pill' },
              ].map((r) => (
                <div key={r.name}>
                  <div className={`h-16 border border-border bg-salvia ${r.className}`} />
                  <div className="mt-2 font-mono text-3xs text-muted-foreground">{r.name}</div>
                </div>
              ))}
            </div>
            <div className="divide-y divide-border-subtle">
              {motion.map((m) => (
                <div key={m.token} className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0">
                  <span className="font-mono text-2xs">{m.token}</span>
                  <span className="type-meta text-muted-foreground">{m.use}</span>
                  <span className="type-data text-2xs">{m.value}</span>
                </div>
              ))}
            </div>
          </div>
        </Section>
      </div>
    </>
  );
}
