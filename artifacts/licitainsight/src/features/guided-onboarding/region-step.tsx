import React from 'react';
import type { CompanyCoverage, CompanyMacroregion } from '@/api';
import { MunicipalityAutocomplete } from '@/features/company-profile/components/company-profile-section';
import { UFS } from '@/lib/ufs';

const regions: { value: CompanyMacroregion; label: string }[] = [
  { value: 'north', label: 'Norte' },
  { value: 'northeast', label: 'Nordeste' },
  { value: 'central_west', label: 'Centro-Oeste' },
  { value: 'southeast', label: 'Sudeste' },
  { value: 'south', label: 'Sul' },
];
const toggle = <T,>(items: T[], item: T) => (items.includes(item) ? items.filter((value) => value !== item) : [...items, item]);

export function RegionStep({ value, onChange }: { value: CompanyCoverage; onChange: (value: CompanyCoverage) => void }) {
  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="type-ui font-semibold">Sua área de atendimento</legend>
        <div className="mt-3 flex flex-wrap gap-4 type-ui">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="guided-coverage"
              checked={value.scope === 'national'}
              onChange={() => onChange({ scope: 'national', mode: value.mode, acceptsRemote: value.acceptsRemote })}
            />{' '}
            Brasil inteiro
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="guided-coverage"
              checked={value.scope === 'custom'}
              onChange={() =>
                onChange({
                  scope: 'custom',
                  mode: value.mode,
                  acceptsRemote: value.acceptsRemote,
                  states: [],
                  regions: [],
                  municipalities: [],
                  radius: null,
                })
              }
            />{' '}
            Definir minha região
          </label>
        </div>
      </fieldset>
      {value.scope === 'custom' && (
        <>
          <fieldset>
            <legend className="type-meta font-semibold">Macrorregiões</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {regions.map(({ value: region, label }) => (
                <label key={region} className="flex items-center gap-2 rounded-lg border border-border p-2 type-meta">
                  <input
                    type="checkbox"
                    checked={value.regions.includes(region)}
                    onChange={() => onChange({ ...value, regions: toggle(value.regions, region) })}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="type-meta font-semibold">Estados</legend>
            <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-9">
              {UFS.map((state) => (
                <label key={state} className="flex items-center justify-center gap-1 rounded-lg border border-border py-2 type-meta">
                  <input
                    type="checkbox"
                    checked={value.states.includes(state)}
                    onChange={() => onChange({ ...value, states: toggle(value.states, state) })}
                  />
                  {state}
                </label>
              ))}
            </div>
          </fieldset>
          <MunicipalityAutocomplete
            label="Municípios específicos"
            hint="Selecione na base do IBGE."
            selected={value.municipalities}
            onSelect={(city) => onChange({ ...value, municipalities: [...value.municipalities, city] })}
            testId="guided-municipality"
          />
          {value.municipalities.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {value.municipalities.map((city) => (
                <li key={city.ibgeCode}>
                  <button
                    type="button"
                    className="rounded-pill border border-border px-3 py-2 type-meta"
                    aria-label={`Remover ${city.name}-${city.state}`}
                    onClick={() =>
                      onChange({ ...value, municipalities: value.municipalities.filter((item) => item.ibgeCode !== city.ibgeCode) })
                    }
                  >
                    {city.name}-{city.state} ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
            <MunicipalityAutocomplete
              label="Cidade-sede para o raio"
              hint="Opcional: escolha a cidade e a distância."
              selected={value.radius ? [value.radius.center] : []}
              onSelect={(city) => onChange({ ...value, radius: { center: city, km: value.radius?.km ?? 100 } })}
              testId="guided-headquarters"
            />
            <label className="field">
              Raio máximo
              <select
                disabled={!value.radius}
                value={value.radius?.km ?? 100}
                onChange={(event) =>
                  value.radius &&
                  onChange({ ...value, radius: { ...value.radius, km: Number(event.target.value) as 50 | 100 | 200 | 300 | 500 } })
                }
              >
                {[50, 100, 200, 300, 500].map((km) => (
                  <option key={km} value={km}>
                    {km} km
                  </option>
                ))}
              </select>
            </label>
          </div>
          {value.radius && (
            <p className="type-meta">
              Sede: {value.radius.center.name}-{value.radius.center.state}.{' '}
              <button type="button" className="underline" onClick={() => onChange({ ...value, radius: null })}>
                Remover raio
              </button>
            </p>
          )}
          <label className="field">
            Como usar a região
            <select value={value.mode} onChange={(event) => onChange({ ...value, mode: event.target.value as 'strict' | 'prioritize' })}>
              <option value="strict">Somente na minha região</option>
              <option value="prioritize">Priorizar minha região</option>
            </select>
          </label>
        </>
      )}
      <label className="flex items-start gap-2 type-meta">
        <input
          type="checkbox"
          checked={value.acceptsRemote}
          onChange={(event) => onChange({ ...value, acceptsRemote: event.target.checked })}
        />
        Aceito contratos executados à distância, quando a categoria permitir.
      </label>
      <p className="type-meta text-muted-foreground">Sem uma região específica, consideramos o Brasil inteiro.</p>
    </div>
  );
}
