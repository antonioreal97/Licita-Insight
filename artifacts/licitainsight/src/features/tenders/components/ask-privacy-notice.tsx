import React from 'react';

export const AI_PERSONAL_DATA_NOTICE = 'Não inclua dados pessoais (nomes, CPF, contatos) — a pergunta é enviada a um provedor de IA.';

export function AskPrivacyNotice() {
  return (
    <p className="mt-2 type-meta text-muted-foreground" data-testid="text-ask-privacy">
      {AI_PERSONAL_DATA_NOTICE}
    </p>
  );
}
