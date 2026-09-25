# Onda 3, fatia 2 — frontend da aderência (antes do backend)

Data: 25 set 2026. Branch `antonioreal97/cycle5`. Contrato: proposta do CODEX_HANDOFF-013 (backend ainda não existe).

## O que entrou

- `/settings#perfil-empresa`: formulário com os 6 campos (descrição, produtos/serviços, o que não atende, área com "Brasil inteiro", faixa de valor, porte), validação local espelhando os limites, erros do servidor mapeados por campo, apagar com confirmação. Sessão basta; sem acesso aparece nota de assinatura.
- Painel inicial: convite só para quem tem acesso e ainda não tem perfil.
- Busca e painel inicial: selo por linha (`Alta aderência`, `Aderência média`, `Baixa aderência`, `Fora do seu perfil`), um GET em lote por página; pendentes são reconsultados (2 s → 10 s, até ~2 min).
- Detalhe: "Aderência ao seu perfil" com todos os motivos; porte só com o trecho citado e link para a página do documento.
- `.field` passou a estilizar `textarea`.

## Verificação (Playwright, rotas `/me/company-profile` e `/me/fit` simuladas; resto da API real)

- Validação: 3 erros no envio vazio, foco no primeiro; mínimo > máximo; termo repetido (caixa/acento) recusado.
- PUT com o corpo exato do contrato; recarregar mantém os valores; botão salvar só com alteração.
- 20 resultados com selo depois do polling (pendente → pronto em 3 chamadas); convite some com perfil; apagar remove os selos.
- 375 px sem rolagem horizontal; sem erros de console.

## Falta

- Integração com o backend real (CLAUDE_HANDOFF-013) e revisão da calibração dos níveis com o owner.
- Visão em tabela da busca (desktop) ainda sem selo.
- Fase B (alerta diário do perfil): toggle nas preferências e item no sino.
