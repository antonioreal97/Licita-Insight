import React, { useEffect, useState } from 'react';
import type { ApplicantType, UsagePurpose } from '@/api';
import { Button } from '@/components/common/action-button';
import { ErrorState } from '@/components/common/query-states';
import { toast } from '@/hooks/use-toast';
import { useSaveUsageProfile, useUsageProfile } from '../hooks/use-usage-profile';

export const PURPOSE_OPTIONS: Array<[UsagePurpose, string]> = [
  ['procurement', 'Vender para o governo (licitações)'],
  ['culture', 'Captar recursos para cultura'],
  ['funding', 'Buscar fomento e projetos'],
  ['research', 'Pesquisa'],
  ['study', 'Estudar'],
];
export const APPLICANT_OPTIONS: Array<[ApplicantType, string]> = [
  ['individual', 'Pessoa física'],
  ['mei', 'MEI'],
  ['company', 'Empresa'],
  ['nonprofit', 'Organização sem fins lucrativos'],
];

export function ChipGroup<T extends string>({ legend, options, selected, onChange }: {
  legend: string;
  options: Array<[T, string]>;
  selected: T[];
  onChange: (value: T[]) => void;
}) {
  return <fieldset>
    <legend className="type-ui font-semibold text-foreground">{legend} <span className="font-normal text-muted-foreground">(opcional)</span></legend>
    <div className="mt-3 flex flex-wrap gap-2">
      {options.map(([value, label]) => <label key={value} className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 type-ui transition-colors focus-within:focus-ring ${selected.includes(value) ? 'border-primary bg-secondary text-foreground' : 'border-border bg-background text-foreground hover:bg-muted'}`}>
        <input type="checkbox" className="size-4 accent-primary" checked={selected.includes(value)} onChange={() => onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value])} />
        {label}
      </label>)}
    </div>
  </fieldset>;
}

export function UsageProfileSection() {
  const profile = useUsageProfile();
  const save = useSaveUsageProfile();
  const [purposes, setPurposes] = useState<UsagePurpose[]>([]);
  const [applicants, setApplicants] = useState<ApplicantType[]>([]);
  useEffect(() => {
    if (profile.data) {
      setPurposes(profile.data.usagePurposes);
      setApplicants(profile.data.applicantTypes);
    }
  }, [profile.data]);
  if (profile.isPending) return <p className="mt-6 type-meta text-muted-foreground">Carregando preferências…</p>;
  if (profile.isError) return <div className="mt-6"><ErrorState error={profile.error} onRetry={() => profile.refetch()} /></div>;
  return <form className="mt-6 space-y-5 border-t border-border pt-5" onSubmit={(event) => {
    event.preventDefault();
    save.mutate({ usagePurposes: purposes, applicantTypes: applicants }, {
      onSuccess: () => toast({ title: 'Preferências salvas', description: 'Vamos usar suas respostas para organizar melhor as recomendações.' }),
    });
  }}>
    <div>
      <h3 className="type-body font-semibold text-foreground">Seu uso do Pardal</h3>
      <p className="mt-1 type-meta text-muted-foreground">Essas respostas ajudam a mostrar materiais mais relevantes. Você pode mudar ou deixar em branco.</p>
    </div>
    <ChipGroup legend="Para que você vai usar o Pardal?" options={PURPOSE_OPTIONS} selected={purposes} onChange={setPurposes} />
    <ChipGroup legend="Você participa como" options={APPLICANT_OPTIONS} selected={applicants} onChange={setApplicants} />
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" loading={save.isPending} disabled={save.isPending}>Salvar respostas</Button>
      {save.isError && <span role="alert" className="type-meta text-destructive">Não foi possível salvar. Tente novamente.</span>}
    </div>
  </form>;
}
