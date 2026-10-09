import assert from 'node:assert/strict';
import test from 'node:test';
import type { RegistrationRequirement } from '@/api';
import { registrationRequirementText } from './registration-requirement';

const evidence = { documentTitle: 'Edital', documentUrl: 'https://pncp.gov.br/edital.pdf', page: 3, text: 'credenciados no SICAF e no LICITANET' };

const requirement = (patch: Partial<RegistrationRequirement>): RegistrationRequirement => ({
  systems: [
    { slug: 'sicaf', label: 'SICAF' },
    { slug: 'licitanet', label: 'Licitanet' },
  ],
  businessDaysBefore: 3,
  referenceDate: '2026-10-15',
  deadline: '2026-10-09',
  evidence,
  ...patch,
});

test('names every system and the computed deadline', () => {
  assert.equal(
    registrationRequirementText(requirement({})),
    'Credenciamento em SICAF e Licitanet até 09/10/2026 (3 dias úteis antes do fim das propostas).',
  );
});

test('keeps the business-day count when the proposal deadline is missing', () => {
  assert.equal(
    registrationRequirementText(requirement({ referenceDate: null, deadline: null })),
    'Credenciamento em SICAF e Licitanet com 3 dias úteis de antecedência; o prazo das propostas não foi publicado.',
  );
});

test('falls back to "a plataforma" when the clause names no system', () => {
  assert.equal(
    registrationRequirementText(requirement({ systems: [], businessDaysBefore: 1, deadline: '2026-10-14' })),
    'Credenciamento na plataforma até 14/10/2026 (1 dia útil antes do fim das propostas).',
  );
  assert.equal(
    registrationRequirementText(requirement({ businessDaysBefore: null, deadline: null })),
    'Credenciamento em SICAF e Licitanet antes da disputa; o edital não fixa antecedência em dias úteis.',
  );
});
