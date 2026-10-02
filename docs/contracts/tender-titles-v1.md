# Contrato — títulos e categorias de editais v1

Status: **aceito** em 02/10/2026. Este contrato é aditivo ao [Search API v1](./search-v1.md).

## Princípios

`title`, `object_summary` e `description` continuam preservando o conteúdo oficial recebido do
PNCP. O título padronizado existe para exibição e busca; ele nunca substitui nem altera o objeto
oficial. A normalização por regras é determinística, idempotente, limitada a 100 caracteres e não
inventa palavras: cada palavra da saída precisa existir na entrada, ignorando caixa e acentos,
exceto pelas palavras-ponte `Aquisição`, `Contratação`, `serviço`, `de`, `para`, `preços` e
`Registro` usadas para encurtar fórmulas administrativas equivalentes.

## Versão e fontes

`DISPLAY_TITLE_RULES_VERSION = 1`. Uma mudança que possa alterar a saída incrementa essa versão e
é aplicada pelo backfill. Os campos persistidos em `tenders` são:

| Campo | Regra |
|---|---|
| `display_title` | título para exibição; pode ser nulo antes do backfill |
| `display_title_source` | `rules`, `model` ou nulo |
| `display_title_version` | versão da fonte que produziu o título |
| `display_title_norm` | forma normalizada para busca |
| `display_title_needs_model` | prioridade para revisão posterior pelo modelo local |
| `category_source` | `rules`, `student`, `teacher` ou nulo |
| `category_confidence` | confiança da classificação, quando disponível |
| `categorized_at` | instante da classificação, quando disponível |

A coleta grava e atualiza títulos `rules`. Se a linha já tiver `display_title_source = model`, a
coleta preserva título, versão, forma normalizada e flag. As categorias também são preservadas em
refreshes do PNCP. A classificação em si não faz parte desta versão: os campos e a taxonomia são a
base para os classificadores posteriores.

## Normalização por regras

O normalizador colapsa espaços e quebras de linha, uniformiza aspas e travessões, remove tags de
plataforma no início, aberturas administrativas genéricas e identificadores pessoais ou
operacionais (CPF/CNPJ, placas e números de processo/SEC). Fórmulas longas de registro de preços,
contratação de serviço e fornecimento são encurtadas sem mudar o objeto. Caudas de finalidade,
referência ao edital e fonte de recursos são cortadas nos marcadores definidos na implementação.

Textos com pelo menos 60% das letras em maiúsculas passam para caixa de frase. Siglas conhecidas,
como SUS, UBS, CRAS, CREAS, CAPS, GLP, EPI, TI, VoIP, PPAIS, MEI, GCM, SAMU, ETA, ETE, LED, PNCP,
ABNT, NBR, EJA e APAE, e tokens com dígitos são preservados. O corte de 100 caracteres ocorre em
fronteira de palavra; uma pontuação natural próxima encerra o texto sem reticências.

`display_title_needs_model` fica verdadeiro, com motivos internos, quando o resultado excede 80
caracteres, tem menos de três palavras, continua genérico, continha nome próprio de pessoa após
dois-pontos ou não apresenta um objeto claro após as regras. A flag apenas prioriza trabalho
posterior e não oculta o título produzido pelas regras.

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

`--dry-run` calcula sem gravar, `--limit N` limita a execução e `--cursor ID` retoma depois do ID
informado. O resumo final mostra processados, títulos que pedem modelo, linhas ignoradas por fonte
`model` e o último cursor. O backfill recompõe `display_title_norm` e `search_text`, incluindo as
categorias já armazenadas, e nunca sobrescreve um título de fonte `model`.
