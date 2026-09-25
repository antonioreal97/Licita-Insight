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

## Integração real (backend 98133b5, Jev jev-1.13.0, licita_cycle4)

- Revisão campo a campo dos pontos sensíveis contra o trecho completo: todas as respostas negativas têm trecho explícito (SESC: consórcio 9.1, subcontratação 17.1, "VISTORIA NÃO", amostras 11.1, garantias 21.1/23.1; Correios …086: "5. VISTORIA TÉCNICA 5.1 Não se aplica", Noul 0,64, correto; …087: subcontratação 4.4/4.4.1, ME/EPP 6.11).
- SESC (…042): ficha pronta em 3 s, 12/13 campos, categorias corretas na UI.
- Corrigido na UI: a prévia dos campos só de trecho mostrava o início cru dos ~700 caracteres (fim do item anterior). Agora começa no item numerado ou na frase que contém o termo do campo (`lib/sheet-excerpt.ts`); expandir mostra tudo.
- Correios (…087 e …086): índice `failed` porque o PNCP deu timeout nos PDFs (mesmo com 120 s); cada visita repete o download e o usuário espera minutos até ver "não conseguimos ler". Encaminhado no CODEX_HANDOFF-016.
