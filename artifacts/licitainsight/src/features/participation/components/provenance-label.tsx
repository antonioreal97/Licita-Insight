import type { ReactNode } from 'react';
import { FileSearch, Target, UserRound, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type Kind = 'found' | 'automatic' | 'profile' | 'user';

/** The layer is said in text; the icon only reinforces it. Never a `status-*` colour (those belong to official status and deadlines). */
const KINDS: Record<Kind, { icon: LucideIcon; label: string }> = {
  found: { icon: FileSearch, label: 'Encontrado no edital' },
  automatic: { icon: Target, label: 'Avaliação automática' },
  profile: { icon: UserRound, label: 'Seu perfil diz' },
  user: { icon: UserRound, label: 'Você marcou' },
};

/** Where a line comes from: the edital's documents, the fit calculation, the user's profile or the user's own declaration. `children` replaces the default label. */
export function ProvenanceLabel({ kind, children, className }: { kind: Kind; children?: ReactNode; className?: string }) {
  const { icon: Icon, label } = KINDS[kind];
  return (
    <span data-provenance={kind} className={cn('inline-flex items-start gap-1.5 type-meta text-muted-foreground', className)}>
      <Icon size={13} aria-hidden="true" className="mt-0.5 shrink-0" />
      <span>{children ?? label}</span>
    </span>
  );
}
