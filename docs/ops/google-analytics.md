# Google Analytics 4

O frontend do Pardal Digital usa GA4 apenas para medição de audiência com consentimento prévio. A configuração é uma variável de build do Vite:

```env
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

Configure a variável somente no ambiente **Production** do projeto Vercel. Desenvolvimento, testes e deployments de Preview devem deixá-la ausente; sem um ID válido no formato `G-` + 10 caracteres alfanuméricos, o frontend não cria `dataLayer`, não injeta `gtag.js` e não envia eventos.

## Consentimento e privacidade

- O carregador usa Consent Mode v2 em modo básico: antes de carregar a tag, define `analytics_storage`, `ad_storage`, `ad_user_data` e `ad_personalization` como `denied`; somente depois de “Concordar” atualiza `analytics_storage` para `granted`. Todos os sinais de anúncios permanecem `denied`.
- “Recusar” e a ausência de escolha não carregam recursos do Google. Ao trocar uma escolha anterior para “Recusar”, o frontend ativa `ga-disable-<measurement-id>`, atualiza o consentimento para `denied` e expira os cookies first-party `_ga*` visíveis ao JavaScript.
- O `config` usa `send_page_view: false`. O React envia `page_view` em mudanças de rota, sempre sem query string ou fragmento; `/search` nunca inclui o termo pesquisado, e rotas dinâmicas usam `:id` para não expor identificadores (inclusive CNPJ embutido no número de controle do PNCP). `page_location` e `page_title` recebem somente a rota sanitizada, `page_referrer` fica vazio e esses valores viram o padrão dos eventos seguintes.
- Os únicos eventos de produto são `sign_up`, `login` (apenas `method: Google`), `search` (sem termo), `save_tender`, `monitor_tender`, `recommendation_interest`, `recommendation_dismiss` e `begin_checkout`. Não enviar parâmetros de e-mail, nome, `user_id`, CNPJ, identificadores de edital ou conteúdo de perguntas.

## Content Security Policy

Na data desta integração, o projeto não define CSP em `vercel.json`, `middleware.js` ou `index.html`. Se uma CSP for adicionada, limite as liberações do GA4 a `https://www.googletagmanager.com` em `script-src` e `https://*.google-analytics.com https://*.analytics.google.com` em `connect-src`.

## Transparência LGPD pendente

O `main` ainda não publica `/privacidade`. O PR responsável pelas páginas legais deve listar o Google Analytics/Google LLC como operador de medição, informar a transferência internacional aplicável, as categorias de dados técnicos tratadas, a retenção configurada no GA4 e como revogar o consentimento.
