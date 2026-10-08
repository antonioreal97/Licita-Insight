# Deploy do Pardal Digital na Vercel

O projeto `abriu-la` publica automaticamente a produção após merge em `main`. Pull requests recebem deployments de preview pelo GitHub. A configuração de instalação, build, saída estática, middleware e roteamento fica nos arquivos versionados da raiz (`vercel.json` e `middleware.js`), que prevalecem sobre as opções atuais do projeto Vercel. Essas opções do projeto permanecem como estão porque o servidor refaz deploys do deployment de produção atual quando o túnel muda.

`VITE_API_BASE_URL=/api` faz o frontend chamar a API pela mesma origem. O middleware lê `API_UPSTREAM_ORIGIN` em tempo de execução e encaminha `/api/*` para o túnel ngrok. O sincronizador no servidor atualiza essa variável quando a URL do ngrok muda e refaz o deployment de produção atual. Mantenha esse sincronizador ativo; o deploy pelo GitHub não substitui essa atualização.

Para validar um PR, confira o build do preview, abra a URL protegida pela Vercel Authentication e teste `/` e `/api/readyz`. Como plano B para publicação manual, use `ops/vercel/deploy.sh` na branch `ops/macbook-worker`.
