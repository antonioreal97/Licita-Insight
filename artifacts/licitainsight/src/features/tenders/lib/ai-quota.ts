/** Daily AI quota copy: it counts processes (tenders with readable documents), not questions. */
export const processes = (count: number) => `${count} ${count === 1 ? 'processo' : 'processos'}`;

export const QUOTA_RESET = 'A cota renova à meia-noite (horário de Brasília).';

export const tendersExhaustedMessage = (limit: number | undefined) =>
  `Você já consultou ${limit ? `os ${processes(limit)}` : 'todos os processos'} de hoje. ${QUOTA_RESET}`;
