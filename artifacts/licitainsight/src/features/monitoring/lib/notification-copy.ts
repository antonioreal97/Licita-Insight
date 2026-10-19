import type { Notification, TenderStatus } from '@/api';
import { BILLING_HREF, daysLabel, trialDaysLeft } from '@/features/billing/lib/trial';
import { notificationSearchHref, savedQueryHref } from '@/features/search/lib/search-defaults';
import { formatCurrency, formatDate, formatDateTime, formatNumber, parseApiDate } from '@/lib/format';
import { statusLabels } from '@/lib/tender-labels';

const valueStatusLabels: Record<string, string> = { disclosed: 'Divulgado', confidential: 'Sigiloso', not_published: 'Não publicado' };

/** Headline: "Prazo alterado", "3 editais novos em “Pavimentação”"… */
export function notificationTitle(n: Notification): string {
  switch (n.type) {
    case 'tender_deadline_changed':
      return 'Prazo alterado';
    case 'tender_status_changed':
      return 'Status alterado';
    case 'tender_document_added':
      return 'Novo documento';
    case 'tender_value_changed':
      return 'Valor alterado';
    case 'trial_ending': {
      const days = trialDaysLeft(trialEndOf(n));
      if (days === null) return 'Seu teste está terminando';
      return days === 0 ? 'Seu teste termina hoje' : `Seu teste termina em ${daysLabel(days)}`;
    }
    case 'company_document_expiring': {
      const days = Number(n.change?.from);
      return days === 1 ? 'Documento vence amanhã' : `Documento vence em ${days} dias`;
    }
    case 'saved_search_new_matches': {
      const count = n.matchCount ?? n.tenderIds.length;
      const name = n.savedSearch?.name ?? 'sua busca salva';
      return count === 1 ? `1 edital novo em “${name}”` : `${formatNumber(count)} editais novos em “${name}”`;
    }
    case 'profile_new_matches': {
      const count = n.matchCount ?? n.profileMatches.length;
      return count === 1 ? '1 edital novo com alta aderência' : `${formatNumber(count)} editais novos com alta aderência`;
    }
    default:
      return 'Atualização';
  }
}

/**
 * `trial_ending` payload is not pinned in the contract yet (CODEX_HANDOFF-007): read the end date from `change.to` when it is a date,
 * otherwise the copy stays without a number.
 */
function trialEndOf(n: Notification): string | null {
  const to = n.change?.to;
  return typeof to === 'string' && parseApiDate(to) ? to : null;
}

/** What the notification is about: "90012/2026 · Pavimentação de vias…" for tenders; `null` for saved searches (the title names it). */
export function notificationSubject(n: Notification): string | null {
  if (n.type === 'profile_new_matches') {
    const first = n.profileMatches[0];
    return first ? `${first.title} · ${first.organizationName}` : null;
  }
  if (!n.tender) return null;
  return n.tender.tenderNumberShort ? `${n.tender.tenderNumberShort} · ${n.tender.title}` : n.tender.title;
}

function formatChangeValue(n: Notification, value: string | number | null): string {
  if (value === null || value === '') return 'não informado';
  if (n.type === 'tender_deadline_changed') return formatDateTime(String(value), String(value));
  if (n.type === 'tender_status_changed') return statusLabels[value as TenderStatus] ?? String(value);
  if (n.type === 'tender_value_changed') return typeof value === 'number' ? formatCurrency(value) : (valueStatusLabels[value] ?? value);
  return String(value);
}

/** The change itself ("De 05 de out de 2026, 18:00 para 12 de out…"), or `null` when the API sent no details. */
export function notificationDescription(n: Notification): string | null {
  if (n.type === 'company_document_expiring') {
    const kind = n.change?.field.replace('companyDocument:', '') ?? '';
    const labels: Record<string, string> = { sicaf: 'SICAF', cnd_federal: 'CND federal', crf_fgts: 'CRF do FGTS', cndt: 'CNDT', state_tax_clearance: 'certidão estadual', municipal_tax_clearance: 'certidão municipal', bankruptcy_clearance: 'certidão de falência', balance_sheet: 'balanço patrimonial', articles_of_association: 'contrato social', technical_capacity_certificate: 'atestado de capacidade técnica', professional_council_registration: 'registro em conselho', platform_registration: 'cadastro em plataformas' };
    return `${labels[kind] ?? 'Documento'}: validade em ${formatDate(String(n.change?.to ?? ''))}.`;
  }
  if (n.type === 'saved_search_new_matches') {
    return 'Abra para ver os editais.';
  }
  if (n.type === 'profile_new_matches') {
    return n.profileMatches.length > 1 ? `E mais ${formatNumber(n.profileMatches.length - 1)} em destaque.` : null;
  }
  if (n.type === 'trial_ending') {
    const end = trialEndOf(n);
    return `${end ? `Termina em ${formatDate(end)}. ` : ''}Assine para continuar salvando e monitorando editais.`;
  }
  if (!n.change) return null;
  if (n.type === 'tender_document_added') return n.change.to === null ? null : `Documento: ${n.change.to}`;
  return `De ${formatChangeValue(n, n.change.from)} para ${formatChangeValue(n, n.change.to)}`;
}

/** Where a click goes: the tender, or the saved search's results. `null` when the payload has neither. */
export function notificationHref(n: Notification): string | null {
  if (n.type === 'company_document_expiring') return '/readiness';
  if (n.type === 'trial_ending') return BILLING_HREF;
  if (n.type === 'saved_search_new_matches') return notificationSearchHref(n.id);
  if (n.type === 'profile_new_matches') {
    const count = n.matchCount ?? n.tenderIds.length;
    if (count > 1) return notificationSearchHref(n.id);
    return n.profileMatches[0] ? `/tenders/${encodeURIComponent(n.profileMatches[0].id)}` : savedQueryHref('');
  }
  return n.tender ? `/tenders/${encodeURIComponent(n.tender.id)}` : null;
}

const relative = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
/** Each unit and how many of it make the next one (weeks stop at ~a month). */
const steps: [Intl.RelativeTimeFormatUnit, number][] = [
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
  ['week', 5],
];

/** "agora", "há 5 minutos", "ontem", "há 3 semanas"; older than ~a month → the date. */
export function formatRelativeTime(value: string, now: Date = new Date()): string {
  const date = parseApiDate(value);
  if (!date) return '—';
  const seconds = (date.getTime() - now.getTime()) / 1000;
  if (Math.abs(seconds) < 45) return 'agora';
  let amount = seconds / 60;
  for (const [unit, next] of steps) {
    if (Math.abs(amount) < next) return relative.format(Math.round(amount), unit);
    amount /= next;
  }
  return formatDateTime(value);
}
