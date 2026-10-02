# Contrato — títulos e categorias de editais v1

Status: **aceito** em 02/10/2026; professor e aluno locais acrescentados no mesmo dia (ciclo 15,
tarefa L). Este contrato é aditivo ao [Search API v1](./search-v1.md).

## Princípios

`title`, `object_summary` e `description` continuam preservando o conteúdo oficial recebido do
PNCP. O título padronizado existe para exibição e busca; ele nunca substitui nem altera o objeto
oficial. A normalização por regras é determinística, idempotente, limitada a 100 caracteres e não
inventa palavras: cada palavra da saída precisa existir na entrada, ignorando caixa e acentos,
exceto pelas palavras-ponte `Aquisição`, `Contratação`, `serviço`, `de`, `para`, `preços` e
`Registro` usadas para encurtar fórmulas administrativas equivalentes.

## Versão e fontes

`DISPLAY_TITLE_RULES_VERSION = 2`. Uma mudança que possa alterar a saída incrementa essa versão e
é aplicada pelo backfill. Os campos persistidos em `tenders` são:

| Campo | Regra |
|---|---|
| `display_title` | título para exibição; pode ser nulo antes do backfill |
| `display_title_source` | `rules`, `model` ou nulo |
| `display_title_version` | versão da fonte que produziu o título: regras ou prompt do professor |
| `display_title_norm` | forma normalizada para busca |
| `display_title_needs_model` | prioridade para revisão posterior pelo modelo local |
| `category_source` | `rules`, `student`, `teacher` ou nulo |
| `category_confidence` | confiança da classificação, quando disponível |
| `categorized_at` | instante da classificação, quando disponível |

A coleta grava e atualiza títulos `rules`. Se a linha já tiver `display_title_source = model`, a
coleta preserva título, versão, forma normalizada e flag. As categorias também são preservadas em
refreshes do PNCP. Quando o título oficial muda numa linha com `category_source = student`, a coleta
zera `categorized_at` para que o aluno a reclassifique; categorias `teacher` nunca são tocadas.

## Normalização por regras

O normalizador colapsa espaços e quebras de linha, uniformiza aspas e travessões, remove tags de
plataforma no início, aberturas administrativas genéricas e identificadores pessoais ou
operacionais (CPF/CNPJ, placas e números de processo/SEC). Fórmulas longas de registro de preços,
contratação de serviço e fornecimento são encurtadas sem mudar o objeto; "Contratação de empresa para
serviço(s) de" também vira "Contratação de serviço de", e um prefixo repetido logo em seguida
("Contratação de empresa para prestação de Contratação de empresa para prestação de…") fica uma vez
só. Caudas de finalidade (incluindo "destinado(a)(s) a atender"), referência ao edital e fonte de
recursos são cortadas nos marcadores definidos na implementação.

Depois de cada remoção ou corte, conectivos soltos no fim (`de`, `do`, `da`, `dos`, `das`, `para`,
`com`, `em`, `no`, `na`, `e`, `a`, `o`) saem; sem remoção, o fim do texto é preservado ("hepatite
A"). O título nunca termina em ponto final; reticências do corte de 100 caracteres permanecem.

Textos com pelo menos 60% das letras em maiúsculas passam para caixa de frase. Siglas conhecidas,
como SUS, UBS, CRAS, CREAS, CAPS, GLP, EPI, TI, VoIP, PPAIS, MEI, GCM, SAMU, ETA, ETE, LED, PNCP,
ABNT, NBR, EJA e APAE, e tokens com dígitos são preservados. O corte de 100 caracteres ocorre em
fronteira de palavra; uma pontuação natural próxima encerra o texto sem reticências.

`display_title_needs_model` fica verdadeiro, com motivos internos, quando o resultado excede 80
caracteres, tem menos de três palavras, continua genérico, continha nome próprio de pessoa após
dois-pontos, não apresenta um objeto claro após as regras ou quando uma remoção deixou fragmento
(token com ponto no meio, como `916.ORE`, ou parênteses vazios, que são retirados). A flag apenas
prioriza trabalho posterior e não oculta o título produzido pelas regras.

## Taxonomia fixa

Cada edital pode ter no máximo duas categorias, sem repetição. A ordem canônica é:

1. `medicamentos-insumos-saude` — Medicamentos e insumos de saúde
2. `equipamentos-medicos` — Equipamentos médicos e hospitalares
3. `servicos-saude` — Serviços de saúde
4. `obras-engenharia` — Obras e engenharia
5. `manutencao-predial` — Manutenção predial e instalações
6. `ti-telecom` — Tecnologia da informação e telecomunicações
7. `alimentacao` — Alimentação
8. `limpeza-higiene` — Limpeza, higiene e dedetização
9. `veiculos-pecas` — Veículos, peças e manutenção
10. `combustiveis-gas` — Combustíveis e gás
11. `mobiliario-eletro` — Mobiliário, eletrodomésticos e climatização
12. `material-escritorio` — Material de escritório e expediente
13. `grafica-brindes` — Gráfica, brindes e comunicação visual
14. `eventos-cultura` — Eventos, shows e cultura
15. `esporte-lazer` — Esporte e lazer
16. `educacao-capacitacao` — Educação, cursos e capacitação
17. `seguranca-incendio` — Segurança, vigilância e prevenção de incêndio
18. `transporte-locacao-veiculos` — Transporte e locação de veículos
19. `consultoria-tecnica` — Consultoria e serviços técnicos
20. `mao-de-obra` — Mão de obra e serviços terceirizados
21. `assistencia-social` — Assistência social
22. `publicidade-comunicacao` — Publicidade e comunicação
23. `uniformes-textil` — Uniformes, tecidos e confecção
24. `agro-animais-ambiente` — Agropecuária, animais e meio ambiente
25. `saneamento-agua` — Saneamento e água
26. `energia-iluminacao` — Energia e iluminação
27. `locacao-bens-imoveis` — Locação de bens e imóveis
28. `seguros-financeiros` — Seguros e serviços financeiros
29. `outros` — Outros

A fixture versionada `scripts/fixtures/title-eval-gold.json` é a fonte de verificação da ordem,
dos slugs e dos rótulos.

## Professor e aluno (Ollama local)

Sem API paga: título e categorias usam o Ollama já instalado no host. O **professor**
(`gemma4:12b`) escreve títulos fiéis e escolhe categorias, mas leva de 10 a 17 s por título; por
isso rotula uma amostra uma vez e reescreve sob demanda só os títulos que as pessoas veem. O
**aluno** (`bge-m3` + vizinhos mais próximos) classifica todos os editais em milissegundos.

### Flags e variáveis

| Variável | Padrão | Efeito |
|---|---|---|
| `TITLE_TEACHER_ENABLED` | `false` | enfileira e executa reescritas `title_rewrite` |
| `CATEGORY_STUDENT_ENABLED` | `false` | classifica após cada coleta e no agendador diário |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | no compose: `http://host.docker.internal:11434` |
| `OLLAMA_TEACHER_MODEL` | `gemma4:12b` | modelo do professor |
| `OLLAMA_EMBED_MODEL` | `bge-m3` | modelo de embedding do aluno |
| `OLLAMA_TEACHER_TIMEOUT_MS` | `300000` | timeout de cada chamada ao professor |
| `OLLAMA_EMBED_TIMEOUT_MS` | `60000` | timeout de cada lote de embedding |
| `OLLAMA_KEEP_ALIVE` | `10m` | tempo que o Ollama mantém o modelo carregado |
| `CATEGORY_STUDENT_K` | `7` | vizinhos considerados |
| `CATEGORY_STUDENT_MIN_CONFIDENCE` | `0.45` | confiança mínima para gravar categorias |
| `TITLE_REWRITE_DAILY_LIMIT` | `2000` | jobs `title_rewrite` criados por dia (America/Sao_Paulo) |

O cliente (`src/ai/ollama-client.ts`) usa `POST /api/generate` (JSON Schema em `format`,
`think: false`, `temperature` 0.1, sem streaming) e `POST /api/embed` em lote. Faz no máximo um
retry em erro de conexão ou HTTP 5xx; timeout e 4xx não são repetidos. Não registra o texto enviado
nem a resposta.

### Professor

O prompt validado (39 de 40 categorias principais no gabarito) pede um título de até 10 palavras em
caixa normal, começando pelo tipo de compra, sem pessoas, empresas, placas, processos, plataformas,
órgão, município, prazos ou justificativas, e 1 categoria principal mais 1 secundária opcional,
copiando o rótulo exato da taxonomia (na ordem canônica, separados por `; `). Os textos vão em lotes
de 10 e a resposta é `{"itens":[{"id":n,"titulo":"...","categorias":["..."]}]}`. A versão do prompt
é `TITLE_TEACHER_PROMPT_VERSION = 1` e vira `display_title_version` dos títulos `model`.

Validação de cada item:

- **Categorias:** rótulo exato mapeado para o slug, sem repetição, no máximo 2; inválidas são
  descartadas.
- **Título:** não vazio, até 12 palavras e 100 caracteres, sem ponto final.
- **Fidelidade:** toda palavra do título existe no texto de origem (sem acento e sem caixa), exceto
  as palavras-ponte `Aquisição`, `Contratação`, `serviço`, `serviços`, `Locação`, `Obra`,
  `Credenciamento`, `Registro`, `preços`, `para`, `de`, `do`, `da`, `dos`, `das`, `e`, `em`, `com`,
  `a`, `o` e a frase `Objeto não especificado`.

Item reprovado mantém o título das regras e aproveita as categorias, se forem válidas.

### Exemplos rotulados

`tender_title_examples` guarda a amostra do professor: `text_hash` (sha256 do título oficial
normalizado), `source_text`, `tender_id` (nulo permitido), `teacher_title` (nulo quando reprovado),
`categories` (slugs), `teacher_model`, `prompt_version`, `split` (`train` ou `holdout`, 80/20
determinístico pelo hash), `embedding` (`real[]`, nulo até embutir), `embedding_model` e
`created_at`. Sem pgvector: o kNN roda em Node.

### Aluno

O texto embutido é sempre o mesmo formato, nos exemplos e nos editais: título oficial com caixa e
espaços normalizados, sem o órgão. O aluno carrega em memória os exemplos `train` embutidos com o
modelo atual (vetores `Float32Array` normalizados) e classifica por cosseno com os `k` vizinhos
mais próximos. Cada vizinho vota com sua similaridade na categoria principal e com metade dela na
secundária; a confiança é o peso da vencedora sobre a soma das similaridades. A segunda categoria
entra só com pelo menos 60% do peso da primeira. Abaixo do limiar, `categories` fica vazio (sem
chip) e a confiança é gravada mesmo assim.

A classificação grava `categories`, `category_source = student`, `category_confidence`,
`categorized_at` e recompõe `search_text` com os rótulos. Ela pega editais sem `categorized_at` ou
com `category_source = student` e exemplos mais novos que `categorized_at`, e nunca sobrescreve
`teacher`.

### Scripts

Todos são retomáveis, mostram progresso e ETA no stderr e param com segurança no Ctrl-C (o segundo
Ctrl-C encerra na hora):

```sh
# Amostra estratificada (modalidade × faixa de tamanho × região da UF) dos editais open e
# under_review, deduplicada pelo texto normalizado, ordem por md5, concorrência 1. Pula o que já
# foi rotulado.
pnpm --filter @workspace/api-server run titles:teacher-sample -- --size 3000
# Embute os exemplos sem embedding (ou de outro modelo).
pnpm --filter @workspace/api-server run titles:embed-examples
# Mede o aluno no holdout e nos 40 do gabarito (os textos do gabarito ficam fora dos vizinhos);
# --teacher roda também o professor nos 40.
pnpm --filter @workspace/api-server run titles:eval -- --out /tmp/titles-eval.json [--teacher]
# Classifica os pendentes.
pnpm --filter @workspace/api-server run titles:classify -- --status open,under_review --batch 256
```

### Fluxo contínuo

Só com as flags ligadas:

- **Classificação:** depois de cada coleta do PNCP o aluno classifica os pendentes `open` e
  `under_review`; o agendador diário (uma hora depois de `PNCP_DAILY_HOUR`) pega o que ficou. Os
  dois usam o mesmo lock singleton. Falha só gera log e não derruba a coleta.
- **Reescrita sob demanda:** quando um edital com `display_title_source = rules` e
  `display_title_needs_model = true` aparece na primeira página de uma busca ou tem o detalhe aberto,
  a API enfileira um job `title_rewrite` depois de responder (dedupe por edital e versão do prompt,
  lane `batch`, concorrência 1, até `TITLE_REWRITE_DAILY_LIMIT` por dia). O request nunca espera.
- **Resultado:** o job grava `display_title_source = model`, a versão do prompt, a forma normalizada
  e `search_text`; com categorias válidas, grava `category_source = teacher`. O par entra em
  `tender_title_examples` com o split do hash, para o aluno melhorar com o tempo.
- **Busca:** a resposta usa o título gravado no momento.

### Sem Ollama

Com as flags desligadas, nada é enfileirado nem classificado: o título vem das regras e não há
categorias. Com as flags ligadas e o Ollama fora do ar, busca e detalhe continuam respondendo
normalmente (o enfileiramento só toca o banco), o job `title_rewrite` falha e volta à fila com
backoff até 3 tentativas, e a classificação registra o erro e deixa os editais pendentes para a
próxima rodada. Nenhuma dessas falhas gera 5xx.

## Busca e API

`GET /api/v1/tenders/search` e `GET /api/v1/tenders/{id}` devolvem `displayTitle`, com fallback
para `title` em linhas ainda não processadas, e `displayTitleSource`. A busca textual inclui o
título padronizado, o objeto oficial e os rótulos das categorias. O destaque de campo `title` pode
ser produzido a partir do título padronizado ou do título oficial; os fragmentos já existentes de
objeto e itens permanecem válidos.

## Backfill

O comando abaixo processa somente linhas sem fonte ou com fonte `rules` cuja versão seja anterior
à atual:

```sh
pnpm --filter @workspace/api-server run backfill:display-titles -- --batch 1000
```

A versão 2 das regras exige rodar o backfill de novo para atualizar os títulos `rules` da versão 1.

`--dry-run` calcula sem gravar, `--limit N` limita a execução e `--cursor ID` retoma depois do ID
informado. O resumo final mostra processados, títulos que pedem modelo, linhas ignoradas por fonte
`model` e o último cursor. O backfill recompõe `display_title_norm` e `search_text`, incluindo as
categorias já armazenadas, e nunca sobrescreve um título de fonte `model`.
