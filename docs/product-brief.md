Quero criar uma aplicação web profissional para **pesquisa, descoberta, filtragem e acompanhamento de licitações públicas**.

O objetivo desta primeira etapa NÃO é desenvolver o motor de scraping, indexação, banco de dados ou automações.

Nesta etapa, quero que você atue principalmente como:

* Product Designer
* UX/UI Designer
* Design System Architect
* Frontend Architect

Seu objetivo é criar **a arquitetura completa do frontend, o design system e a experiência da aplicação**, deixando tudo preparado para que posteriormente eu conecte o frontend ao motor de dados que será desenvolvido separadamente.

---

# 1. CONTEXTO TÉCNICO

A aplicação terá uma arquitetura desacoplada.

O frontend será criado aqui.

O backend e o motor de busca serão desenvolvidos posteriormente em ambiente local utilizando:

* Codex
* Claude
* n8n
* APIs próprias
* banco de dados
* mecanismos de scraping
* processos de normalização de dados
* indexação para pesquisa
* eventualmente busca semântica e ranking de relevância

O n8n será utilizado para automações como:

1. acessar diferentes fontes de licitações;
2. coletar novos processos;
3. normalizar os dados;
4. remover duplicidades;
5. enriquecer os registros;
6. armazenar os dados;
7. atualizar índices de pesquisa;
8. atualizar licitações já existentes;
9. identificar alterações de prazo, situação ou documentos.

Portanto:

**NÃO implemente scraping dentro do frontend.**

**NÃO crie uma arquitetura que dependa do Lovable para executar o scraping.**

**NÃO amarre o projeto a Supabase ou outro backend específico sem necessidade.**

Quero uma arquitetura frontend desacoplada que possa posteriormente consumir minha própria API.

Use dados mockados nesta etapa.

---

# 2. VISÃO DO PRODUTO

Quero construir uma plataforma que torne muito mais simples pesquisar oportunidades de licitação.

A experiência deve lembrar a combinação de:

* um mecanismo de busca;
* uma plataforma SaaS B2B;
* um sistema de intelligence/search;
* um dashboard de oportunidades.

A interface deve transmitir:

* confiabilidade;
* precisão;
* clareza;
* organização;
* inteligência;
* eficiência;
* aspecto institucional sem parecer um portal governamental antigo.

Não quero uma interface burocrática ou excessivamente carregada.

A proposta deve ser moderna, clean e data-driven.

---

# 3. PRINCÍPIO CENTRAL DE UX

A busca deve ser o elemento mais importante de toda a aplicação.

O usuário deve conseguir entrar na plataforma e imediatamente entender:

**"Aqui eu consigo encontrar licitações relevantes para minha empresa."**

A aplicação deve ser construída utilizando uma lógica de:

**Search → Filter → Evaluate → Save → Monitor**

A pesquisa deve permitir começar com algo simples, por exemplo:

"desenvolvimento de software"

"serviços de engenharia"

"equipamentos médicos"

"consultoria ambiental"

e posteriormente refinar os resultados.

---

# 4. ARQUITETURA DA APLICAÇÃO

Crie uma arquitetura escalável para as seguintes áreas.

## 4.1 Dashboard

Página inicial após login.

Deve apresentar uma visão resumida das oportunidades.

Exemplos:

* novas licitações encontradas;
* licitações relevantes;
* licitações salvas;
* processos próximos do prazo;
* pesquisas salvas;
* oportunidades adicionadas recentemente.

Também incluir uma área:

**Oportunidades recomendadas**

Nesta etapa utilizar dados mockados.

A arquitetura deve permitir futuramente que essas recomendações venham de um mecanismo de relevância ou matching.

---

# 5. PÁGINA PRINCIPAL DE PESQUISA

Esta é a tela mais importante da aplicação.

Criar um grande campo de busca.

Placeholder sugerido:

**Pesquise por produto, serviço, órgão, palavra-chave ou objeto da licitação**

Exemplo:

`desenvolvimento de software`

Abaixo, mostrar resultados de pesquisa.

A interface deve permitir alternar entre:

* lista;
* tabela.

---

# 6. FILTROS

Criar uma experiência avançada de filtros.

Filtros possíveis:

### Localização

* Estado
* Município
* Abrangência

### Órgão

* órgão contratante;
* unidade compradora.

### Datas

* data de publicação;
* data de abertura;
* prazo final.

### Valor

* valor mínimo;
* valor máximo.

### Modalidade

Exemplos:

* Pregão Eletrônico
* Concorrência
* Dispensa
* Inexigibilidade
* outras modalidades

A arquitetura precisa permitir adicionar novas modalidades posteriormente.

### Situação

Exemplos:

* aberta;
* recebendo propostas;
* encerrada;
* suspensa;
* cancelada.

### Fonte

Exemplo de arquitetura:

* PNCP;
* Compras.gov.br;
* portais estaduais;
* portais municipais;
* outras fontes.

Não é necessário integrar essas fontes agora.

Apenas prepare o modelo visual e estrutural.

### Categoria

Criar filtro por categoria de produto ou serviço.

### Faixa de relevância

Preparar a interface para futuramente permitir algo como:

* mais relevantes;
* mais recentes;
* maior valor;
* menor prazo.

---

# 7. RESULTADOS DE PESQUISA

Cada resultado deve apresentar de maneira muito clara:

* objeto da licitação;
* órgão;
* modalidade;
* localização;
* valor estimado;
* data de publicação;
* data de abertura;
* prazo;
* situação;
* fonte;
* nível de relevância da busca.

Use badges para informações importantes.

Exemplo:

`Pregão Eletrônico`

`DF`

`Aberta`

`R$ 850.000`

`Prazo em 6 dias`

Permitir ações rápidas:

* salvar;
* abrir detalhes;
* compartilhar;
* adicionar a acompanhamento.

Não sobrecarregue visualmente os cards.

O objeto da licitação deve ter maior hierarquia.

---

# 8. DETALHES DA LICITAÇÃO

Criar uma página individual para cada processo.

Estrutura sugerida:

## Cabeçalho

* objeto;
* número do processo;
* situação;
* órgão;
* modalidade;
* localização.

## Resumo executivo

Mostrar:

* valor estimado;
* data de publicação;
* abertura;
* prazo;
* fonte.

## Objeto da contratação

Descrição completa.

## Órgão contratante

Informações disponíveis sobre:

* órgão;
* unidade;
* município;
* UF.

## Itens

Criar estrutura preparada para apresentar múltiplos itens da licitação.

Exemplo:

| Item | Descrição | Quantidade | Valor estimado |

## Cronologia

Criar uma timeline que futuramente possa mostrar:

* publicação;
* atualização;
* abertura;
* alterações;
* suspensão;
* encerramento.

## Documentos

Criar uma seção para:

* edital;
* anexos;
* termos de referência;
* documentos complementares.

Não implemente armazenamento real agora.

## Fonte original

Botão:

**Ver publicação original**

---

# 9. PESQUISAS SALVAS

Criar página:

**Pesquisas salvas**

O usuário poderá futuramente salvar buscas como:

"Software + Distrito Federal"

"Consultoria ambiental + Goiás"

"Equipamentos médicos + Brasil"

Cada pesquisa salva poderá possuir futuramente:

* filtros;
* frequência de atualização;
* notificações;
* novos resultados encontrados.

Prepare a interface para isso.

---

# 10. LICITAÇÕES SALVAS

Criar página:

**Licitações salvas**

Permitir organização visual por:

* salvas recentemente;
* acompanhando;
* prioridade;
* prazo próximo.

Prepare a arquitetura para futuramente permitir tags personalizadas.

Exemplo:

`ALTA PRIORIDADE`

`ANALISAR`

`PARTICIPAR`

---

# 11. MONITORAMENTO

Criar uma área conceitual chamada:

**Monitoramento**

O objetivo futuro será mostrar alterações nas licitações acompanhadas.

Exemplos:

"Prazo alterado"

"Novo documento publicado"

"Licitação suspensa"

"Edital atualizado"

"Data de abertura alterada"

Nesta etapa use apenas conteúdo mockado.

---

# 12. DESIGN SYSTEM

Esta parte é extremamente importante.

Antes de construir todas as páginas, quero que você estabeleça um **Design System completo e reutilizável**.

Defina tokens para:

## Cores

* Primary
* Secondary
* Accent
* Background
* Surface
* Muted
* Border
* Text Primary
* Text Secondary
* Success
* Warning
* Error
* Info

A identidade visual deve transmitir:

**tecnologia + confiabilidade + inteligência + ambiente B2B.**

Evite aparência genérica de template SaaS.

---

# 13. TIPOGRAFIA

Criar uma hierarquia consistente para:

* Display
* H1
* H2
* H3
* H4
* Body
* Small
* Caption
* Label

Priorizar legibilidade, principalmente em telas com muitos dados.

---

# 14. SPACING SYSTEM

Adotar uma escala consistente de espaçamento.

Exemplo:

4px

8px

12px

16px

24px

32px

48px

64px

Todas as páginas devem respeitar esses tokens.

---

# 15. COMPONENTES

Criar componentes reutilizáveis.

Entre eles:

### Navigation

* Sidebar
* Topbar
* Breadcrumbs

### Search

* SearchInput
* SearchSuggestions
* RecentSearches
* SearchFilters
* ActiveFilterChip

### Licitações

* TenderCard
* TenderTable
* TenderStatusBadge
* TenderValue
* TenderDeadline
* TenderSource
* TenderMetadata

Use internamente um naming consistente. Por exemplo:

`Tender`

como entidade técnica para licitação.

### Filters

* FilterGroup
* DateFilter
* ValueRangeFilter
* LocationFilter
* OrganizationFilter
* CategoryFilter

### Data display

* Table
* Pagination
* EmptyState
* LoadingState
* Skeleton
* ErrorState

### Actions

* SaveButton
* ShareButton
* MonitorButton
* ExportButton

### Feedback

* Toast
* Alert
* Modal
* ConfirmationDialog

---

# 16. ESTADOS DA INTERFACE

Não desenvolva apenas o happy path.

Crie visualmente:

* loading;
* skeleton;
* nenhum resultado encontrado;
* erro de API;
* busca vazia;
* filtro sem resultados;
* conexão indisponível;
* página vazia;
* conteúdo ainda não indexado.

Por exemplo:

**Nenhuma licitação encontrada para esses filtros.**

Oferecer:

**Limpar filtros**

ou

**Alterar pesquisa**

---

# 17. RESPONSIVIDADE

A aplicação será utilizada principalmente em desktop, mas deve funcionar adequadamente em:

* desktop;
* notebook;
* tablet;
* smartphone.

No desktop quero priorizar produtividade e densidade de informação.

No mobile, filtros podem utilizar drawer ou bottom sheet.

---

# 18. ACESSIBILIDADE

Utilizar:

* contraste adequado;
* navegação por teclado;
* focus states claros;
* labels;
* aria attributes quando necessário;
* elementos semânticos;
* WCAG como referência.

Não dependa apenas de cores para comunicar situação.

---

# 19. DARK MODE

Prepare o Design System para suportar:

* Light Mode
* Dark Mode

Mesmo que Light Mode seja o padrão.

Os tokens não devem depender de valores hardcoded espalhados pelos componentes.

---

# 20. ARQUITETURA FRONTEND

Organize a aplicação de forma modular.

Sugestão conceitual:

```text
src/
  components/
    ui/
    search/
    tenders/
    filters/
    dashboard/

  pages/

  layouts/

  hooks/

  services/

  types/

  mocks/

  lib/

  config/

  styles/
```

Adapte à arquitetura recomendada pelo framework utilizado.

O objetivo é manter separação entre:

* apresentação;
* regras de UI;
* comunicação com API;
* tipos;
* estado;
* dados mockados.

---

# 21. CAMADA DE SERVIÇOS

Não faça componentes consumirem endpoints diretamente.

Crie uma abstração.

Exemplo conceitual:

```ts
tenderService.search()
tenderService.getById()
tenderService.getSaved()
tenderService.save()
tenderService.monitor()
```

Por enquanto esses serviços podem consumir mocks.

No futuro substituirei os mocks pela minha API.

---

# 22. MODELO DE DADOS

Crie uma interface inicial para a entidade Tender.

Algo semelhante a:

```ts
interface Tender {
  id: string
  title: string
  description: string
  organization: string
  purchasingUnit?: string
  tenderNumber?: string
  processNumber?: string

  modality?: string
  status: string

  estimatedValue?: number

  publicationDate?: string
  openingDate?: string
  deadline?: string

  state?: string
  city?: string

  source: string
  sourceUrl?: string

  relevanceScore?: number

  categories?: string[]

  items?: TenderItem[]

  documents?: TenderDocument[]

  createdAt?: string
  updatedAt?: string
}
```

Não considere este modelo definitivo.

Estruture de maneira que ele possa evoluir sem exigir reconstrução do frontend.

---

# 23. PREPARAÇÃO PARA BUSCA AVANÇADA

A arquitetura deve estar preparada para que futuramente meu backend possa retornar:

```json
{
  "results": [],
  "total": 4287,
  "page": 1,
  "pageSize": 20,
  "query": "desenvolvimento de software",
  "filters": {},
  "facets": {},
  "processingTime": 42
}
```

Também quero suporte futuro para facets.

Exemplo:

```text
Estado

DF (142)
SP (97)
GO (63)

Modalidade

Pregão Eletrônico (201)
Dispensa (54)
Concorrência (38)
```

Prepare o frontend para receber essa estrutura.

---

# 24. PREPARAÇÃO PARA BUSCA SEMÂNTICA

No futuro, além da pesquisa textual tradicional, poderei implementar busca semântica.

Por exemplo, o usuário poderá pesquisar:

"licitações relacionadas à criação de sistemas de gestão"

e receber processos que não necessariamente contenham exatamente essa frase.

O frontend NÃO precisa implementar embeddings ou IA.

Apenas não crie uma arquitetura que impeça esse tipo de recurso posteriormente.

---

# 25. URL STATE

Quero que pesquisas e filtros possam ser representados na URL.

Exemplo conceitual:

```text
/search?q=software&state=DF&status=open&page=2
```

Isso será importante para:

* compartilhar pesquisas;
* voltar para resultados;
* salvar buscas;
* histórico do navegador.

---

# 26. PERFORMANCE

A interface precisa estar preparada para lidar com:

* milhares de resultados;
* paginação;
* filtros;
* muitas categorias;
* grande quantidade de registros.

Evite soluções que carreguem todos os resultados no navegador.

A paginação será realizada futuramente pelo backend.

---

# 27. AUTENTICAÇÃO

Crie somente a arquitetura visual para:

* Login
* Criar conta
* Recuperar senha

Não implemente dependência forte em nenhum provedor de autenticação neste momento.

A autenticação real será conectada posteriormente.

---

# 28. CONFIGURAÇÕES

Criar uma página de configurações preparada para:

## Conta

* nome;
* email;
* empresa.

## Preferências

* tema;
* quantidade de resultados;
* preferências de pesquisa.

## Notificações

Preparar opções futuras como:

* email;
* alertas de novas licitações;
* alterações em licitações acompanhadas.

---

# 29. NAVEGAÇÃO PRINCIPAL

Sugestão:

**Dashboard**

**Pesquisar licitações**

**Pesquisas salvas**

**Licitações salvas**

**Monitoramento**

---

Configurações na parte inferior da sidebar.

---

# 30. LANDING / HOME

Também crie uma página pública inicial.

Hero com uma mensagem clara.

Exemplo de direção de copy:

**Encontre as licitações certas. Mais rápido.**

Texto complementar explicando que a plataforma centraliza oportunidades públicas e facilita pesquisa e acompanhamento.

CTA principal:

**Pesquisar licitações**

CTA secundário:

**Conhecer a plataforma**

Não faça afirmações quantitativas que não possam ser comprovadas.

---

# 31. ESTILO VISUAL

Quero evitar:

* aparência de portal governamental antigo;
* dashboards excessivamente coloridos;
* excesso de gradientes;
* glassmorphism exagerado;
* cards dentro de cards;
* sombras excessivas;
* interfaces genéricas de AI SaaS;
* elementos decorativos desnecessários.

Priorizar:

* whitespace;
* grids;
* boa tipografia;
* hierarquia;
* bordas sutis;
* alta legibilidade;
* densidade adequada de informação;
* excelentes tabelas;
* filtros claros;
* UX profissional.

Referência conceitual:

**enterprise search + modern data platform + procurement intelligence.**

---

# 32. DADOS MOCKADOS

Crie um conjunto de licitações fictícias realistas apenas para demonstrar a interface.

Não apresente os dados fictícios como licitações reais.

Misture:

* diferentes estados;
* órgãos;
* modalidades;
* valores;
* prazos;
* situações.

Use-os apenas como fixtures/mocks de desenvolvimento.

---

# 33. DOCUMENTAÇÃO DO DESIGN SYSTEM

Crie uma página interna:

`/design-system`

Ela deve servir como documentação visual.

Mostrar:

* cores;
* tipografia;
* spacing;
* buttons;
* inputs;
* badges;
* cards;
* tabelas;
* filtros;
* estados;
* dialogs;
* componentes específicos de licitações.

Essa página será minha referência para continuar o desenvolvimento posteriormente usando Codex e Claude.

---

# 34. REGRA FUNDAMENTAL DE ENGENHARIA

Quero conseguir substituir:

```text
mock data
```

por:

```text
API real
```

com o mínimo possível de mudanças nos componentes visuais.

Portanto, mantenha uma separação clara entre:

**UI → application logic → services → data source**

---

# 35. ENTREGA

Quero que você desenvolva uma primeira versão completa da arquitetura visual da plataforma.

Comece definindo:

1. arquitetura da informação;
2. design system;
3. tokens;
4. layouts;
5. navegação;
6. componentes principais;
7. modelo de dados;
8. camada de services/mock;
9. página de pesquisa;
10. resultados;
11. página de detalhes;
12. dashboard;
13. pesquisas salvas;
14. licitações salvas;
15. monitoramento;
16. configurações;
17. autenticação visual;
18. landing page;
19. documentação `/design-system`.

Não concentre tudo em um único arquivo ou componente.

Crie componentes reutilizáveis e uma arquitetura preparada para evolução.

O resultado desta etapa deve ser um **frontend funcional utilizando mocks, visualmente consistente e pronto para posteriormente ser conectado ao motor real de licitações que será desenvolvido fora do Lovable.**
