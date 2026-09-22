# Progress — Licita Insight

## O que já funciona (protótipo com mocks)

- Landing pública com hero, método e CTA.
- Telas visuais de login, cadastro e recuperação de senha (sem auth real; submit cai no dashboard ou mostra “confira seu e-mail”).
- Shell: sidebar (recolhível no desktop, drawer no mobile), topbar, tema claro/escuro, usuário demo.
- Dashboard com métricas, lista de prioridade e atividade recente — números e atividade são estáticos.
- Busca com texto, filtro de UF e status, chip da query, alternância lista/tabela, empty state com limpar filtros.
- Detalhe: resumo, objeto, itens, cronologia, documentos, órgão, salvar e monitorar (estado local), link da fonte.
- Buscas salvas, editais salvos (abas de prioridade visuais), monitoramento e configurações de perfil/notificações — conteúdo majoritariamente fixo.
- Página `/design-system` com cores, tipo, botões, badges e três estados.
- Seis licitações fictícias em `mock-data.ts`, com aviso de demonstração em alguns pontos.

## O que falta

- Camada de services. Componentes importam `tenders` direto.
- URL state completo (estado, status, ordenação, página). Hoje só `q`.
- Paginação real. O controle de página não corta a lista; o total exibido é hardcoded.
- Filtros do brief ainda ausentes: município, abrangência, órgão, datas, faixa de valor, modalidade, fonte, categoria, facets.
- Ações sem efeito persistente: salvar busca, compartilhar, exportar, arquivar atividade, frequência de alerta, preferências de busca, aparência nas configurações (o tema mora no shell).
- Salvos e monitoramento não compartilham estado entre páginas.
- Estados de loading, skeleton de página, erro de API e “ainda não indexado” fora do design system.
- Modelo `Tender` sem tipos de `TenderItem` / `TenderDocument` separados; status não cobre todas as situações do brief.
- API de licitações, schema Drizzle, auth e notificações reais.
- `replit.md` ainda é o template (“[Project name]”).
- Design system visual cobre uma fração dos componentes listados na spec.

## Problemas conhecidos

- Overrides de binários nativos no `pnpm-workspace.yaml` são para linux-x64 (Replit). Dev no macOS pode falhar ao resolver esbuild/lightningcss/rollup.
- `Button` das páginas não é o `components/ui/button`. Dois estilos coexistem.
- Detalhe com id desconhecido cai no primeiro mock (`tenders[0]`) em vez de 404.
- Métricas do dashboard (“1.248”, “+12,4%”) não derivam dos mocks. Não usar esses números como fato de produto.
