# Onda 2 — QA de integração (e-mail)

Data: 24 set 2026. Branch `antonioreal97/cycle4`. Backend: `c8e4837` (CLAUDE_HANDOFF-009). Frontend: seção Notificações em `/settings`, página `/descadastro`, textos da landing e da assinatura.

## Ambiente

O stack Docker em execução vinha do checkout `main` (sem o backend de e-mail). Para não derrubá-lo, a verificação rodou em paralelo:

- banco `licita_cycle4` no mesmo Postgres (`push-force`);
- API do cycle4 na `:3101` (`AUTH_DEV_LOGIN=true`, coletas desligadas, `EMAIL_JOBS_ENABLED=true`, sem `RESEND_API_KEY`);
- Vite na `:24352` com `API_PROXY_TARGET=http://localhost:3101`;
- Chromium headless (Playwright) em 1366×900 e 375×812.

## Contrato (HTTP)

| Caso | Resultado |
|---|---|
| `GET /me/notification-preferences` em conta nova | `digest: daily`, `immediateCritical: true`, `updatedAt: null` |
| `PUT` parcial `{ email: { digest: 'off' } }` | 200, preserva `immediateCritical` |
| `PUT {}` | 400 `INVALID_PARAMETER` |
| `PUT` sem `X-Requested-With` | 403 `FORBIDDEN` (CSRF) |
| `GET` sem sessão | 401 |
| Descadastro com token inválido / escopo inválido | 400 `INVALID_PARAMETER` |
| One-click RFC 8058 (query + form body, sem Origin/CSRF) | 200, idempotente |
| Links do template | `/tenders/:id`, `/search?…`, `/settings#notificacoes`, `/descadastro?token=…&scope=all` batem com as rotas da UI |

## UI

- `/settings#notificacoes` sem sessão redireciona para `/login?returnTo=/settings#notificacoes` (hash preservado).
- Switches persistem após reload; estado otimista com rollback.
- `/descadastro`: confirmação explícita (não descadastra no load), sucesso por escopo, token inválido e ausente mostram o erro certo; depois do descadastro, `/settings` reflete o novo estado.
- Sem erros de console além dos 401/400 esperados.

### Corrigido nesta rodada

1. **Rolagem horizontal de 426 px no mobile em `/settings`.** O `<nav>` novo virou item do grid sem `min-w-0`, e a linha de chips alargou a página. Corrigido com `min-w-0`.
2. **Âncora `#notificacoes` parava ~280 px abaixo.** O scroll rodava no mount, e a seção de assinatura crescia depois de carregar. O efeito agora roda de novo quando assinatura e preferências terminam de carregar.
3. Landing: item do plano passou de "alertas no app" para "alertas no app e por e-mail".

## Pendências para o backend (CODEX_HANDOFF-010)

- `pnpm --filter @workspace/db run migrate` falha em banco vazio (`relation "public.tenders" does not exist`): `tenders` só nasce via `push`. O Compose usa `push-force` e não é afetado. O passo "Somente API no host" do CLAUDE_HANDOFF-009 é.
- Texto do e-mail: plurais com parênteses ("atualização(ões)", "novo(s) resultado(s)"); prazo alterado mostra "Prazo" e "Novo prazo" com o mesmo valor, sem o anterior; rodapé diz "porque ativou o resumo diário", mas o padrão já vem ligado.
- O token de descadastro é assinado com `SESSION_SECRET`: rotacionar o segredo invalida os links de todos os e-mails já enviados.

## Não verificado

- Envio real pelo Resend (sem chave no ambiente; entregas ficam `skipped`, como previsto).
- Digest das 07:00 e janela de 10 min no relógio real (cobertos pelos testes do api-server: 93/93 com Postgres, segundo o handoff).
