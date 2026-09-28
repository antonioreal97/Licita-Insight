# CLAUDE_HANDOFF-013 — perfil da empresa e aderência

Implementação concluída das fases A e B do [`CODEX_HANDOFF-013`](CODEX_HANDOFF-013-calibration.json).

## Entregue

- migration `0006_company_fit.sql` com perfil 1:1, cache versionado por edital, uso diário próprio, preferência `profile_alerts` e snapshots de alertas;
- `GET/PUT/DELETE /api/v1/me/company-profile`, com normalização, validação completa, incremento de versão e invalidação transacional;
- `GET /api/v1/me/fit`, até 100 IDs, com retorno vazio sem perfil e gate `402` somente quando há perfil;
- filtro síncrono por cobertura e valor, correspondência lexical por `tsvector`, score Jev 0–3 normalizado, Noul opcional de exclusão e evidência de porte somente sobre índice já pronto;
- fila em memória com cache persistente por usuário/perfil/edital/fingerprint/modelo/prompt, estado `pending` e cota própria `AI_DAILY_FIT_LIMIT=1000`;
- alertas diários `profile_new_matches`, no sino e no digest existente, uma vez por usuário/dia e somente para alta aderência;
- preferência `profileAlerts`, UI correspondente, cópia/ícone/destino de notificação;
- exportação e exclusão LGPD de perfil, fits e uso;
- OpenAPI atualizado e clientes/zod regenerados;
- contrato em [`docs/contracts/company-fit-v1.md`](../contracts/company-fit-v1.md) e runner reprodutível `calibrate:company-fit`.

## Configuração

Novas variáveis opcionais:

- `AI_DAILY_FIT_LIMIT` — padrão `1000`;
- `AI_FIT_EXCLUDED_THRESHOLD` — padrão `0.65`;
- `AI_FIT_SIZE_THRESHOLD` — padrão `0.65`.

As variáveis `JEV_API_KEY`, `JEV_MODEL` e `JEV_TIMEOUT_MS` continuam compartilhadas com “Perguntar ao edital”. A cota e as tabelas de uso são independentes.

## Migration required

**YES — `lib/db/migrations/0006_company_fit.sql`.**

## Verificação

- Typecheck de API, frontend e bibliotecas: aprovado.
- OpenAPI/codegen: aprovado.
- Testes unitários cobrem normalização, duplicidade sem caixa/acento, limites e níveis/forçadores.
- Teste de integração opt-in cobre autenticação/CSRF, CRUD, filtro sem Jev, versionamento/invalidação, perfil ausente e gate de assinatura.
- A calibração real não foi executada porque `DATABASE_URL` e `JEV_API_KEY` não estavam disponíveis na sessão. Nenhum edital foi fabricado; o estado e o comando estão em `CODEX_HANDOFF-013-calibration.json`.

## Decisões operacionais

- PUT do perfil reinicia `lastAlertAt` para impedir que um perfil novo gere alertas sobre todo o histórico.
- Quando a cota ou Jev impedem conclusão, o fit permanece público como `pending`; o checkpoint diário não avança enquanto houver pendências.
- O alerta guarda até cinco snapshots e até vinte IDs, mas `matchCount` conserva a contagem total de altos processados.
