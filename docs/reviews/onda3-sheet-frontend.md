# Onda 3, item 3.5 — frontend da ficha do edital (antes do backend)

Data: 25 set 2026. Branch `antonioreal97/cycle6`. Contrato: proposta do CODEX_HANDOFF-015.

## O que entrou

- Painel "Ficha do edital" no detalhe, acima de "Perguntar ao edital": 13 campos em 4 grupos (participação, garantias e penalidades, habilitação, execução).
- Campo categórico mostra a resposta ("Vedado", "Permitida com limites") com a página e o trecho sob demanda; campo só de trecho mostra o começo do texto com "ver tudo".
- Regra: sem trecho → "Não encontrado nos documentos"; trecho sem categoria clara → "Sem resposta clara; veja o trecho". Nunca um "não exige" inferido da ausência.
- Estados: visitante (entrar com Google), sem acesso (assinatura), lendo documentos (polling 2 s → 10 s), sem documentos, ilegível, falha com "tentar de novo", e aviso de documentos não lidos.
- Rótulos PT-BR ficam na UI; a API manda ids e chaves (ids desconhecidos são ignorados).

## Verificação (Playwright; só `/tenders/:id/sheet` simulada com os achados reais da sondagem do HANDOFF-015)

- Visitante: convite para entrar, sem chamar a rota.
- Processando → pronto em 3 chamadas; resumo "6 de 13 campos encontrados…" com o aviso de 2 documentos não lidos.
- Consórcio "Vedado" (p. 4, expande o 4.3), subcontratação "Permitida com limites", ME/EPP "Só os benefícios da LC 123", visita técnica "Não encontrado nos documentos", amostra "Sem resposta clara".
- 375 px sem rolagem horizontal; sem erros de console.
- Estado "sem acesso" não reproduzível aqui: o `.env` deste worktree tem `BILLING_DEV_ENTITLED`; segue o mesmo padrão já verificado em "Perguntar ao edital".

## Falta

- Integração com o backend real (CLAUDE_HANDOFF-015) e revisão da calibração campo a campo contra os PDFs.
