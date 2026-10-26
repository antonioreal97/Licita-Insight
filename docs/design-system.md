# Design system Pardal

Fonte da identidade: o design system **"Pardal Digital" do Claude Design**
(<https://claude.ai/artifact/9CehQ6kNdzrPxuZtF2p2dx>, sincronizado em 22 out 2026). Ele substitui a paleta do
primeiro pacote "Pardal" (8 out 2026); `salvia`, `oliva` e `nevoa` ficam só para estados de edital, que o sistema
novo não define. Cópia dos tokens em `artifacts/licitainsight/src/styles/tokens.json`; implementação em
`artifacts/licitainsight/src/index.css`. Referência viva (só em dev): rota `/design-system`. As notas antigas em
[`design-system/`](../design-system/README.md) continuam valendo para z-index e breakpoints; cores, fontes, raios,
sombras e movimento seguem este documento.

## Camadas no CSS

1. **Tokens Pardal**: paleta com os nomes do Claude Design (`--petroleo`, `--lima`, `--aqua`, `--gelo`,
   `--surface-mist`…), semânticos (`--fundo`, `--texto`, `--destaque`…), espaços (`--espaco-1..4`), raios
   (`--raio-*`), sombras (`--sombra-*`) e tipografia (`--fonte-*`, `--display`, `--titulo-1`…). `:root` é o tema
   **Gelo** (claro, padrão); `.dark` é o tema **Petróleo** (o mesmo seletor que o botão de lua já alterna).
2. **Papéis do app** (`--background`, `--primary`, `--card`, `--ring`, `--status-*`, `--sidebar*`…) apontam para os
   tokens Pardal. O shadcn e o código das features herdam sem reescrever componente.
3. `@theme inline` expõe tudo como classes Tailwind: `bg-primary`, `text-muted-foreground`, `bg-lima`, `bg-gelo`,
   `bg-surface-mist`, `shadow-soft`, `rounded-button`.

## Paleta

| Token | Valor | Uso |
| --- | --- | --- |
| `--petroleo` | `#00464e` | Tinta da marca: todo texto, ícones e preenchimentos principais; cartões no tema Petróleo |
| `--petroleo-hover` | `#07383e` | Hover dos botões petróleo |
| `--petroleo-deep` | `#032f35` | Fundo do tema Petróleo; véu (`--scrim`) |
| `--lima` | `#dff6a1` | "Selecionado / seu": item ativo, chips, contadores, seleção de texto; botão principal no Petróleo |
| `--aqua` | `#a6dccf` | Apoio: preenchimento secundário, blocos de ícone, halo de foco dos campos, status Contratação direta |
| `--gelo` | `#fefefe` | Página e cartões no tema Gelo; texto no tema Petróleo |
| `--surface-mist` | `#f3f7f3` | Seções calmas (`--surface`, `--fundo-alt`) |
| `--surface-sand` | `#f4f5f0` | Fundo de seção de mapa/localização |
| `--map-state`, `--map-state-empty` | `#dce8e3`, `#edf1ee` | Mapa: UF com e sem oportunidade |
| `--salvia`, `--oliva`, `--nevoa` | `#b8cda5`, `#c0cc6f`, `#cbd0c8` | Do pacote anterior, só para estados (Aberto, Em análise/aviso, Encerrado) |

Nomes antigos continuam valendo como apelidos: `--creme-claro` = `--gelo`, `--creme` = `--surface-mist`,
`--petroleo-profundo` = `--petroleo-deep`, `--lima-marca` = `--lima`.

## Semânticos

| Token | Gelo | Petróleo |
| --- | --- | --- |
| `--fundo` | `gelo` | `petroleo-deep` |
| `--fundo-alt` | `surface-mist` | `petroleo` |
| `--texto` | `petroleo` | `gelo` |
| `--marca` | `petroleo` | `lima` |
| `--destaque` | `lima` | `lima` |
| `--texto-sobre-destaque` | `petroleo` | `petroleo` |
| `--superficie-inversa` | `petroleo` | `gelo` |
| `--texto-inverso` | `gelo` | `petroleo` |
| `--linha` | `#d1e3de` | `gelo` 22% sobre `petroleo-deep` |
| `--foco` | `petroleo` | `lima` |

## Como os papéis do app foram mapeados

- **Superfícies:** página e cartões em `gelo`, separados pela linha; seções calmas e a barra de filtros em
  `surface-mist`. No Petróleo, página em `petroleo-deep` e cartões em `petroleo`.
- **Texto:** uma tinta só (`petroleo`). O secundário (`--muted-foreground`) é `oklch(0.43 0.04 205)` no Gelo e
  `gelo` a 78% no Petróleo; nunca cinza.
- **Botão principal** (`variant="primary"`, `--action`): `petroleo` com texto `gelo`, hover `petroleo-hover`; no
  Petróleo vira `lima` com texto `petroleo`. Um por área. Botões têm raio de 1rem (`rounded-button`) e peso bold.
- **Selecionado:** `lima` (`--accent`, `--primary-subtle`, item ativo da navegação, seleção de texto). Nunca texto
  lima sobre fundo claro.
- **Secundário** (`--secondary`): `aqua` com texto `petroleo` (etiquetas de fonte, chips de termos).
- **Links e controles marcados** (`--primary`) usam a tinta de `--foco`: petróleo no Gelo, lima no Petróleo.
- **Bordas:** `--border` = `--linha` (decorativa). Campos usam `--input` = petróleo a 62% (3,7:1), que vira petróleo
  cheio no foco. O Claude Design pede 24–32% em controles; subimos para manter 3:1 (WCAG 1.4.11).

## Estados

| Estado | Fundo + texto | Observação |
| --- | --- | --- |
| Sucesso / Aberto | `salvia` + `petroleo` | |
| Aviso / Em análise / prazo próximo | `oliva` + `petroleo` | `--warning` (ícones) = `--texto` no Gelo, `oliva` no Petróleo |
| Erro | `--destructive` (`oklch(0.5 0.17 27)` no Gelo, `#ff9d8f` no Petróleo) | Só para erros e ações destrutivas, sempre com texto e ícone |
| Suspenso / prazo ≤ 48 h | `superficie-inversa` + `texto-inverso` | Bloco invertido |
| Encerrado | `nevoa` + `petroleo` | |
| Revogado | preenchimento discreto + texto secundário | Rótulo riscado |
| Contratação direta | `aqua` + `petroleo` | Dispensa/inexigibilidade sem prazo de disputa |

## Escala do mapa de editais por UF

O coropleto da página inicial usa `--mapa-1` a `--mapa-5`: a tinta de `--foco` (petróleo no Gelo, lima no
Petróleo) misturada ao `--fundo` em 20%, 40%, 60%, 80% e 100%. Mais editais é sempre mais tinta, então a escala
escurece no Gelo e clareia no Petróleo. `--mapa-vazio` (`--map-state-empty`) marca a UF sem edital aberto.

- Por que não `creme` → `salvia` → `oliva` → `lima`: `salvia` e `oliva` têm praticamente a mesma luminância (0,57 e
  0,56), e `lima` a do `creme` (0,82 e 0,83). No tema Creme a faixa mais alta ficaria igual à mais baixa em tons de cinza e para quem não
  distingue verde de amarelo. A mistura de uma tinta só não cria matiz e mantém uma direção única.
- Divisas entre UFs em `--fundo`, litoral em `--texto`. A UF sob o cursor ou com foco ganha um anel duplo
  (`--fundo` por fora, `--foco` por dentro), que aparece sobre qualquer preenchimento.
- O mapa não tem rótulos: o texto ficaria abaixo de 4,5:1 nas faixas do meio. Os números estão no painel acima do
  mapa, no ranking e na tabela.
- `src/styles/contrast.test.ts` confere, nos dois temas, que cada degrau se afasta do fundo mais que o anterior.
- Na página inicial a seção vem logo depois de "Como funciona". Enquanto os dados chegam, um esqueleto com o mesmo
  layout (`opportunity-map-layout.ts`) ocupa o lugar do mapa, então nada abaixo dele se mexe; em erro, a seção some.

## Tipografia

- Pilhas: `--fonte-titulo: "Qurova", "Quicksand", ui-sans-serif, system-ui, sans-serif` e
  `--fonte-texto: "Nexa", "Figtree", ui-sans-serif, system-ui, sans-serif` (Figtree é o substituto de Nexa indicado
  pelo Claude Design).
- Títulos: Qurova 500 com entrelinha justa (0,95–1,2) e espaçamento negativo (−0,04em no display, −0,035em em
  `titulo-1/2`, −0,02em em `h1`–`h4`). Texto corrido com entrelinha 1,55. `type-rotulo` é 0,75rem bold, 0,16em, caixa alta.
- Estilos do `tokens.json` como variáveis `font` (`--display`, `--titulo-1..3`, `--corpo-grande`, `--corpo`,
  `--legenda`, `--rotulo`) e utilitários `type-display`, `type-titulo-1..3`, `type-corpo-grande`, `type-corpo`,
  `type-legenda`, `type-rotulo`.
- Os papéis densos do app (`type-title`, `type-section`, `type-body`, `type-ui`, `type-meta`, `type-label`,
  `type-eyebrow`, `type-data`) continuam para a interface de trabalho; `type-title` e `type-section` usam a fonte de
  título. `h1`–`h4` usam a fonte de título por padrão.
- Títulos em caixa normal. Só `type-rotulo` é caixa alta.
- Os arquivos de Qurova que vieram do Claude Design são a versão **DEMO** da Prioritype ("Qurova DEMO"); por isso
  ainda não estão no app. Quicksand segue no lugar até chegar a licença comercial.

### Como trocar as fontes

Quicksand e Figtree (SIL OFL 1.1, licenças em `public/fonts/*-OFL.txt`) são servidas do próprio app, em woff2
variável (subconjuntos latin e latin-ext, extraídos do Fontsource). Nada é carregado de CDN ou do Google Fonts.

Quando os arquivos licenciados chegarem:

1. Copie os woff2 para `artifacts/licitainsight/public/fonts/` (ex.: `qurova-medium.woff2`, `nexa-regular.woff2`).
2. Acrescente no topo de `src/index.css`, ao lado dos blocos existentes:

   ```css
   @font-face {
     font-family: 'Qurova';
     font-weight: 500;
     font-display: swap;
     src: url('/fonts/qurova-medium.woff2') format('woff2');
   }
   ```

3. As pilhas já começam por `"Qurova"` e `"Nexa"`, então nada mais muda. Remova os blocos e arquivos de Quicksand e
   Figtree só depois de conferir todos os pesos usados (400, 500, 600, 700).

## Formas, sombras e movimento

- Raios: `rounded-lg` = `--raio-sm` (0,75rem, campos e itens de navegação), `rounded-button` = `--raio-botao`
  (1rem, botões), `rounded-xl` = `--raio-md` (1,35rem, cartões), `rounded-2xl` = `--raio-lg` (1,75rem, diálogos e
  painéis), `rounded-pill` (chips e etiquetas).
- Sombras suaves em tom petróleo, só no que flutua: `shadow-float` em menus, selects, popovers e avisos;
  `shadow-offer` em diálogos e painéis laterais; `shadow-soft`/`shadow-field`/`shadow-lift` para cartão de destaque,
  campo de busca de capa e cartão sobre fundo petróleo. Listas densas seguem planas, separadas pela linha.
- Sem gradientes.
- Foco: anel sólido de 2px em `--foco`, afastado 3px (3px lima afastado 4px no Petróleo), por uma regra global em
  `:focus-visible`. Campos de texto trocam o anel por borda `--foco` mais halo de 3px (`--halo-campo`: aqua no
  Gelo, lima no Petróleo).
- Movimento: `--ease-standard` = `cubic-bezier(0.22, 1, 0.36, 1)`, transições de 180ms. O voo do pardal na
  landing foi calibrado na curva anterior e lê `--ease-voo`.

## Logo e favicon

- Arquivos em `artifacts/licitainsight/public/brand/` (desenho fiel do pacote; cor fixa, sem `currentColor`),
  recoloridos para `#00464e` e `#dff6a1`. Os vídeos de `public/motion/` ainda usam as tintas antigas.
- Componente `BrandLogo` (`src/components/brand-icon.tsx`) renderiza os dois arquivos e o tema escolhe: petróleo no
  Gelo, lima no Petróleo. `symbol` usa só o pássaro (sidebar recolhida). Dimensione pela altura; a largura segue a arte.
- Área livre: o "P" ocupa ~27% da altura do logo; no cabeçalho de 76px o logo tem 48px, sobrando 14px acima e abaixo.
- `public/favicon.svg` embute `pardal-simbolo-petroleo.svg` sem alterar o desenho, sobre um quadrado `gelo`
  de cantos arredondados para continuar visível em abas escuras.
- O Google "G" do botão de login mantém as cores oficiais do Google, por exigência das diretrizes de marca deles.

## Acessibilidade

`src/styles/contrast.test.ts` lê o `index.css`, resolve `var()` e `color-mix()` nos dois temas e reprova qualquer
par usado abaixo de 4,5:1 (texto) ou 3:1 (anel de foco, borda de campo, ícones). O mesmo teste confere que a
paleta e os semânticos do CSS são iguais ao `tokens.json`. Roda com `pnpm --filter @workspace/licitainsight run test`.

Pares de referência (Gelo / Petróleo): texto sobre fundo 10,48 / 14,24; texto sobre cartão 10,48 / 10,48; botão
principal 10,48 / 8,98; lima 8,98; aqua 6,93; texto secundário sobre preenchimento discreto 7,25 / 5,04; erro sobre
cartão 6,46 / 5,27; borda de campo 3,68 / 6,03; anel de foco sobre o fundo 10,48 / 12,20.

Proibido: texto `lima`, `aqua` ou `nevoa` sobre fundo claro (contraste ≤ 1,5:1). Não há classes `text-lima`, `text-aqua`,
`text-nevoa`, `text-salvia` ou `text-oliva` no app.
