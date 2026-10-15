import React, { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { BriefcaseBusiness, LockKeyhole, Plus, TriangleAlert } from 'lucide-react';
import { Link } from 'wouter';
import type { BillingResponse } from '@/api';
import { Button } from '@/components/common/action-button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useBilling } from '@/features/billing/hooks/use-billing';
import { formatDate, parseApiDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useWorkspaceScope } from '../workspace-scope';
import {
  creatableWorkspaceTypes,
  WORKSPACE_TYPE_LABELS,
  type CreatableWorkspaceType,
  type WorkspaceSummary,
} from '../workspace-types';

/** A DOM-free gate: when journeys/cutover are unavailable it emits no wrapper, spacing or hidden control. */
export function WorkspaceFeatureSurface({ available, children }: { available: boolean; children: ReactNode }) {
  return available ? <>{children}</> : null;
}

export function WorkspaceSelector({
  workspaces,
  activeWorkspaceId,
  selectingWorkspaceId,
  canCreate,
  onSelect,
  onCreate,
  className,
}: {
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string | null;
  selectingWorkspaceId?: string;
  canCreate: boolean;
  onSelect: (workspaceId: string) => void;
  onCreate: () => void;
  className?: string;
}) {
  return (
    <div data-testid="workspace-selector" className={cn('flex min-w-0 items-center gap-2', className)}>
      <BriefcaseBusiness size={16} aria-hidden className="hidden shrink-0 text-muted-foreground sm:block" />
      <label className="min-w-0">
        <span className="sr-only">Espaço ativo</span>
        <select
          aria-label="Espaço ativo"
          value={activeWorkspaceId ?? ''}
          disabled={Boolean(selectingWorkspaceId)}
          onChange={(event) => event.target.value && onSelect(event.target.value)}
          className="h-9 max-w-[11rem] rounded-lg border border-input bg-background px-2 type-ui font-semibold text-foreground focus-visible:focus-ring sm:max-w-64"
        >
          {activeWorkspaceId === null && <option value="">Explorar tudo</option>}
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.id === activeWorkspaceId ? 'Ativo · ' : ''}
              {WORKSPACE_TYPE_LABELS[workspace.type]} · {workspace.name}
              {workspace.accessMode === 'read_only' ? ' · Somente leitura' : ''}
            </option>
          ))}
        </select>
      </label>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={canCreate ? 'Criar novo Espaço' : 'Limite de Espaços atingido'}
        title={canCreate ? 'Criar novo Espaço' : 'Limite de Espaços atingido'}
        disabled={!canCreate}
        onClick={onCreate}
        data-testid="button-create-workspace"
        className="px-2"
      >
        <Plus size={15} aria-hidden />
        <span className="hidden xl:inline">Novo Espaço</span>
      </Button>
    </div>
  );
}

export function WorkspaceOnboardingForm({
  types,
  limitLabel,
  submitting,
  error,
  onSubmit,
}: {
  types: CreatableWorkspaceType[];
  limitLabel: string;
  submitting: boolean;
  error?: string;
  onSubmit: (input: { type: CreatableWorkspaceType; name: string }) => void;
}) {
  const [type, setType] = useState<CreatableWorkspaceType>(types[0] ?? 'procurement');
  const [name, setName] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const normalized = name.trim();
    if (!normalized || !types.includes(type)) return;
    onSubmit({ type, name: normalized });
  };
  return (
    <form onSubmit={submit} data-testid="form-workspace-onboarding" className="grid gap-5">
      <div>
        <label htmlFor="workspace-type" className="type-ui font-semibold text-foreground">
          Tipo
        </label>
        <select
          id="workspace-type"
          value={type}
          onChange={(event) => setType(event.target.value as CreatableWorkspaceType)}
          className="mt-2 h-9 w-full rounded-lg border border-input bg-background px-3 type-ui text-foreground focus-visible:focus-ring"
        >
          {types.map((option) => (
            <option key={option} value={option}>
              {WORKSPACE_TYPE_LABELS[option]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="workspace-name" className="type-ui font-semibold text-foreground">
          Nome do Espaço
        </label>
        <Input
          id="workspace-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={120}
          required
          placeholder="Ex.: Licitações de infraestrutura"
          className="mt-2"
        />
      </div>
      <p className="type-meta text-muted-foreground">{limitLabel}</p>
      {type === 'procurement' && (
        <p className="type-meta text-muted-foreground">
          Depois de criar, complete palavras-chave e região no{' '}
          <Link href="/settings#perfil-empresa" className="font-semibold text-primary underline underline-offset-2">
            perfil da empresa
          </Link>
          .
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-destructive-subtle-border bg-destructive-subtle px-3 py-2 type-meta text-destructive-subtle-foreground">
          {error}
        </p>
      )}
      <DialogFooter className="gap-2">
        <Button type="submit" loading={submitting} disabled={!name.trim() || types.length === 0} data-testid="button-submit-workspace">
          Criar Espaço
        </Button>
      </DialogFooter>
    </form>
  );
}

export function accessExpiry(billing: BillingResponse): string | null {
  if (billing.source === 'trial') return billing.trialEndsAt ?? null;
  if (billing.source === 'coupon') return billing.couponAccessUntil ?? null;
  if (billing.source === 'subscription' && billing.status === 'canceled') return billing.currentPeriodEnd;
  return null;
}

export function downgradePlan(workspaces: WorkspaceSummary[]) {
  const ordered = workspaces.filter((workspace) => workspace.archivedAt === null).sort((a, b) => a.slot - b.slot || a.id.localeCompare(b.id));
  return { writable: ordered[0] ?? null, readOnly: ordered.slice(1) };
}

export function canCreateWorkspace(limits: { used: number; maximum: number }, types: CreatableWorkspaceType[]) {
  return limits.used < limits.maximum && types.length > 0;
}

export function WorkspaceDowngradeNotice({ workspaces, expiresAt, now = new Date() }: { workspaces: WorkspaceSummary[]; expiresAt: string; now?: Date }) {
  const expiry = parseApiDate(expiresAt);
  const plan = downgradePlan(workspaces);
  if (!expiry || expiry <= now || !plan.writable || plan.readOnly.length === 0) return null;
  return (
    <div
      role="status"
      data-testid="workspace-downgrade-notice"
      className="flex items-start gap-3 border-b border-warning/40 bg-warning-subtle px-4 py-3 text-warning-subtle-foreground sm:px-8"
    >
      <TriangleAlert size={17} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0" />
      <div className="min-w-0 type-ui">
        <p className="font-semibold">Seu acesso termina em {formatDate(expiresAt)}.</p>
        <p className="mt-1">
          “{plan.writable.name}” continuará gravável. {plan.readOnly.length === 1 ? 'Este Espaço ficará' : 'Estes Espaços ficarão'} somente leitura, sem excluir nada:{' '}
          {plan.readOnly.map((workspace) => `“${workspace.name}”`).join(', ')}.
        </p>
      </div>
    </div>
  );
}

export function ActiveWorkspaceReadOnlyNotice({ workspace }: { workspace: WorkspaceSummary }) {
  if (workspace.accessMode !== 'read_only') return null;
  return (
    <div role="status" data-testid="workspace-read-only-notice" className="flex items-center gap-2 border-b border-border bg-muted px-4 py-2.5 type-ui text-muted-foreground sm:px-8">
      <LockKeyhole size={16} aria-hidden className="shrink-0" />
      <span>
        <strong className="text-foreground">“{workspace.name}” está somente leitura.</strong> Você pode consultar e exportar os dados; nada foi excluído.
      </span>
    </div>
  );
}

export function WorkspaceControls() {
  const scope = useWorkspaceScope();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const types = useMemo(() => creatableWorkspaceTypes(scope.enabledJourneys), [scope.enabledJourneys]);
  const limits = scope.limits ?? { used: 0, maximum: 1 as const };
  const canCreate = canCreateWorkspace(limits, types);
  return (
    <WorkspaceFeatureSurface available={scope.available && scope.limits !== null}>
      <WorkspaceSelector
        workspaces={scope.workspaces}
        activeWorkspaceId={scope.activeWorkspace?.id ?? null}
        selectingWorkspaceId={scope.selectingWorkspaceId}
        canCreate={canCreate}
        onSelect={scope.selectWorkspace}
        onCreate={() => {
          setError(undefined);
          setOpen(true);
        }}
        className="border-b border-border bg-background px-4 py-2 sm:px-8"
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="dialog-workspace-onboarding">
          <DialogHeader>
            <DialogTitle>Criar Espaço</DialogTitle>
            <DialogDescription>Escolha um objetivo e dê um nome fácil de reconhecer. O perfil detalhado vem depois.</DialogDescription>
          </DialogHeader>
          <WorkspaceOnboardingForm
            types={types}
            limitLabel={`${limits.used} de ${limits.maximum} Espaços em uso.`}
            submitting={scope.creating}
            error={error}
            onSubmit={(input) => {
              setError(undefined);
              void scope.createWorkspace(input).then(
                () => setOpen(false),
                () => setError('Não foi possível criar o Espaço. Confira o limite e tente novamente.'),
              );
            }}
          />
        </DialogContent>
      </Dialog>
    </WorkspaceFeatureSurface>
  );
}

export function WorkspaceShellNotices() {
  const scope = useWorkspaceScope();
  const billing = useBilling();
  if (!scope.available || !scope.activeWorkspace) return null;
  const expiresAt = billing.data ? accessExpiry(billing.data) : null;
  return (
    <>
      {expiresAt && <WorkspaceDowngradeNotice workspaces={scope.workspaces} expiresAt={expiresAt} />}
      <ActiveWorkspaceReadOnlyNotice workspace={scope.activeWorkspace} />
    </>
  );
}
