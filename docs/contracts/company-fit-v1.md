# Company profile and tender fit v1

Contrato implementado pelo `CODEX_HANDOFF-013`. Datas são ISO 8601; valores são em reais.

## Perfil

`GET /api/v1/me/company-profile` requer sessão e retorna `{ "profile": null }` quando não há perfil. `PUT` requer sessão e CSRF, substitui o perfil inteiro, incrementa `version` e invalida o cache anterior. `DELETE` requer sessão e CSRF e retorna `204`. Essas rotas ficam fora do gate de assinatura.

O corpo do `PUT` contém:

- `description`: 20–600 caracteres;
- `offerings`: 1–20 termos únicos, 2–80 caracteres;
- `exclusions`: 0–20 termos únicos, 2–80 caracteres;
- `coverage`: `{scope:"national"}` ou `{scope:"states",states:[UF...]}`;
- `valueRange`: `{min:number|null,max:number|null}`, com valores não negativos e `min <= max`;
- `size`: `me_epp`, `cooperative` ou `other`.

Duplicidade de termos ignora caixa e acentos. Erros de validação retornam `400 INVALID_PARAMETER` com todos os campos inválidos em `details`.

## Aderência

`GET /api/v1/me/fit?tenderIds=id1&tenderIds=id2` requer sessão, aceita 1–100 IDs e retorna:

```json
{
  "profileVersion": 3,
  "results": {
    "id1": {
      "status": "ready",
      "level": "high",
      "score": 0.87,
      "reasons": [{ "kind": "offering_match", "terms": ["servidores"] }],
      "model": "jev-1.13.0",
      "checkedAt": "2026-09-25T12:00:00.000Z"
    }
  }
}
```

Sem perfil, retorna `200` com `profileVersion:null` e `results:{}`. Com perfil e sem acesso, retorna `402 SUBSCRIPTION_REQUIRED`.

Estados:

- `filtered`: cobertura ou faixa de valor eliminaram o edital sem chamada de modelo;
- `pending`: avaliação está enfileirada, falhou temporariamente ou a cota diária foi alcançada;
- `ready`: avaliação concluída.

O score semântico Jev usa uma rubrica concreta de 0–3 e é normalizado para 0–1:

- `0`: o objeto e os itens não têm relação com o que a empresa fornece;
- `1`: relação indireta, tema vizinho ou somente item acessório;
- `2`: a empresa fornece parte relevante dos itens, mas não o objeto principal;
- `3`: a empresa fornece o objeto principal da licitação.

Nível alto é `>= 0.75`, médio é `>= 0.55`; abaixo disso é baixo (limiares aprovados pelo owner em 25 set 2026, após a calibração). O nível de fits em cache é derivado da nota gravada, então uma mudança de limiar vale sem reavaliar no Jev; um nível baixo forçado por exclusão ou exclusividade ME/EPP permanece baixo. Uma exclusão só é confirmada quando o próprio objeto principal é a compra ou prestação do item excluído; insumos de um serviço que a empresa presta não contam como exclusão. Cada termo excluído é avaliado separadamente e somente os termos confirmados aparecem no motivo.

Para empresa de porte `other`, participação exclusiva de ME/EPP força nível baixo. Cota reservada para ME/EPP é apenas informativa, pois a cota principal permanece aberta a outros portes; benefícios como preferência pós-lances, empate ficto e regularidade fiscal tardia não geram motivo de restrição. No máximo quatro razões verificáveis são retornadas. A verificação de porte só consulta um índice documental já pronto e nunca inicia indexação.

O cache inclui usuário, versão do perfil, edital, fingerprint do conteúdo do edital, modelo e versão do prompt. O fingerprint considera título, objeto, descrição, itens, órgão, valor e UF; atualizações operacionais como `updatedAt` não invalidam o resultado. A cota de aderência é independente da cota de perguntas e usa `AI_DAILY_FIT_LIMIT` (padrão `1000`).

## Alertas

`notification-preferences` inclui `profileAlerts:boolean`. A avaliação diária considera somente editais criados após o último checkpoint do perfil, somente resultados `high`, contas com acesso e no máximo uma notificação `profile_new_matches` por usuário/dia. A notificação contém a contagem e até cinco snapshots em `profileMatches`; ela aparece no sino e entra no resumo diário já existente, sem e-mail separado.

## Privacidade

O export LGPD inclui perfil, fits, uso da cota e snapshots das notificações. Excluir o perfil apaga seu cache. Excluir a conta apaga perfil, cache e uso por cascade e também por limpeza explícita. Para a Jev são enviados descrição, ofertas e exclusões do perfil, além do conteúdo público do edital; nome e e-mail do usuário não são enviados.
