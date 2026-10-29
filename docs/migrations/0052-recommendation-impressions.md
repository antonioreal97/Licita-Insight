# 0052 — Impressões e partes do score das recomendações

Migração aditiva para a avaliação offline do ranking:

- `user_recommendations.features` (`jsonb`, padrão `{}`): as partes do score de cada recomendação materializada (categoria do perfil, termos, Interessa, região, valor, prazo, novidade, penalidade de dispensa…). A soma das partes é o score.
- Tabela nova `recommendation_impressions`: o que cada usuário viu (edital, escopo `all`/`profile`, posição na tela, rank, score, partes, versão do algoritmo, momento da geração e da exibição) e, só com o opt-in de personalização, o clique (`clicked_at`). Uma linha por edital, rodada de ranking e escopo (índice único), então reler a página não duplica.

Nenhuma linha existente muda. A API anterior ignora a coluna e não conhece a tabela, então a migração pode entrar antes do deploy sem efeito.

> **Numeração:** a `main` vai até 0051; a branch `feat/workspaces-phase-1` usa 0047/0048 e será renumerada na próxima sincronização, como registrado em 0049.

## Produção (aplicação manual pelo dono)

Produção **nunca** roda `migrate`. Com o PR mergeado na `main`, no Mac do dono:

```zsh
zsh ~/orca/workspaces/Licita-Insight/aplicar-migracao.sh 0052_recommendation_impressions
```

O script faz o backup e aplica o arquivo em transação única. A saída termina em `0052 ok`.

Ordem: aplicar **antes** do deploy da API nova. A API nova grava `features` ao refazer as recomendações; sem a coluna, o rebuild falha. O registro de impressões não derruba a página se falhar (só gera um aviso no log), mas também não grava nada sem a tabela.

Depois do deploy, a versão do algoritmo passa de 2 para 3 (mesmo ranking, linhas com as partes). Como a leitura refaz as recomendações de perfis montados por outra versão, cada usuário ganha as partes na primeira visita, sem rebuild manual.

## Reverter

```sql
begin;
drop table if exists recommendation_impressions;
alter table user_recommendations drop column if exists features;
commit;
```

Reverter também exige voltar a API, porque a nova grava `features`.
