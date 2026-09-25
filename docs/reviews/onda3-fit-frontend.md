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

## Integração real (backend 5fcc392 + d18f840, Jev jev-1.13.0, 8.431 editais em licita_cycle5)

- Contrato real bate com a UI; nenhuma mudança de frontend foi necessária.
- 1ª rodada (antes do HANDOFF-014): serviços de limpeza/conservação saíam "Baixa aderência" pela Noul de exclusão; nenhum "Alta". Sondagem em CODEX_HANDOFF-014 (adendo).
- Depois do HANDOFF-014, perfil limpeza/facilities, busca "limpeza": os 4 serviços de limpeza/conservação e o de copeiragem em "Alta", compras de material em "Baixa" com o motivo de exclusão certo, 20 selos em ~4 s por página, sem erros de console.
- Calibração do Codex (3 perfis × 30: prováveis positivos, vizinhos, aleatórios): 15/15 "Alta" corretos; vizinhos de TI e facilities 10/10 "Baixa"; em construção, "material de construção" (0,54) e "maquinário/material elétrico" (0,52) ficaram "Média". Os "Baixa" entre prováveis positivos são erro do seletor lexical ("servidores" = servidores públicos), não da nota. Custo ≈ US$ 0,0014 por perfil a cada 30 editais.
- Limiares mantidos em 0,75 (alta) e 0,50 (média), pendentes de aprovação do owner.
