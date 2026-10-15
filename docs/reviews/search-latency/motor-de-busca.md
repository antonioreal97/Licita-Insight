# Motor de busca dedicado (OpenSearch, Typesense, Meilisearch): parecer

Data: 15/10/2026. Números em [`depois.md`](depois.md).

## Conclusão

**Não adotar agora.** O critério combinado era adotar só se a busca com facetas continuasse acima de ~300 ms no servidor, ou se quiséssemos tolerância a erro de digitação e sinônimos. Com as mudanças desta revisão, no banco sintético:

- todas as buscas com `status=open` (padrão da interface: "Abertos") ficam entre 12 e 134 ms no p95, facetas incluídas, e o conjunto de abertos tem o tamanho do de produção (~26–27 mil);
- as buscas sobre todo o histórico, sem `status`, ficam em 45–207 ms no p95 a 300 mil editais, exceto a busca sem filtro nenhum (~560 ms). Com 1,5–2 milhões, essas devem crescer para a casa de 1–4 s. A interface só as faz quando a pessoa remove "Abertos", e quem não tem sessão recebe a resposta do cache HTTP público.

A reavaliação fica condicionada aos números de produção (comandos no fim de [`depois.md`](depois.md)): se a busca com `status=open` e facetas passar de ~300 ms lá, ou se o produto pedir busca no histórico como fluxo principal, vale olhar de novo.

## Por que não compensa hoje

- **Tolerância a erro e sinônimos não exige outro serviço.** O `pg_trgm` já instalado faz similaridade (`word_similarity`, operador `<%`) sobre o mesmo `search_text` normalizado, e sinônimos cabem numa tabela de expansão de termos na hora da consulta. Hoje a busca já ignora acentos e caixa pela normalização própria (`domain/normalize`).
- **A busca não é só a tela de busca.** Notificações e buscas salvas usam o mesmo filtro SQL (`searchWhereFor` em `notification-service.ts`); assinatura, monitoramento e recomendações leem `tenders` direto. Um motor externo criaria duas definições de "o que casa com a busca", que precisariam dar o mesmo resultado, ou a migração de todos esses caminhos.
- **Sincronização.** A coleta faz upsert diário de milhares de editais e atualiza status/prazo; o índice externo precisaria acompanhar (escrita dupla na coleta ou captura de mudanças), com reindexação completa quando o mapeamento mudar, e com o risco de a contagem da faceta divergir do banco.

## Custo estimado (ordem de grandeza, a confirmar se for adotado)

| | Memória | Operação |
|---|---|---|
| OpenSearch | JVM com 2–4 GB de heap no mínimo útil, mais cache de disco; um nó só, sem réplica | Mais pesado: tuning de JVM, snapshots, atualização de versão, mapeamentos |
| Typesense | Índice inteiro em RAM: ~2–3× o texto indexado. Só abertos: centenas de MB; histórico de 2 milhões com objeto e itens: vários GB | Binário único; facetas e tolerância a erro prontas; sem joins, então os filtros por perfil/assinatura voltam ao Postgres |
| Meilisearch | Mapeado em disco (LMDB), mas indexação de milhões de documentos pede alguns GB de RAM e é lenta para reindexar | Simples de operar; facetas e erro de digitação prontos; mesma limitação de joins |

Em todos os casos: mais um serviço no servidor que hoje roda API, Postgres e coleta, com monitoramento, backup do índice (ou reindexação a partir do banco) e um caminho de queda para o Postgres quando o motor estiver fora, para manter os erros visíveis e a busca no ar.

Custo de IA: nenhum, em qualquer opção.
