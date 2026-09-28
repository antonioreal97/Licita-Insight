# Participação — implementação e verificação

## Entrega

Backend implementado diretamente pelo coordenador Codex após as três falhas anteriores de inicialização pelo Orca.
O Cursor implementou tipos/adapters/hooks e as telas de participação, salvos e monitoramento; sua execução foi
interrompida por falhas de conexão antes do encerramento. O coordenador preservou os arquivos gravados, implementou
o painel P0.6, corrigiu os casos de erro/remoção e verificou a integração. O terminal do Cursor consta como
`user_owned` no Orca e não foi fechado.

- Migration `0019_participation`: etapas persistentes, checklist triestado com notas, protocolo declarado,
  próxima ação/prazo e histórico. Registros anteriores mantêm `savedAt`, usam etapa inicial e não ganham histórico fictício.
- GET individual e PUT parcial por usuário. Checklist atualizado por chave sob lock transacional; omissões preservam
  dados. Fonte das declarações controlada pelo servidor. Histórico só cresce ao mudar de etapa.
- Sessão HttpOnly, CSRF e gate de acesso preservados; exportação pessoal inclui as novas declarações.
- Detalhe: seis etapas, Tenho/Não tenho/Não sei sobre exigências encontradas, protocolo, próxima ação, prazo e histórico.
  Fonte oficial, leitura automática e declaração pessoal permanecem distintas. Marcar envio não envia proposta.
- Salvos: filtro de etapa na URL e no servidor, ordenação por prazo nas etapas de preparo, CSV com campos declarados
  e proteção contra fórmulas de planilha. Monitoramento mostra etapa pessoal.
- P0.6: próximos prazos das etapas Analisando/Preparando documentos antes das métricas nacionais. A seleção Para você
  avalia apenas os quatro candidatos com prazo próximo e informa essa limitação; sem perfil, oferece cadastro.
- Regras pós-prazo e próxima ação por etapa; erro de salvamento mantém o rascunho. Remoção exige confirmação e avisa
  que salvar novamente não restaura checklist, protocolo ou histórico apagados.

Contrato vigente: [participation-v1](../contracts/participation-v1.md). A proposta UX anterior foi supersedida quanto
ao número de etapas e ao checkbox binário; o contrato usa seis etapas e três estados.

## Verificação em 28/09/2026

| Verificação | Resultado |
|---|---|
| API: `PNCP_TEST_DATABASE_URL=… pnpm --filter @workspace/api-server run test` | 184 testes passaram, zero falhas/skip; bundle da ficha passou |
| Frontend: `pnpm --filter @workspace/licitainsight run test` | 16 testes passaram: próximo passo, seleção de prazos/aderência e CSV |
| Typecheck API, frontend e libs geradas | Passou |
| Frontend: `PORT=24253 BASE_PATH=/ pnpm --filter @workspace/licitainsight run build` | Passou; avisos de sourcemap do kit e bundle >500 kB permanecem |
| `MIGRATIONS_TEST_DATABASE_URL=… pnpm --filter @workspace/db run verify:migrations` | Paridade com schema, diff vazio e segunda execução idempotente |
| Navegador Chromium: desktop 1440×1000 e mobile 390×844 | Fluxo autenticado e páginas públicas carregaram; sem pageerror nem overflow horizontal nas quatro telas |

Integração de API cobre autenticação, CSRF, 402, isolamento entre usuários, seis etapas, protocolo, histórico,
idempotência, PATCH simultâneo de chaves diferentes, limpeza de campos, filtros, exportação e remoção.

No navegador foram executados: seleção das seis etapas, os três estados do checklist, edição de protocolo e prazo
pessoal (fuso de Brasília), recarga mantendo valores, histórico, filtro/estado vazio, download CSV, painel com prazo
salvo antes das métricas e navegação mobile por detalhe/salvos/painel/monitoramento. Falha de rede injetada somente
no PUT comprovou preservação do rascunho e recuperação ao tentar novamente. O 401 de sessão anônima e os erros
de rede desse teste negativo são esperados, não falhas de execução da interface.
Uma segunda execução verificou também ausência de erros de console nos fluxos positivos e a confirmação de remoção:
cancelar mantém protocolo/marcações; confirmar remove o registro. As skills de verificação de navegador e boas práticas
React orientaram a revisão de persistência, falhas e estado do formulário.

## Ambiente e limites

**Atualização posterior:** a stack local foi ativada com este workspace, após reconciliação auditada e
aplicação da 0019. Ver [relatório de ativação](participation-activation-2026-09-28.md), incluindo backup,
integridade e configuração preservada. O relato abaixo descreve a etapa anterior de implementação/QA.

Testes usaram schemas/bancos temporários. QA visual em portas 24253/3002, banco temporário com cópias de dois editais
reais e fichas já existentes, sem mock na busca e sem chamadas pagas de IA. A stack nas portas 24252/3001 pertence
a outro checkout e não foi alterada. Não houve deploy, push, commit nem migração do banco da aplicação existente.
Ao concluir, os dois processos de QA foram encerrados e somente o banco temporário criado para esta verificação foi
removido. Eram cópias de dados públicos e declarações de teste; scripts/capturas permanecem em
`/private/tmp/licitai-participation-SdHXx4/` para inspeção, sujeitos à limpeza normal do sistema.

Antes de executar esta versão em outro ambiente, aplicar as migrations versionadas com o `DATABASE_URL` correto
(`pnpm --filter @workspace/db run migrate`) e reiniciar a API/frontend dessa versão. Sem essa migração, as rotas de
salvos referenciam colunas ainda inexistentes. Não inclui envio em portal oficial, cofre/upload de documentos,
validade de documentos da empresa nem lembretes automáticos para o prazo pessoal.
