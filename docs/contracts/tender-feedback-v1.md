# Contrato — feedback do usuário na página do edital v1

Status: **proposto** em 04/11/2026. Aditivo ao [Search API v1](./search-v1.md) e ao
[Account API v1](./account-v1.md). Migração `0053_tender_feedback` ([nota](../migrations/0053-tender-feedback.md)).

Na página de cada edital, o botão "Reportar problema" abre um diálogo para o usuário apontar informação errada
ou faltando, possível irregularidade no edital, documento ou link quebrado, ou outro problema. O feedback vai
para a equipe do Pardal Digital melhorar a plataforma; não é canal de denúncia. O texto do diálogo orienta que
denúncias formais de irregularidade devem ir ao órgão responsável ou ao Tribunal de Contas (TCU/TCE) e não
promete apuração.

## Endpoint

`POST /api/v1/tenders/{id}/feedback`

- **Sessão opcional.** Com cookie `licita_session` válido, o registro fica ligado à conta (`user_id`). Sem
  sessão, o registro é anônimo (`user_id = null`). Não exige assinatura nem perfil.
- **CSRF obrigatório**, inclusive para anônimos: `X-Requested-With: licita-insight` e `Origin` igual a
  `PUBLIC_APP_ORIGIN`; caso contrário `403 FORBIDDEN`.
- **Rate limit** (ver [scale-protection-v1](./scale-protection-v1.md)): com sessão, perfil `write`
  (60/min por usuário); sem sessão, perfil `public_write` (10/min por IP, compartilhado com as demais
  gravações anônimas). Excesso responde `429 RATE_LIMITED` com `Retry-After`.
- `{id}` com 1 a 200 caracteres; edital inexistente responde `404 NOT_FOUND`.

### Corpo

```ts
type TenderFeedbackRequest = {
  kind: "wrong_or_missing_info" | "possible_irregularity" | "broken_link" | "other";
  section?: "summary" | "deadlines" | "value" | "documents" | "sheet" | "items" | "timeline" | "other" | null;
  message: string;   // 10 a 2000 caracteres depois de trim
  pageUrl?: string | null; // até 2000 caracteres
};
```

| Campo | Regra |
|---|---|
| `kind` | obrigatório; rótulos na UI: Informação errada ou faltando, Possível irregularidade no edital, Documento ou link quebrado, Outro |
| `section` | opcional; rótulos: Resumo e objeto, Prazos e datas, Valor estimado, Documentos, Ficha do edital, Itens, Cronologia, Outra parte |
| `message` | obrigatório; espaços nas pontas são removidos antes de contar |
| `pageUrl` | opcional; guardado só se for caminho do app (`/tenders/...`) ou URL `http(s)`; qualquer outro valor (ex. `javascript:`) vira `null` sem erro |

Validação com o schema gerado do OpenAPI (`SubmitTenderFeedbackBody` em `@workspace/api-zod`). Erro responde
`400 INVALID_PARAMETER` com `details[].field` (`kind`, `section`, `message`, `pageUrl` ou `body`).

O servidor grava também o `User-Agent` truncado em 300 caracteres. IP não é gravado.

### Resposta `201`

```json
{ "id": "6f1c…", "status": "new", "createdAt": "2026-11-04T12:00:00.000Z" }
```

## Armazenamento

Tabela `tender_feedback`: `id` (uuid), `tender_id` (FK `tenders`, cascade), `user_id` (FK `users`, cascade;
`null` se anônimo), `kind`, `section`, `message`, `page_url`, `user_agent`, `status` (`new` | `triaged` |
`resolved` | `dismissed`; nasce `new`) e `created_at`. A triagem é manual, direto no banco, nesta versão; não há
rota de leitura nem painel.

## Notificação à equipe

Com `FEEDBACK_NOTIFY_EMAIL` definido (um endereço) e o provedor de e-mail configurado (`BREVO_API_KEY` ou
`RESEND_API_KEY`, mais `MAIL_FROM`), cada feedback dispara um e-mail curto para esse endereço com tipo, parte da
página, mensagem, id do registro e o link `PUBLIC_APP_ORIGIN/tenders/{id}`. O e-mail não leva e-mail nem nome
do usuário, só se o envio veio de sessão ou de visitante anônimo. O envio acontece depois da resposta e não
altera o `201`: sem variável, sem provedor ou com falha do provedor, o feedback fica só gravado (falha gera
aviso no log). Não há fila de reenvio.

## LGPD

- `GET /api/v1/me/export` inclui `tenderFeedback` com os feedbacks enviados com a sessão do titular.
- `DELETE /api/v1/me` apaga esses registros na mesma transação da exclusão da conta.
- Feedbacks anônimos não são ligados a ninguém e não entram na exportação nem na exclusão.

## Fora do escopo (v1)

- Painel de triagem, resposta ao usuário e mudança de `status` pela API.
- Expurgo automático por idade (a tabela cresce até a triagem manual apagar).
- Anexos e captura de tela.
