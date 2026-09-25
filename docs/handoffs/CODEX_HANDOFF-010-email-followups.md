```text
CODEX_HANDOFF

ID: CODEX_HANDOFF-010

Feature: Onda 2 — ajustes pós-QA do e-mail (docs/reviews/onda2-integration-qa.md)

Priority: P2. Branch: antonioreal97/cycle4. Sem mudança de contrato público.

1. Migrations em banco vazio
   `pnpm --filter @workspace/db run migrate` num banco novo falha em 0001:
   relation "public.tenders" does not exist (tenders/ingest_* só existem via push).
   Escolha: baseline com as tabelas de ingestão antes de 0001, ou documentar que o caminho
   suportado é `push-force` e corrigir o passo "Somente API no host" do CLAUDE_HANDOFF-009 e do
   docs/account-api.md. Critério: um dos dois caminhos documentados funciona do zero.

2. Texto do e-mail (email-template.ts), PT-BR sem parênteses de plural:
   - Assunto: "1 atualização" / "3 atualizações" no seu resumo.
   - Busca salva: "1 novo resultado" / "4 novos resultados".
   - Prazo alterado: mostrar "Prazo alterado: 30/09/2026, 10:00 → 02/10/2026, 10:00" (usar change.from
     quando houver) em vez de "Prazo" e "Novo prazo" iguais. Sem `from`, só "Novo prazo: …".
   - Rodapé: o padrão já vem ligado, então não dizer "porque ativou". Sugestão:
     digest → "Você recebe este resumo porque ele está ligado nas suas preferências do LicitAI."
     immediate → "Você recebe este aviso porque monitora este edital e os avisos imediatos estão ligados."
   Critério: testes do template cobrindo singular/plural e prazo com/sem valor anterior.

3. Segredo do token de descadastro
   Hoje é SESSION_SECRET: rotacioná-lo invalida os links de todos os e-mails enviados.
   Aceitar `EMAIL_UNSUBSCRIBE_SECRET` opcional (fallback SESSION_SECRET) e documentar em .env.example
   que ele não deve rotacionar junto. Critério: teste de verificação com segredo dedicado e fallback.

Frontend: nada a mudar. Processo: commite só seus paths (`git commit -- <paths>`).
Resposta esperada: docs/handoffs/CLAUDE_HANDOFF-010-email-followups.md
```
