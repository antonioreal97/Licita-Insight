# Feature flags de jornadas v1

Status: contrato ativo da Fase 0; nenhuma jornada consumida pela UI
Plano de referência: [hub adaptativo](../plans/hub-adaptativo-2026-10-12.md)

## Configuração

`FEATURE_JOURNEYS` é uma lista separada por vírgulas com valores permitidos:

```text
procurement,funding,study,research,culture
```

Ausente, vazia ou composta só de espaços resulta em `enabledJourneys: []`. Esse é o padrão seguro e mantém o comportamento atual. Valores desconhecidos são erro de configuração, não são ignorados. Caixa e espaços são normalizados; duplicatas são removidas preservando a primeira ordem.

A flag habilita somente a disponibilidade futura da jornada. Não cria tabelas, espaço, rota de produto, navegação ou dados. Em particular, `study` continua oculto até cumprir também o gate aprovado de fonte oficial homologada com coleta e atualização verificadas.

## Endpoint

`GET /api/v1/public/feature-flags`

Sem autenticação. Resposta `200`:

```json
{
  "schemaVersion": 1,
  "enabledJourneys": []
}
```

Cabeçalho:

```text
Cache-Control: public, max-age=60, stale-while-revalidate=300
```

O endpoint não lê usuário, cookie, assinatura ou banco e não varia por coorte nesta versão. Se coortes forem necessárias, deve surgir outro contrato privado para não contaminar cache compartilhado.

## Frontend

`getJourneyFeatureFlags` e `useJourneyFeatureFlags` existem em `features/workspaces/hooks/use-journey-feature-flags.ts`. Nenhum componente os consome na Fase 0; `AppShell`, rotas e telas permanecem idênticos. Quando houver ativação aprovada, a ausência/falha do endpoint deve degradar para nenhuma jornada nova, não para todas habilitadas.

## Operação

Alterar `FEATURE_JOURNEYS` requer deploy/restart da API e aprovação da fase correspondente. Rollback é remover o valor e reiniciar. Desligar uma flag futura não apaga espaços ou dados; somente impede novas entradas e segue a política de leitura definida pelo contrato da fase.

## O que esta flag não faz

`FEATURE_JOURNEYS` controla a disponibilidade de jornadas e só muda com reinício. Ela **não** é o mecanismo do corte de dados para Espaços: por decisão de 13/10/2026, a virada da Fase 1 usa uma flag própria, lida em runtime, ligada e desligada sem reinício. Essa flag de corte ainda não existe e será especificada no contrato da Fase 1; ver “Forma da troca” no [roadmap](../plans/hub-adaptativo-roadmap-v2.md#forma-da-troca).
