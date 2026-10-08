# Design system Pardal

Fonte da identidade: pacote "Pardal" (README + `tokens.json`, primeira versão de 8 out 2026). Cópia dos tokens em
`artifacts/licitainsight/src/styles/tokens.json`; implementação em `artifacts/licitainsight/src/index.css`.
Referência viva (só em dev): rota `/design-system`. As notas antigas em [`design-system/`](../design-system/README.md)
continuam valendo para movimento, z-index e breakpoints; cores, fontes, raios e sombras seguem este documento.

## Camadas no CSS

1. **Tokens Pardal**, com os nomes do `tokens.json`: paleta (`--lima`, `--petroleo`…), semânticos (`--fundo`,
   `--texto`, `--destaque`…), espaços (`--espaco-1..4`), raios (`--raio-*`) e tipografia (`--fonte-*`, `--display`,
   `--titulo-1`…). `:root` é o tema **Creme** (padrão); `.dark` é o tema **Petróleo** (o mesmo seletor que o botão
   de lua já alterna).
2. **Papéis do app** (`--background`, `--primary`, `--card`, `--ring`, `--status-*`, `--sidebar*`…) apontam para os
   tokens Pardal. O shadcn e o código das features herdam sem reescrever componente.
3. `@theme inline` expõe tudo como classes Tailwind: `bg-primary`, `text-muted-foreground`, e também `bg-lima`,
   `text-texto`, `bg-superficie-inversa`.

## Paleta

| Token | Valor | Uso |
| --- | --- | --- |
| `--lima` | `#d9f58b` | Destaque: botão principal, uma etiqueta, um bloco de chamada |
| `--lima-marca` | `#bfe17c` | Só tinta do logo em fundo escuro |
| `--aqua` | `#9ed6d1` | Contadores e notificações novas (`--accent`), gráficos |
| `--salvia` | `#b8cda5` | Seleção (`--primary-subtle`), item ativo da navegação, status Aberto |
| `--oliva` | `#c0cc6f` | Aviso (`--warning-subtle`), status Em análise, hover do botão lima |
| `--petroleo` | `#164c49` | Todo texto no tema Creme; cartões no tema Petróleo |
| `--petroleo-profundo` | `#00464e` | Fundo do tema Petróleo; superfície inversa no Creme |
| `--creme` | `#efebe1` | Cartões e sidebar no tema Creme |
| `--creme-claro` | `#f6f3ed` | Fundo do tema Creme; texto no tema Petróleo |
| `--nevoa` | `#cbd0c8` | Divisórias (`--linha`) e status Encerrado |

## Semânticos

| Token | Creme | Petróleo |
| --- | --- | --- |
| `--fundo` | `creme-claro` | `petroleo-profundo` |
| `--fundo-alt` | `creme` | `petroleo` |
| `--texto` | `petroleo` | `creme-claro` |
| `--marca` | `petroleo` | `lima-marca` |
| `--destaque` | `lima` | `lima` |
| `--texto-sobre-destaque` | `petroleo` | `petroleo` |
| `--superficie-inversa` | `petroleo-profundo` | `creme-claro` |
| `--texto-inverso` | `creme-claro` | `petroleo` |
| `--linha` | `nevoa` | `salvia` |
| `--foco` | `petroleo` | `lima` |

## Como os papéis do app foram mapeados

- **Superfícies:** página em `--fundo`; cartões e sidebar em `--fundo-alt`; menus e diálogos em `--fundo`, separados
  por borda.
- **Texto:** uma tinta só (`--texto`). O texto secundário (`--muted-foreground`) é a mesma tinta misturada ao fundo
  (86% no Creme, 82% no Petróleo), sem matiz nova e com AA garantido pelo teste de contraste.
- **Preenchimentos discretos** (`--muted`, `--secondary`, hover) são a tinta `--texto` com transparência baixa.
  Transparência de cor da paleta é permitida; matiz nova não.
- **Botão principal** (`variant="primary"`, `--action`) = `--destaque` com `--texto-sobre-destaque`; hover em `--oliva`.
  No máximo um lima por tela: ações repetidas em listas (Vou participar, Tenho interesse) usam `variant="dark"`
  (`--superficie-inversa`).
- **Links e controles marcados** (`--primary`) usam a tinta de `--foco`: petróleo no Creme, lima no Petróleo.
- **Bordas:** `--border` = `--linha` (decorativa). Campos usam `--input` = `--texto`, como pede o token `linha`.

## Estados (derivados da paleta)

A paleta não tem vermelho nem âmbar. Nenhuma cor de fora foi criada; os estados se distinguem por cor da paleta
**e** sempre por texto e ícone:

| Estado | Fundo + texto | Observação |
| --- | --- | --- |
| Sucesso / Aberto | `salvia` + `petroleo` | |
| Aviso / Em análise / prazo próximo | `oliva` + `petroleo` | `--warning` (ícones, réguas) = `--texto` no Creme, `oliva` no Petróleo |
| Erro / Suspenso / prazo ≤ 48 h | `superficie-inversa` + `texto-inverso` | Bloco invertido; texto de erro solto (`text-destructive`) tem a cor do texto e depende do ícone e da mensagem |
| Encerrado | `nevoa` + `petroleo` | |
| Revogado | preenchimento discreto + texto secundário | Rótulo riscado |

Se o produto precisar de um erro que se distinga só pela cor, isso pede uma cor nova na paleta: decisão da marca,
não do código.

## Tipografia

- Pilhas: `--fonte-titulo: "Qurova", "Quicksand", system-ui, sans-serif` e
  `--fonte-texto: "Nexa", "Montserrat", system-ui, sans-serif`.
- Estilos do `tokens.json` como variáveis `font` (`--display`, `--titulo-1..3`, `--corpo-grande`, `--corpo`,
  `--legenda`, `--rotulo`) e utilitários `type-display`, `type-titulo-1..3`, `type-corpo-grande`, `type-corpo`,
  `type-legenda`, `type-rotulo`.
- Os papéis densos do app (`type-title`, `type-section`, `type-body`, `type-ui`, `type-meta`, `type-label`,
  `type-eyebrow`, `type-data`) continuam para a interface de trabalho; `type-title` e `type-section` usam a fonte de
  título. `h1`–`h4` usam a fonte de título por padrão.
- Títulos em caixa normal. Só `type-rotulo` é caixa alta.

### Como trocar as fontes

Quicksand e Montserrat (SIL OFL 1.1, licenças em `public/fonts/*-OFL.txt`) são servidas do próprio app, em woff2
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
   Montserrat só depois de conferir todos os pesos usados (400, 500, 600, 700).

## Formas

- Raios: `rounded-lg` = `--raio-sm` (8px, campos e itens de navegação), `rounded-xl` = `--raio-md` (14px, cartões),
  `rounded-2xl` = `--raio-lg` (24px, diálogos e seções), `rounded-pill` = `--raio-pill` (botões e chips).
- Sem sombras: os `shadow-*` do Tailwind resolvem para nada. Sobreposições se separam pela borda.
- Sem gradientes.
- Foco: anel sólido de 2px em `--foco`, afastado 2px, por uma regra global em `:focus-visible`. Componentes não
  desenham anéis próprios com `ring-*`.

## Logo e favicon

- Arquivos em `artifacts/licitainsight/public/brand/` (cópia fiel do pacote; cor fixa, sem `currentColor`).
- Componente `BrandLogo` (`src/components/brand-icon.tsx`) renderiza os dois arquivos e o tema escolhe: petróleo no
  Creme, lima no Petróleo. `symbol` usa só o pássaro (sidebar recolhida). Dimensione pela altura; a largura segue a arte.
- Área livre: o "P" ocupa ~27% da altura do logo; no cabeçalho de 76px o logo tem 48px, sobrando 14px acima e abaixo.
- `public/favicon.svg` embute `pardal-simbolo-petroleo.svg` sem alterar o desenho, sobre um quadrado `creme-claro`
  de cantos arredondados para continuar visível em abas escuras.
- O Google "G" do botão de login mantém as cores oficiais do Google, por exigência das diretrizes de marca deles.

## Acessibilidade

`src/styles/contrast.test.ts` lê o `index.css`, resolve `var()` e `color-mix()` nos dois temas e reprova qualquer
par usado abaixo de 4,5:1 (texto) ou 3:1 (anel de foco, borda de campo, ícones). O mesmo teste confere que a
paleta e os semânticos do CSS são iguais ao `tokens.json`. Roda com `pnpm --filter @workspace/licitainsight run test`.

Pares de referência (Creme / Petróleo): texto sobre fundo 8,76 / 9,55; texto sobre cartão 8,15 / 8,76; botão lima
8,03; texto secundário sobre preenchimento discreto 4,90 / 4,67; sálvia 5,69; oliva 5,59; névoa 6,19; bloco invertido
9,55 / 8,76; anel de foco sobre o fundo 8,76 / 8,75.

Proibido: texto `lima`, `aqua` ou `nevoa` sobre creme (contraste ≤ 1,5:1). Não há classes `text-lima`, `text-aqua`,
`text-nevoa`, `text-salvia` ou `text-oliva` no app.
