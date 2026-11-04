import { isApiError, type TenderFeedbackKind, type TenderFeedbackSection } from '@/api';

/** Contract bounds for `message` (tender-feedback-v1), counted after trim. */
export const FEEDBACK_MESSAGE_MIN = 10;
export const FEEDBACK_MESSAGE_MAX = 2000;

export const FEEDBACK_KIND_OPTIONS: { value: TenderFeedbackKind; label: string; hint: string }[] = [
  { value: 'wrong_or_missing_info', label: 'Informação errada ou faltando', hint: 'Prazo, valor, órgão ou outro dado diferente do edital.' },
  { value: 'possible_irregularity', label: 'Possível irregularidade no edital', hint: 'Algo no edital que parece restringir a disputa ou fugir da lei.' },
  { value: 'broken_link', label: 'Documento ou link quebrado', hint: 'Anexo que não abre ou link da fonte que não funciona.' },
  { value: 'other', label: 'Outro', hint: 'Qualquer outra coisa que podemos melhorar nesta página.' },
];

export const FEEDBACK_SECTION_OPTIONS: { value: TenderFeedbackSection; label: string }[] = [
  { value: 'summary', label: 'Resumo e objeto' },
  { value: 'deadlines', label: 'Prazos e datas' },
  { value: 'value', label: 'Valor estimado' },
  { value: 'documents', label: 'Documentos' },
  { value: 'sheet', label: 'Ficha do edital' },
  { value: 'items', label: 'Itens' },
  { value: 'timeline', label: 'Cronologia' },
  { value: 'other', label: 'Outra parte' },
];

export const FEEDBACK_SCOPE_NOTE =
  'O feedback vai para a equipe do Pardal Digital e nos ajuda a corrigir e melhorar a plataforma. Não é um canal de denúncia: irregularidades devem ser comunicadas formalmente ao órgão responsável ou ao Tribunal de Contas (TCU ou TCE).';

export const FEEDBACK_PRIVACY_NOTE = 'Não inclua dados pessoais (CPF, telefone, e-mail) na mensagem.';

/** Length counted the way the API counts it. */
export const feedbackMessageLength = (message: string) => message.trim().length;

/** Inline hint/error for the message field; `null` when it can be sent. */
export function feedbackMessageError(message: string): string | null {
  const length = feedbackMessageLength(message);
  if (length < FEEDBACK_MESSAGE_MIN) return `Escreva pelo menos ${FEEDBACK_MESSAGE_MIN} caracteres.`;
  if (length > FEEDBACK_MESSAGE_MAX) return `Use no máximo ${FEEDBACK_MESSAGE_MAX} caracteres.`;
  return null;
}

/** Message shown in the dialog when sending fails. */
export function feedbackErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    if (error.code === 'RATE_LIMITED') {
      const minutes = Math.ceil((error.retryAfterSeconds ?? 0) / 60);
      const wait = minutes > 1 ? `em ${minutes} minutos` : minutes === 1 ? 'em 1 minuto' : 'em instantes';
      return `Muitos envios em pouco tempo. Tente de novo ${wait}.`;
    }
    if (error.code === 'NOT_FOUND') return 'Este edital não está mais disponível. Recarregue a página.';
    if (error.code === 'INVALID_PARAMETER') return `Revise o tipo e a mensagem (de ${FEEDBACK_MESSAGE_MIN} a ${FEEDBACK_MESSAGE_MAX} caracteres).`;
    if (error.code === 'FORBIDDEN') return 'Não foi possível validar o envio. Recarregue a página e tente de novo.';
    if (error.code === 'NETWORK_ERROR') return 'Sem conexão com o servidor. Tente de novo.';
    if (error.requestId) return `Não foi possível enviar. Tente de novo. ref. ${error.requestId}`;
  }
  return 'Não foi possível enviar. Tente de novo.';
}

/** Path of the current page (no origin), sent as `pageUrl`. */
export function currentPagePath(location: Pick<Location, 'pathname' | 'search' | 'hash'> | undefined): string | null {
  if (!location) return null;
  const path = `${location.pathname}${location.search}${location.hash}`;
  return path.startsWith('/') ? path.slice(0, 2000) : null;
}
