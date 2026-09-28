# UX — simplificação da interface (28 set 2026)

Pedido do owner: interface o mais intuitiva e simples possível, seguindo os princípios de design da Apple
(propósito, simplicidade — não minimalismo —, hierarquia clara, linguagem direta, feedback imediato,
acessibilidade). Sem deploy.

## Método

Auditoria de todas as telas (landing, login, busca, detalhe, oportunidades, painel, salvos, buscas salvas,
monitoramento, configurações), deslogado e logado, em 1440×900 e 390×844, com dados reais do `licita_cycle4`
(Playwright + Chrome for Testing). Mesma auditoria repetida depois das mudanças.

## O que mudou e por quê

| Onde | Antes | Depois | Princípio |
|---|---|---|---|
| Tipografia (tokens) | rótulos 10 px monoespaçados em caixa-alta; metadados 11 px; interface 13 px; corpo 14 px | rótulos 12 px sans com peso; metadados 12 px; interface 14 px; corpo 15 px; números com algarismos tabulares na fonte da interface | hierarquia por peso e tamanho; legibilidade para quem lê edital o dia todo |
| Menu lateral | grupo "Workspace", slogan "procurement intelligence", link "Design system" | sem título no grupo principal, sem slogan, "Design system" só em desenvolvimento (link e rota) | linguagem do usuário; nada interno exposto |
| Topo | "Fonte: PNCP" em todas as telas | removido (a fonte segue no detalhe e em "Abrir fonte original") | cada elemento precisa se pagar |
| Títulos de página | sobretítulos decorativos ("central de pesquisa", "sua shortlist", "sinais importantes"…) | removidos; fica só a data de hoje no painel | simplicidade |
| Login | "Entre no seu workspace." | "Entre com sua conta Google." | rótulo direto e específico |
| Card de resultado | "PNCP" repetido em todo card; título 14 px; no celular valor e prazo em duas linhas | sem a fonte repetida; título 15 px; no celular valor e contagem regressiva numa linha (data exata no detalhe e no `title`); retorno visual ao tocar | o mais importante mais óbvio; resposta imediata |
| Ficha do edital | checklist com rótulos repetidos ("Documento societário" 2×); grupo "Habilitação" repetindo qualificação técnica/econômica; 5 linhas "Não encontrado" | grupos como perguntas ("Quem pode participar", "Documentos exigidos", "Garantias e multas", "Execução do contrato"); checklist uma linha por tipo com todas as páginas; campo fixo some quando o checklist já cobre o tipo; não encontrados numa linha só, com rótulo explícito (nunca "não exige") | agrupamento; sem redundância; honestidade mantida |
| Cabeçalho do edital | prazo em 2º lugar, mesmo peso de publicação e fonte | prazo primeiro e na coluna mais larga | hierarquia |
| Painel | "Editais no banco", card "Coleta" explicando a API | "Prazo nos próximos 7 dias" primeiro, "Publicados na semana", "Editais disponíveis"; card técnico removido | linguagem do usuário; propósito |
| Landing | 9 seções, três dizendo quase a mesma coisa | 7 seções: "Método" removida; "Instrumento de pesquisa" virou a faixa "Também no LicitAI" (chamadas culturais, e-mail, dados) | simplicidade |
| Acessibilidade | só `prefers-reduced-motion` | + `prefers-reduced-transparency` (barras translúcidas ficam sólidas) | flexibilidade |

## Resultado medido

- 30 telas auditadas: **0 erros de console, 0 rolagem horizontal**, antes e depois.
- Altura das páginas (menos rolagem para a mesma informação): detalhe do edital −13% (desktop) / −8% (celular);
  landing −11% / −14%; painel −10% / −7%; busca no celular 4.737 → 4.673 px mesmo com texto maior.
- Typecheck e build de produção do frontend: OK. No bundle de produção não há a página nem o link do design
  system, nem o slogan antigo.

## Fica para depois

- Seletor "Palavra-chave / Semântica beta" na busca: exige entender uma diferença técnica. Candidato a virar
  uma busca só (semântica com queda para palavra-chave, que já existe no backend).
- A busca abre com todos os status; decidir com o owner se o padrão deve ser "Abertos".
- Dois avisos iguais ("Os trechos são escolhidos automaticamente…") na ficha e no Perguntar ao edital.
