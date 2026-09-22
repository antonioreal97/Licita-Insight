export const normalizeText = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();

export const queryTokens = (query: string | null): string[] =>
  query ? [...new Set(normalizeText(query).split(" ").filter(Boolean))] : [];
