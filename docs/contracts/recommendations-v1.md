# Contrato — recomendações personalizadas v1

Status: implementado. A funcionalidade aparece somente no app do Pardal Digital; não cria e-mail nem notificação.

## Acesso e privacidade

`GET /api/v1/recommendations` e `POST /api/v1/recommendations/{tenderId}/dismiss` exigem sessão e acesso ativo, como salvar/monitorar (`402 SUBSCRIPTION_REQUIRED`). Preferência, exclusão de histórico e exportação LGPD exigem somente sessão, para que continuem acessíveis sem assinatura.

A preferência `recommendationPersonalizationEnabled` nasce `false`. Sem opt-in, a API descarta buscas e visualizações antes de inserir qualquer linha. Ao desligar, o frontend envia `deleteHistory: true` (default da API) e informa que o histórico será apagado. Também existe `DELETE /api/v1/me/recommendation-history`. Eventos são retidos por no máximo 180 dias e a limpeza roda diariamente.

Impressões (o que cada usuário viu, com as partes do score) são registradas para todos os usuários com acesso, retidas por 180 dias, incluídas na exportação e apagadas com o histórico e com a conta. O clique numa recomendação é comportamento de navegação: só marca a impressão com o opt-in (sem ele, entra apenas no contador global). Ver [Avaliação offline](#avaliação-offline).

Sinais que não dependem do opt-in: perfil da empresa, editais salvos e monitorados, buscas salvas e as respostas da triagem — **Interessa** (expressões do edital, uma vez por edital) e Não interessa. São sinais explícitos, como salvar um edital. O opt-in acrescenta somente termos normalizados de busca e ids de editais abertos. A exportação `pardal-digital-dados-YYYY-MM-DD.json` inclui preferência, eventos ainda retidos, feedback, perfil calculado e recomendações materializadas. Excluir a conta remove tudo por `ON DELETE CASCADE`.

As finalidades e os tipos de proponente do perfil da conta são dados **declarados** pelo usuário. Eles pesam materiais sem depender do opt-in de personalização comportamental. Sem resposta de finalidade, o fluxo, formato e ordenação de recomendações permanecem como antes.

## Endpoints

| Método | Rota                                         | Contrato                                                                                                                                                                         |
| ------ | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/recommendations?page=1&pageSize=10` | página de `Recommendation`, máximo 50; sessão + acesso                                                                                                                           |
| POST   | `/api/v1/recommendations/{tenderId}/dismiss` | 204; nunca recomenda o edital novamente e atualiza o perfil em segundo plano                                                                                                     |
| GET    | `/api/v1/me/recommendation-preferences`      | `{ personalizationEnabled, showInternationalOpportunities, updatedAt }`                                                                                                          |
| PUT    | `/api/v1/me/recommendation-preferences`      | `{ personalizationEnabled, deleteHistory?, showInternationalOpportunities? }`; `deleteHistory` default true ao desligar; `showInternationalOpportunities` omitido fica como está |
| DELETE | `/api/v1/me/recommendation-history`          | 204; apaga eventos de busca/visualização                                                                                                                                         |
| POST   | `/api/v1/recommendations/events`             | `{type:'search',query}`, `{type:'tender_view',tenderId}` ou `{type:'click',tenderId?}`; 202 `{recorded}`                                                                         |

```ts
type Recommendation = {
  tender: TenderSummary;
  score: number;
  reasons: Array<{
    kind:
      | "profile"
      | "interest"
      | "monitored"
      | "saved"
      | "saved_search"
      | "search"
      | "location"
      | "organization"
      | "value"
      | "platform";
    text: string;
  }>;
  generatedAt: string;
};
```

Impressões são somadas na leitura da página; cliques e dismiss são somados em seus endpoints. `recommendation_metrics_daily` guarda apenas contadores diários globais, sem user id, tender id ou conteúdo de busca. Por usuário, a leitura da página também grava `recommendation_impressions` (ver [Avaliação offline](#avaliação-offline)); a resposta da API não muda.

## Perfil e pesos

O perfil de interesse materializado mantém **todas** as ofertas e palavras-chave escolhidas, **todas** as categorias escolhidas e, separadamente, até 30 termos e 20 categorias do histórico, além de órgãos, modalidades, UFs e faixa de valor. Cada valor guarda `weight` e `sources[]`; o leitor ainda aceita o `label` único do formato antigo até que todas as linhas sejam reconstruídas. Somar peso de salvo, monitorado ou Interessa nunca remove a origem explícita do perfil. Pesos-base:

- perfil da empresa: palavra-chave escolhida `12`, categoria escolhida `12`, oferta livre `6`, descrição inferida `2`, UF de cobertura `5`; a descrição só reforça um candidato já qualificado por oferta, palavra-chave, categoria ou aprendizado de Interessa;
- **triagem Interessa** (evento `interest`, sem depender do opt-in de navegação): extrai por campo termos concretos do título, objeto e itens, sem atravessar campos e sem órgão/rótulo de categoria; prioriza unigramas e bigramas do vocabulário #142, peso base `14 ×` meia-vida de **60 dias**; motivo `interest` — “Parecido com editais que você marcou como interesse: …”;
- monitorado: `10`; salvo: `6`;
- busca salva: `3`;
- busca opt-in: `1,5 × decaimento`; detalhe opt-in: `2 × decaimento`.
- plataforma cadastrada (`registeredPlatforms` do perfil): `+6` e motivo `platform`, só como desempate — vale apenas para candidatos que já têm outro motivo; sozinha nunca recomenda um edital.

Buscas/visualizações usam meia-vida de 30 dias (`2^(-idade/30)`); Interessa usa 60 dias. Termos genéricos de contratação e stopwords portuguesas são eliminados (lista compartilhada com o vocabulário de perfil). Sinais escolhidos explicitamente no perfil ficam fora da disputa de peso e dos limites do histórico. **A partir de 2 Interessa que compartilham a mesma expressão**, essa expressão passa a **qualificar** candidatos novos (como o perfil), sempre dentro da cobertura (`strict` continua descartando fora da região). Um único Interessa só reforça quem já tem aderência. Pular não grava sinal. `DELETE /v1/me/recommendation-history` e `deleteHistory` ao desligar a personalização apagam eventos (incluindo Interessa) e dispensas da triagem.

## Candidatos e pontuação

São candidatos somente editais `open`, com `proposal_deadline > now`, não salvos/monitorados e não descartados. O PostgreSQL executa dois caminhos seletivos e indexados, um por `to_tsvector('portuguese', search_text)` + `websearch_to_tsquery` e outro pelas categorias escolhidas no JSONB, limita cada caminho e intercala a união em no máximo 500 candidatos por usuário. Assim, ter termos não desliga o caminho de categoria. Com cobertura `custom`, a seleção dos 500 **prioriza a região declarada** (UF, macrorregião, município, raio; e categorias remotas se “aceito remoto”): em `strict` só entram candidatos de dentro; em `prioritize`, os de fora só completam a cota depois dos da região. Edital sem UF/município não conta como dentro da região (só passa se for remoto compatível com aderência). Não há embedding, modelo local, GPU ou chamada de LLM nesse fluxo.

Pontuação documentada (máximos aproximados): categoria de perfil `25`, termos de perfil/`ts_rank` `30`, descrição como reforço `6`, reforço de Interessa `16`, reforço de histórico `10`+`12`, UF/cobertura `32`/`18` remoto / `-18` fora, órgão `8`, faixa de valor `8`, prazo `6`, novidade `6`. **Condição mínima:** casa com o perfil (oferta/palavra-chave como expressão inteira, ou categoria escolhida) **ou** com expressão aprendida por ≥2 Interessa parecidos. O casamento usa palavras ou expressões inteiras no texto normalizado e tolera plural simples (`drone`/`drones`); não casa pedaços como `arte` em `parte`/`cartões` nem `obra` em `manobra`. A mesma função vale para pontuação, exclusões, dispensas e oportunidades. Histórico passivo (salvos, monitorados, buscas, órgãos), descrição e um único Interessa só reforçam. Em cobertura `custom` + `strict`, fora da região → descartado; `prioritize` pontua os de fora com motivo “Fora da sua região”, mas a ordenação final é **região primeiro** (todo edital da região acima de qualquer um de fora) e a diversificação por órgão/categoria não deixa um de fora saltar à frente. “Aceito remoto” só libera fora da região quando já há aderência (perfil ou aprendizado) e o motivo deixa isso explícito. Os até três motivos visíveis priorizam perfil/interesse e localização. Termos genéricos do vocabulário #142 são ignorados. A faixa de valor só é inferida do histórico a partir de cinco editais salvos com valor válido; fora da faixa, `-5`. Dismiss contextual: região (UF/município) `10` (para dentar o bônus de localização de forma perceptível), valor ±25% `4`, prazo ≤3 dias `4`; “não faço isso” penaliza termos/categoria do edital. Penalidades de dispensa usam meia-vida de 30 dias, ignoram a categoria genérica `outros` e têm teto total de `12`. Exclusões do perfil eliminam o candidato. No topo, no máximo dois itens do mesmo órgão e três da mesma categoria primária antes dos adiados, **dentro de cada faixa de região**.

Após deploy de uma mudança dessas regras, as linhas materializadas antigas precisam ser refeitas com `pnpm --filter @workspace/api-server run rebuild:recommendations` (no container da API) ou aguardando o job. O job diário às 03:00 (`America/Sao_Paulo`) regenera todos os usuários; além disso, uma coleta PNCP concluída com sucesso dispara o mesmo job sob o lock singleton `daily_recommendations`, somente em processos cujo `APP_ROLE` executa jobs. Cada Interessa/Não interessa agenda rebuild com debounce (1,5 s) para a **próxima** seleção; a fila aberta da triagem permanece congelada no cliente.

O resultado final (top 50, score e até três motivos legíveis) fica em `user_recommendations`. A leitura faz apenas join por rank. Salvar, monitorar, alterar perfil/busca salva e dar feedback agendam rebuild assíncrono com debounce. O job diário roda às 03:00 (`America/Sao_Paulo`), fora da coleta PNCP das 06:00, e também limpa eventos vencidos.

Com finalidades declaradas, a resposta acrescenta `opportunities`: chamadas abertas de `cultural_opportunities`, com inscrição ainda vigente ou sem data final. Na versão **4**, uma finalidade compatível é requisito e bônus, mas nunca admite uma chamada sozinha. Também precisa haver pelo menos um sinal concreto:

- oferta ou palavra-chave escolhida presente como expressão inteira no título ou resumo (com plurais comuns), sem termos genéricos como “empresa”, “serviços”, “projetos” ou “apoio”;
- área (`areas`/`areaTerms`) correspondente a uma oferta, palavra-chave ou categoria escolhida — por exemplo, “Engenharia de software” para “software”, ou Audiovisual para produção de cinema;
- expressão com origem `interest_learned`, já consolidada por pelo menos dois Interessa. Histórico de navegação, salvos, descrição livre e um Interessa isolado não qualificam uma chamada.

A finalidade vem de `kind`, `source` ou de um tipo estruturado reconhecido em `opportunityType`. `culture` aceita o tipo cultura e fontes culturais; `funding` aceita o tipo fomento, CNPq/CAPES/Finep ou tipos explícitos de bolsa/fomento/financiamento; `research` aceita CNPq/CAPES/Finep, o tipo inovação ou tipos explícitos como “Edital de pesquisa” e “Bolsa de pesquisa”. Citar “pesquisa”, “universidade”, “apoio” ou “inovação” no texto livre não classifica uma chamada nessas finalidades. Assim, uma chamada CAPES sem relação com a atividade fica fora, e uma oficina cultural não vira recomendação de pesquisa por uma menção incidental.

As exclusões do perfil eliminam chamadas antes dos bônus. Os motivos citam a oferta, palavra-chave, área ou expressão aprendida que casou. O tipo de proponente só acrescenta bônus quando o campo `audience` informa público correspondente; não é inferido do título/resumo ou de `searchText`, e público ausente ou incerto nunca exclui. Aderência também não é criada apenas pelo público ou pelo nome do órgão em `searchText`.

Para a região, usa-se a UF explícita e, na sua ausência, a instalação estadual/municipal cadastrada ou o município exato de `city` no IBGE (com UF, ou nome único no Brasil). Instalação municipal também permite resolver o município para filtros de município/raio. Nome ambíguo e menção solta no texto não são suficientes para inventar localização. `strict` exclui localizações conhecidas fora da cobertura; `prioritize` conserva essas chamadas com o motivo **“Fora da sua região”**, sempre depois das chamadas dentro da região, mesmo com pontuação temática maior. Cobertura respeita UF, município, raio e macrorregião, mantendo a regra existente de remoto para categorias compatíveis. A ordem é: dentro da cobertura, sem localização determinada, fora da cobertura; dentro de cada grupo, pontuação e id desempatam. Chamadas federais sem UF/município continuam elegíveis por aderência; localização desconhecida não recebe bônus nem motivo de região atendida. `scope=national` sozinho não prova alcance em todo o país, pois também identifica chamadas locais brasileiras.

A pontuação de oportunidade parte de 30 após a aderência: termos escolhidos somam até 20 (10 por expressão), área soma 15, interesse aprendido soma 10, finalidade compatível soma 10 (uma vez), público informado soma 8 e região atendida soma 10. A ordem regional antecede essa pontuação e não é um campo novo da resposta pública. O selo `profileMatch` do hub continua separado desta seleção de recomendações.

Sem `procurement`, a primeira página limita licitações a três para que não dominem a seção. `study` é aceito e não gera conteúdo artificial, pois não há fonte homologada. A preferência internacional existente continua controlando se chamadas internacionais entram.

Sem sinal útil e sem perfil não há fallback genérico: retorna lista vazia e a UI convida a cadastrar o perfil de atividade.

### Triagem rápida

`/triagem` apresenta um edital por vez e reutiliza os mesmos sinais de salvar/interesse e dispensa. A rota própria permite acesso direto pelo resumo diário e mantém a Visão geral compacta. O cartão de entrada conta apenas os editais disponíveis, até dez; oportunidades culturais não entram nesta fila.

A fila da triagem e o cartão de entrada pedem `GET /api/v1/recommendations?scope=profile`. Esse escopo é mais estrito que a pontuação: só entram editais que casam com uma oferta, palavra-chave ou categoria escolhida do perfil e que estão **dentro** da região declarada (UF, município, raio ou macrorregião; "aceito remoto" vale para categorias compatíveis), qualquer que seja o modo de cobertura — em `prioritize` os de fora continuam pontuando na Visão geral, mas não aparecem na triagem. Descrição livre, histórico e expressões aprendidas por Interessa não bastam; exclusões eliminam. Sem perfil da empresa, a fila fica vazia e a página convida a cadastrar. O escopo `profile` não aplica o limite de 3 editais das finalidades declaradas e não devolve `opportunities`. `scope` desconhecido retorna 400.

A leitura não serve linhas desatualizadas: se não há linhas, se o perfil de interesse foi montado por uma versão anterior das regras (`algorithmVersion` no JSON de `recommendation_interest_profiles`) ou se o perfil da empresa mudou depois da última montagem, as recomendações são refeitas antes de responder. Assim, um deploy com regras novas dispensa o rebuild manual, e editar o perfil reflete na próxima leitura mesmo que o rebuild com debounce ainda não tenha rodado. No cliente, salvar ou apagar o perfil invalida o cache das recomendações (a fila da triagem é congelada por sessão com `staleTime: Infinity`).

A dispensa aceita corpo opcional `{ "reason": "not_offering" | "region" | "value" | "deadline" }`; valores desconhecidos retornam 400. Sem corpo, preserva a penalidade anterior. `recommendation_dismissals.terms` é um array JSONB de strings e pode incluir um marcador versionado `@triage:v1:` com motivo, UF, município IBGE e valor. O marcador não é termo de pesquisa. `not_offering` guarda expressões/categorias do edital (vocabulário #142); `region` penaliza a mesma UF/município; `value` a faixa ±25%; `deadline` prazos nos próximos 3 dias. Repetir a dispensa substitui os sinais do mesmo edital. Interessa grava `recommendation_events.type = interest` (migração `0049`) com as expressões extraídas.

Esses ajustes são leves, não filtros obrigatórios, e não mudam a cobertura/faixa declarada no perfil. Os termos confirmados no painel “Quer deixar isso fora do seu perfil?” vão às exclusões pelo PUT do perfil. A personalização de navegação (opt-in) continua separada dos sinais explícitos de Interessa/Não interessa.

A meta é de dez decisões/itens vistos, incluindo os pulados; pular não grava sinal no servidor. Ao esgotar uma seleção menor, o resumo informa isso sem simular dez itens. Progresso por usuário e dia de Brasília fica em memória durante a navegação; com consentimento de armazenamento opcional, também em `sessionStorage` para sobreviver a recargas da aba. Não sincroniza entre dispositivos/abas e não cria streak. Logout ou recusa de cookies remove a cópia opcional; nenhum token é armazenado. As exigências vêm somente das fichas prontas, sem iniciar análise. Custo adicional de IA por triagem/alerta: zero.

## Avaliação offline

Objetivo: medir o ranking com o que os usuários realmente viram e fizeram, antes de mexer em qualquer peso. Migração `0052`.

- **Partes do score:** `scoreRecommendation` soma cada parcela por um componente nomeado (`profileCategory`, `profileTerms`, `profileDescription`, `interest`, `historyTerms`, `historyCategory`, `location`, `organization`, `value`, `platform`, `deadline`, `novelty`, `dismissalPenalty`). A soma das partes é o score, na mesma ordem de antes (o score não muda). As partes ficam em `user_recommendations.features`; não aparecem na resposta da API.
- **Impressões:** cada leitura de `GET /recommendations` grava em `recommendation_impressions` os editais da página com escopo (`all`/`profile`), posição na tela, rank, score, partes, `algorithmVersion` e o momento da geração. Uma linha por edital, rodada e escopo: reler a página ou o polling não duplicam. Falha ao gravar não derruba a página.
- **Clique:** `{type:'click', tenderId}` marca `clicked_at` na impressão mais recente daquele edital, só com o opt-in.
- **Desfechos** vêm das tabelas que já existem, dentro de uma janela após a exibição (padrão 14 dias): clique (ganho 1), Interessa (2), salvar (2), monitorar (3), avançar no quadro para participando/enviado/aguardando/concluído (4); vale o mais forte. "Não interessa" ou "Descartado" no quadro sem ação positiva conta como negativo.
- **Métricas** por lista exibida (usuário × escopo × rodada): precision@k, hit@k, nDCG@k (só listas com algum positivo) e negativos no top k. A variante reordena as mesmas listas com outros pesos por parte (`{}` reproduz a produção), então mede ordenação, não editais que nunca apareceram, e herda o viés de posição. Comparar variante e produção no mesmo período.
- **Comando** (somente leitura): `pnpm --filter @workspace/api-server run evaluate:recommendations -- --days 30 --window 14 --k 10 [--weights pesos.json] [--include-open] [--json]`. Sem `--include-open`, ficam de fora as impressões cuja janela ainda não fechou.
- **Retenção e privacidade:** 180 dias (limpeza no job diário das 03:00), exportação LGPD (`recommendationImpressions`), "Apagar histórico" e exclusão da conta.

Próximo passo, quando houver desfechos suficientes: calibrar os pesos por parte com esses dados e só trocar a versão do algoritmo se a variante ganhar da produção nesta avaliação.
