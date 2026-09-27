export type FitLexicalGateMode = "off" | "shadow" | "on";

export const fitLexicalGateMode = (
  raw = process.env.AI_FIT_LEXICAL_GATE,
): FitLexicalGateMode => {
  const mode = raw?.trim() || "shadow";
  if (mode === "off" || mode === "shadow" || mode === "on") return mode;
  throw new Error(`AI_FIT_LEXICAL_GATE must be one of off, shadow or on; received "${mode}"`);
};
