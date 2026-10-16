import React from 'react';
import { Check } from 'lucide-react';
import { Link } from 'wouter';
import type { GuidedDraft } from './profile-progress';
import { profileProgress } from './profile-progress';

export function ProfileMeter({
  profile,
  onChoose,
  embedded = false,
  maxItems = 3,
}: {
  profile: GuidedDraft | null;
  onChoose?: (step: number) => void;
  embedded?: boolean;
  maxItems?: number;
}) {
  const { percent, next } = profileProgress(profile);
  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <h3 className="type-ui font-semibold">Perfil {percent}%</h3>
        {percent === 100 && (
          <span className="inline-flex items-center gap-1 type-meta">
            <Check size={16} aria-hidden /> Perfil completo
          </span>
        )}
      </div>
      <div
        role="progressbar"
        aria-label="Perfil completo"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="mt-3 h-2 overflow-hidden rounded-pill bg-muted"
      >
        <div className="h-full rounded-pill bg-primary motion-safe:transition-[width] motion-safe:duration-300" style={{ width: `${percent}%` }} />
      </div>
      {percent === 100 ? (
        <p className="mt-3 type-meta text-muted-foreground">
          Tudo pronto para uma seleção mais alinhada à sua empresa. Você pode ajustar o perfil quando quiser.
        </p>
      ) : (
        <>
          <ul className="mt-4 space-y-3 type-meta">
            {next.slice(0, maxItems).map((item) => (
              <li key={item.key}>
                {onChoose ? (
                  <button type="button" className="text-left font-semibold underline-offset-4 hover:underline" onClick={() => onChoose(item.step)}>
                    {item.text}
                  </button>
                ) : (
                  <Link href="/settings#perfil-empresa" className="font-semibold underline-offset-4 hover:underline">
                    {item.text}
                  </Link>
                )}
                <span className="block text-muted-foreground">→ {item.reward}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 type-meta text-muted-foreground">Complete no seu ritmo. Faixa de valor e plataformas são opcionais.</p>
        </>
      )}
    </>
  );
  return embedded ? (
    <div role="group" aria-label="Completude do perfil" data-testid="profile-meter">
      {content}
    </div>
  ) : (
    <section aria-label="Completude do perfil" className="rounded-xl border border-border bg-card p-4 sm:p-5" data-testid="profile-meter">
      {content}
    </section>
  );
}
