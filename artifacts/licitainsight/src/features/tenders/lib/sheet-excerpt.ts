import type { SheetFieldId } from '@/api';

/** Accent-insensitive cues per passage-only field: where in the ~700-char passage the answer usually starts. */
const CUES: Partial<Record<SheetFieldId, RegExp>> = {
  bid_guarantee: /garantia (da|de) proposta|garantia de participa/,
  contract_guarantee: /garantia (contratual|de execucao|do contrato)|seguro-garantia|caucao/,
  penalties: /multa/,
  technical_qualification: /qualificacao tecnica|capacidade tecnica|atestado/,
  financial_qualification: /liquidez|patrimonio liquido|capital (social )?minimo|qualificacao economic/,
  contract_term: /vigencia|vigorara/,
  delivery_term: /prazo (de|para) (entrega|execucao|fornecimento)|entregue(s)? (em|no prazo)/,
  price_adjustment: /reajust|repactua/,
};

/** Same length as the input (NFD + stripping marks keeps one char per char for Portuguese text), so indexes line up. */
const fold = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/**
 * Where the preview should start: the item number ("23.1.") or sentence that contains the field's cue, instead of the
 * passage start (often the tail of the previous item). Returns the full text when there is no cue or it is near the start.
 */
export function sheetExcerpt(id: SheetFieldId, text: string): { text: string; trimmed: boolean } {
  const cue = CUES[id];
  if (!cue) return { text, trimmed: false };
  const folded = fold(text);
  if (folded.length !== text.length) return { text, trimmed: false };
  const match = cue.exec(folded);
  if (!match || match.index < 40) return { text, trimmed: false };
  const before = folded.slice(0, match.index);
  // Prefer the start of a numbered item ("21. DA GARANTIA", "23.1."), else the last sentence break.
  // Item numbers carry a dot ("21. ", "23.1.", "14.1.2."); plain numbers ("1 (um)", "24 horas") are not item starts.
  const item = [...before.matchAll(/(?:^|\s)(\d{1,3}\.(?:\d{1,3}\.?)*\s)/g)].at(-1);
  const sentence = Math.max(before.lastIndexOf('. '), before.lastIndexOf('; '));
  let start = item && match.index - (item.index ?? 0) < 160 ? (item.index ?? 0) : sentence >= 0 ? sentence + 2 : match.index;
  while (start < text.length && text[start] === ' ') start += 1;
  return start > 0 ? { text: text.slice(start), trimmed: true } : { text, trimmed: false };
}
