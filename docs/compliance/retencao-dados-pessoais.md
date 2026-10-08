# Retenção de dados pessoais

Atualizado em 8 de outubro de 2026.

O worker da API agenda o job `personal_data_retention` diariamente às **03:00 em `America/Sao_Paulo`**, fora da coleta PNCP das 06:00. O job usa o lock consultivo compartilhado (`tryRunSingletonJob`), portanto apenas uma instância executa cada ciclo.

## Prazos e configuração

| Dado | Ação padrão | Variável |
|---|---|---|
| Sessões revogadas ou expiradas | exclusão após 30 dias | `SESSION_RETENTION_DAYS` |
| Notificações lidas | exclusão após 180 dias do `read_at` | `READ_NOTIFICATION_RETENTION_DAYS` |
| Conteúdo de e-mails | redação após 180 dias da criação | `EMAIL_CONTENT_RETENTION_DAYS` |

`PERSONAL_DATA_RETENTION_HOUR` muda a hora local (0–23). `PERSONAL_DATA_RETENTION_DAILY=false` desliga o agendamento.

Em `email_deliveries`, o job apaga HTML, texto, cabeçalhos, erro e o e-mail repetido do destinatário. Permanecem somente `user_id`, assunto, modo, status, tentativas, identificador do provedor e datas, necessários para comprovar o envio e investigar entregabilidade. Esses metadados são excluídos com a conta por FK em cascata. Não há retenção local independente de registros financeiros: o Asaas é responsável pelos documentos sujeitos às obrigações fiscais e financeiras aplicáveis.
