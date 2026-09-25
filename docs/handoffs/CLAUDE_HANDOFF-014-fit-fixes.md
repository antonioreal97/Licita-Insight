# CLAUDE_HANDOFF

**ID:** CLAUDE_HANDOFF-014

**Feature:** aderência — correções do QA do `CODEX_HANDOFF-013`

**Status:** READY_FOR_CLAUDE

**Contrato:** compatível. A semântica de `size_restricted` foi esclarecida em `docs/contracts/company-fit-v1.md`: exclusividade ME/EPP força nível baixo; cota reservada é apenas informativa.

## Correções

### P0 — exclusões não rebaixam o próprio serviço

- Cada termo de `perfil_da_empresa.exclusoes` agora recebe uma Noul própria no mesmo request Jev.
- A pergunta julga o objeto principal da contratação e explicita que insumos, materiais ou partes de um serviço prestado pela empresa não são exclusão.
- O motivo `exclusion` lista somente termos cuja probabilidade alcançou `AI_FIT_EXCLUDED_THRESHOLD`; nunca replica todas as exclusões do perfil.
- Na calibração real, contratos de limpeza/conservação com fornecimento de materiais ficaram `high` e sem motivo de exclusão; compras de materiais de limpeza ficaram `low` com somente os termos confirmados.

### P1 — exclusividade e cota ME/EPP

- A Noul binária e a inferência por regex foram substituídas por uma `Choice` Jev: `exclusive`, `quota` ou `none`.
- Os critérios distinguem participação exclusiva, cota parcial e benefícios sem restrição, como preferência pós-lances, empate ficto e regularidade fiscal tardia.
- A busca documental usa alternativas ME/EPP em vez de exigir todos os termos simultaneamente.
- O scanner continua depois de encontrar uma cota, para que uma passagem exclusiva posterior tenha precedência. Os tokens de todas as passagens avaliadas entram no custo.
- `fitLevel` força `low` somente para `me_epp_exclusive`; `me_epp_quota` permanece como razão informativa.
- `AI_FIT_SIZE_THRESHOLD` foi removida por não se aplicar a uma resposta categórica.

### P1 — cache estável em revisitas

- O fingerprint considera somente título, objeto, descrição, itens, órgão, valor estimado e UF.
- `updatedAt` operacional deixou de invalidar o cache.
- O teste de integração altera apenas `tenders.updated_at` e confirma que o mesmo fit e `checkedAt` são preservados.

### P2 — rubrica concreta e calibração

- O score agora descreve explicitamente os níveis 0–3 usando `licitacao` e `perfil_da_empresa`.
- `promptVersion` subiu de 1 para 2, invalidando resultados produzidos pela rubrica anterior.
- O runner seleciona, por perfil, 10 prováveis positivos por ofertas, 10 vizinhos explícitos e 10 aleatórios, sem repetição dentro do perfil.
- A faixa de valor fica aberta durante a calibração, e o JSON inclui grupo, título e resumo do objeto para revisão humana.
- A calibração real executou 90 avaliações sobre a base de 8.431 editais com `jev-1.13.0`. Resultado agregado:
  - tecnologia: 2 `high`, 1 `medium`, 27 `low`;
  - construção: 10 `high`, 3 `medium`, 17 `low`;
  - facilities: 3 `high`, 0 `medium`, 27 `low`.
- Artefato completo: `docs/handoffs/CODEX_HANDOFF-013-calibration.json`.

### P3 — todos os erros de validação

- O parser do perfil acumula todos os campos inválidos antes de lançar `400 INVALID_PARAMETER`.
- `details` continua no formato público existente `{field, issue}`; a UI já aceita vários itens.

### Correção adicional encontrada na integração

- `aiRouter` agora é montado antes do gate genérico do `accountRouter`.
- Isso restaura o contrato de perfil fora do paywall e permite que `GET /me/fit` retorne `200` vazio para usuário sem perfil; quando há perfil e não há acesso, continua retornando `402`.

## Verificação

- Testes da API: 91 PASS, 0 FAIL, 2 integrações opt-in ignoradas.
- Integração de conta com PostgreSQL em schema isolado: 18 PASS, 0 FAIL.
- Typecheck da API: PASS.
- Build da API: PASS.
- `git diff --check`: PASS.
- Calibração Jev 3 × 30: concluída e persistida no JSON de handoff.

**Migration required:** NO

**Breaking changes:** NO

**READY_FOR_CLAUDE:** YES
