# Product Context — Licita Insight

Deriva de [projectbrief](projectbrief.md). Alimenta [activeContext](activeContext.md).

## Por que existe

Pesquisar licitações públicas hoje é fragmentado: portais diferentes, linguagem burocrática, prazos espalhados, pouca visão do que mudou. A plataforma concentra oportunidades e deixa a pesquisa e o acompanhamento mais claros para quem vende para o setor público.

## Problema que resolve

- Encontrar editais relevantes sem vasculhar vários portais.
- Avaliar objeto, órgão, valor, prazo e situação numa leitura só.
- Salvar buscas e licitações.
- Acompanhar alterações (prazo, documento, suspensão, edital).

## Como deve funcionar

Fluxo: **Search → Filter → Evaluate → Save → Monitor**.

A busca começa simples (`desenvolvimento de software`, `serviços de engenharia`) e depois se refina com filtros: localização, órgão, datas, valor, modalidade, situação, fonte, categoria e ordenação (relevância, recência, valor, prazo).

Cada resultado mostra objeto (maior hierarquia), órgão, modalidade, localização, valor estimado, datas, prazo, situação, fonte e relevância. Ações rápidas: salvar, abrir detalhes, compartilhar, acompanhar.

O detalhe tem cabeçalho, resumo executivo, objeto, órgão contratante, itens, cronologia, documentos e link para a publicação original.

## Tom da experiência

Confiável, preciso, organizado, inteligente, eficiente. Densidade de informação no desktop; no mobile, filtros em drawer ou bottom sheet.

Evitar: portal governamental antigo, dashboards coloridos, gradientes e glassmorphism, cards dentro de cards, sombras pesadas, template SaaS genérico, copy com números que não podem ser comprovados.

Os editais exibidos vêm do banco. Número, órgão ou prazo que não esteja numa publicação coletada não entra na interface.

## Conta e identidade

Login com Google (OAuth). Não há persona de demonstração: nome, e-mail e foto vêm da conta Google do usuário. Busca e detalhe são públicos; salvar, monitorar, buscas salvas e notificações exigem login.

## O que o usuário sente ao entrar

Landing: **Encontre o edital certo. Antes do prazo.** CTAs para explorar o radar e ver a demonstração.

App autenticado: visão do radar, busca imediata, editais salvos e monitorados, buscas salvas com alertas e notificações dentro do app (sino e página Monitoramento) quando prazo, status, valor ou documentos mudam, ou quando entram editais novos numa busca salva. Sem e-mail neste ciclo.
