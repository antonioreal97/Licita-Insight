import type { RegistrationRequirement } from '@/api';
import { formatDateNumeric } from '@/lib/format';

const systemsList = new Intl.ListFormat('pt-BR', { style: 'long', type: 'conjunction' });

/** "Credenciamento no SICAF e no Licitanet até 09/10/2026 (3 dias úteis antes da proposta)." */
export function registrationRequirementText(requirement: RegistrationRequirement): string {
  const where = requirement.systems.length > 0 ? ` em ${systemsList.format(requirement.systems.map((system) => system.label))}` : ' na plataforma';
  if (requirement.deadline && requirement.businessDaysBefore !== null) {
    const days = requirement.businessDaysBefore === 1 ? '1 dia útil' : `${requirement.businessDaysBefore} dias úteis`;
    return `Credenciamento${where} até ${formatDateNumeric(requirement.deadline)} (${days} antes do fim das propostas).`;
  }
  if (requirement.businessDaysBefore !== null) {
    return `Credenciamento${where} com ${requirement.businessDaysBefore} ${requirement.businessDaysBefore === 1 ? 'dia útil' : 'dias úteis'} de antecedência; o prazo das propostas não foi publicado.`;
  }
  return `Credenciamento${where} antes da disputa; o edital não fixa antecedência em dias úteis.`;
}
