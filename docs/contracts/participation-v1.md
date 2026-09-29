# Participação por usuário e edital

Extensão compatível de `SavedTender`. Todos os dados abaixo são declarações do usuário (`participationSource: "user"`), nunca confirmação de envio, habilitação ou resultado pelo órgão.

`GET /api/v1/me/saved-tenders/{tenderId}` retorna `SavedTender` ou 404 se não salvo. `PUT` cria ou atualiza; campos omitidos são preservados. Ambos exigem sessão e acesso ativo; PUT também exige CSRF. O limite continua 500 editais por usuário.

Campos adicionais da resposta:

- `stage`: `analyzing | participating | submitted | awaiting_result | completed | dismissed`.
- `stageAt`: ISO date-time, data da última mudança de etapa.
- `participationSource`: sempre `user`.
- `protocol`: string ou null (até 200 caracteres).
- `nextAction`: string ou null (até 500 caracteres).
- `nextActionDeadline`: ISO date-time ou null.
- `checklist`: array de `{ key, state, note, updatedAt }`. `state`: `have | missing | unknown`; `note`: string ou null, até 1000 caracteres. Ausência de marcação significa `unknown`, nunca documento validado.
- `history`: array cronológico de `{ from, to, at, source: "user" }`; `from` pode ser null na criação.

PUT aceita `monitored?`, `stage?`, `protocol?`, `nextAction?`, `nextActionDeadline?` e `checklist?: [{ key, state, note? }]`. Checklist é patch por chave: entradas omitidas são preservadas; nota omitida preserva a anterior; null limpa. Não enviar history, stageAt ou participationSource: são controlados pelo servidor. Repetir a mesma etapa não cria histórico nem muda stageAt. Etapas podem ser corrigidas livremente pelo usuário, inclusive após o prazo oficial.

Chaves permitidas: `ato_societario`, `regularidade_fiscal`, `regularidade_trabalhista`, `qualificacao_tecnica`, `qualificacao_economica`, `site_visit`, `samples`, `bid_guarantee`. Uma marcação não cria uma exigência: a UI só oferece os itens encontrados na ficha atual. Mudanças posteriores da ficha não apagam declarações antigas.

Ao mudar para `participating`, `submitted` ou `awaiting_result`, o servidor liga monitoramento. Ao mudar para `dismissed`, desliga. Depois o usuário pode alterar monitoramento separadamente. Um PUT redundante de stage preserva o monitoramento atual. `completed` preserva o monitoramento. PUT sem stage cria `analyzing`.

GET lista aceita `stage?` (uma etapa), `sort?: saved_at | deadline` e `upcoming?: boolean` (somente prazos futuros). Ordenação por prazo coloca nulos por último e desempata pelo id. Filtros e paginação ocorrem no servidor.

E-mail: o resumo diário (07:00, Brasília) inclui a seção "Seus prazos" com os editais em `analyzing` ou `participating` cujo `nextActionDeadline` ou prazo oficial de proposta cai até o fim do 3º dia seguinte. O prazo pessoal aparece como "informado por você" e a etapa como "Sua etapa", nunca como status oficial. Regras completas em `account-v1.md` §5.

Os mesmos campos são incluídos na exportação de dados pessoais. Remover o edital salvo ou a conta apaga também as declarações e o histórico correspondente.

Rótulos: Analisando; Preparando documentos; Participação enviada; Aguardando resultado; Concluída; Não vou participar. "Analisando" distingue a etapa pessoal do status oficial "Em análise". Checklist: Tenho; Não tenho; Não sei. Protocolo: Protocolo informado por você. Todas as mudanças são atômicas e isoladas por usuário.
