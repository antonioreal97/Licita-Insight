# Baseline do funil atual — hub adaptativo

Status: especificação e consultas; nenhuma consulta executada em produção  
Plano de referência: [hub adaptativo](./hub-adaptativo-2026-10-12.md)

## Objetivo e janela

Medir o funil atual antes de Espaços, por coortes semanais de criação de conta e janelas de 7 e 30 dias. Publicar somente agregados com pelo menos 10 usuários; não exportar ids, termos, nomes ou e-mails. Registrar junto de cada leitura: período, timezone `America/Sao_Paulo`, versão do produto, população elegível e limitações.

Baseline técnico informado pelo dono em 12/10/2026, ainda sem série instrumentada: busca quente em aproximadamente **0,4–0,9 s** e fria em **3–10 s**. Não usar p95 <300 ms como critério inicial; separar quente/fria e analisar índices antes de definir metas.

## Eventos do funil

| Marco                        | Fonte primária atual                                              | Definição                                                  | Limitação                                                                        |
| ---------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------- |
| criação da conta             | banco, `users.created_at`                                         | primeira conta persistida                                  | não equivale a onboarding iniciado                                               |
| início do perfil             | GA4 `profile_setup_start`                                         | formulário do perfil atual carregado sem perfil salvo      | somente com consentimento; pode repetir em outra sessão/dispositivo              |
| fim do perfil                | banco `company_profiles.created_at`; GA4 `profile_setup_complete` | primeiro salvamento válido do perfil                       | banco é canônico para contas existentes; GA4 só consentidos                      |
| primeira busca               | GA4 `search`                                                      | envio de consulta textual não vazia                        | evento não contém o termo; filtros sem texto ainda não contam                    |
| primeira oportunidade aberta | pendente                                                          | primeiro detalhe aberto a partir de resultado/recomendação | `page_view` é sanitizado, mas não há evento de funil próprio; especificar depois |
| primeiro salvo               | banco `saved_tenders.saved_at`; GA4 `save_tender`                 | primeira gravação bem-sucedida                             | importação legada também cria salvo no banco; segmentar se necessário            |
| primeiro monitoramento       | banco `saved_tenders.monitored_at`; GA4 `monitor_tender`          | primeira ativação bem-sucedida                             | desligar não apaga a primeira data histórica se a implementação a preservar      |
| primeiro alerta              | banco `saved_searches.created_at` onde `alerts_enabled`           | primeira busca salva atualmente ativa com alerta           | se alerta foi ativado depois, `created_at` antecipa o marco; falta `enabled_at`  |
| início do checkout           | GA4 `begin_checkout`                                              | API devolveu URL e o navegador vai redirecionar            | somente consentidos; não prova pagamento                                         |
| assinatura                   | banco `subscriptions.updated_at` com status de acesso             | primeira evidência disponível de assinatura ativa          | tabela não guarda histórico/`activated_at`; `updated_at` é aproximação           |

O wrapper GA4 atual já aplica consentimento opcional e bloqueia hits após revogação. A Fase 0 adiciona somente `profile_setup_start` e `profile_setup_complete`; `sign_up`, `login`, `search`, `save_tender`, `monitor_tender` e `begin_checkout` já existiam. Não foi criada camada paralela de analytics.

## Regras de privacidade

Eventos GA4 não enviam termo de busca, filtros livres, título/id do edital, workspace, nome, e-mail, Google subject, user id, session id ou respostas do perfil. Parâmetros adicionais ficam proibidos nesta fase. `page_location`, `page_path`, `page_title` e referrer já são sanitizados pelo wrapper para não carregar query strings/tokens.

Sem consentimento, não carregar `gtag.js` nem enviar evento. Revogação desabilita hits e limpa cookies `_ga*`; o cookie estritamente necessário `licita_session` permanece. Nenhum identificador de GA4 é unido ao banco.

## Consultas agregadas do banco

As consultas abaixo são read-only e exemplos. Devem rodar em réplica/backup ou janela aprovada, com `statement_timeout`, nunca neste PR.

### Volumes semanais por marco

```sql
with population as (
  select
    u.id as user_id, u.created_at as account_at
  from users u
  where u.created_at >= :from_at and u.created_at < :to_at
), profile_first as (
  select user_id, min(created_at) as profile_at
  from company_profiles
  group by user_id
), saved_first as (
  select
    user_id,
    min(saved_at) as saved_at,
    min(monitored_at) filter (where monitored_at is not null) as monitored_at
  from saved_tenders
  group by user_id
), alert_first as (
  select user_id, min(created_at) as alert_at
  from saved_searches
  where alerts_enabled and deleted_at is null
  group by user_id
), subscription_first as (
  select user_id, min(updated_at) as subscription_at
  from subscriptions
  where status = 'active'
  group by user_id
), firsts as (
  select
    p.user_id,
    p.account_at,
    pf.profile_at,
    sf.saved_at,
    sf.monitored_at,
    af.alert_at,
    sub.subscription_at
  from population p
  left join profile_first pf using (user_id)
  left join saved_first sf using (user_id)
  left join alert_first af using (user_id)
  left join subscription_first sub using (user_id)
)
select
  date_trunc('week', account_at at time zone 'America/Sao_Paulo')::date as cohort_week,
  count(*) as accounts,
  count(profile_at) as profile_completed,
  count(saved_at) as first_saved,
  count(monitored_at) as first_monitored,
  count(alert_at) as first_alert,
  count(subscription_at) as subscription_proxy
from firsts
group by cohort_week
having count(*) >= 10
order by cohort_week;
```

### Conversão em até 7 e 30 dias

```sql
with population as (
  select
    u.id as user_id, u.created_at as account_at
  from users u
  where u.created_at >= :from_at and u.created_at < :to_at
), profile_first as (
  select user_id, min(created_at) as profile_at
  from company_profiles
  group by user_id
), saved_first as (
  select
    user_id,
    min(saved_at) as saved_at,
    min(monitored_at) filter (where monitored_at is not null) as monitored_at
  from saved_tenders
  group by user_id
), alert_first as (
  select user_id, min(created_at) as alert_at
  from saved_searches
  where alerts_enabled and deleted_at is null
  group by user_id
), firsts as (
  select
    p.user_id,
    p.account_at,
    pf.profile_at,
    sf.saved_at,
    sf.monitored_at,
    af.alert_at
  from population p
  left join profile_first pf using (user_id)
  left join saved_first sf using (user_id)
  left join alert_first af using (user_id)
), cohorts as (
  select *, date_trunc('week', account_at at time zone 'America/Sao_Paulo')::date as cohort_week
  from firsts
)
select
  cohort_week,
  count(*) as accounts,
  count(*) filter (where profile_at <= account_at + interval '7 days') as profile_7d,
  count(*) filter (where saved_at <= account_at + interval '7 days') as saved_7d,
  count(*) filter (where alert_at <= account_at + interval '30 days') as alert_30d,
  count(*) filter (where monitored_at <= account_at + interval '30 days') as monitored_30d
from cohorts
group by cohort_week
having count(*) >= 10
order by cohort_week;
```

### Tempo até o primeiro valor

```sql
with first_saved as (
  select u.id, u.created_at, min(st.saved_at) as first_at
  from users u
  join saved_tenders st on st.user_id = u.id
  where u.created_at >= :from_at and u.created_at < :to_at
  group by u.id, u.created_at
)
select
  count(*) as users_with_save,
  percentile_cont(0.5) within group (order by extract(epoch from (first_at - created_at)) / 3600) as hours_p50,
  percentile_cont(0.95) within group (order by extract(epoch from (first_at - created_at)) / 3600) as hours_p95
from first_saved;
```

### Alertas efetivamente entregues

```sql
select
  date_trunc('week', ed.sent_at at time zone 'America/Sao_Paulo')::date as week,
  count(distinct ed.id) as deliveries,
  count(distinct ed.user_id) as recipients,
  count(distinct edn.notification_id) as notifications
from email_deliveries ed
join email_delivery_notifications edn on edn.delivery_id = ed.id
where ed.status = 'sent'
  and ed.sent_at >= :from_at and ed.sent_at < :to_at
group by week
having count(distinct ed.user_id) >= 10
order by week;
```

## Medição no GA4

Criar uma exploração de funil somente para usuários consentidos:

1. `sign_up`;
2. `profile_setup_start`;
3. `profile_setup_complete`;
4. `search`;
5. `save_tender`;
6. `monitor_tender` ou primeiro alerta (o banco é a fonte melhor para alerta);
7. `begin_checkout`.

Relatar contagem de usuários, taxa entre passos e tempo, sem ativar Google Signals ou personalização publicitária. Não comparar diretamente a taxa GA4 com o total do banco: a população GA4 exclui quem recusou cookies.

## Pendências deliberadas

- Evento de primeira abertura de detalhe e evento de assinatura concluída exigem decisão e, no segundo caso, coordenação com webhook; não foram implementados.
- O banco não registra primeira busca universal, início real do onboarding, momento de ativação do alerta nem histórico de status da assinatura.
- A futura instrumentação de Espaços precisa de dimensão de jornada agregada, mas não deve enviar `workspace_id` ou id de usuário ao GA4.
- Antes de mexer nos gates de assinatura, validar checkout/webhooks Asaas ponta a ponta conforme a [revisão aprovada](./hub-adaptativo-revisao.md).
