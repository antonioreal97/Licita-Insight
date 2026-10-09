import type { TenderPlatform } from '@/api';

export const NOT_REGISTERED_TEXT = 'Você ainda não é cadastrado nesta plataforma';

/**
 * Warn only about a known bidding room the company did not declare. With nothing declared in the profile,
 * every tender would carry the warning, so it stays silent.
 */
export function missingRegistration(platform: TenderPlatform | null | undefined, registeredPlatforms: readonly string[]): boolean {
  return Boolean(platform && platform.kind === 'platform' && registeredPlatforms.length > 0 && !registeredPlatforms.includes(platform.slug));
}

/** Copy for the detail page: only a known room is "Disputa em"; any other publisher is labelled for what it is. */
export function platformDescription(platform: TenderPlatform): { label: string; hint: string | null } {
  switch (platform.kind) {
    case 'platform':
      return { label: `Disputa em: ${platform.label}`, hint: null };
    case 'source_system':
    case 'other':
      return { label: platform.label, hint: 'Sistema que publicou o edital no PNCP. A sala de disputa não foi identificada: confira no edital.' };
    case 'unknown':
      return { label: 'Sistema de disputa não informado no PNCP', hint: 'Confira no edital onde acontece a disputa.' };
  }
}
