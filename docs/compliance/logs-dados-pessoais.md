# Dados pessoais em logs

Atualizado em 8 de outubro de 2026.

O logger HTTP da API serializa somente identificador da requisição, método, caminho sem query string e status. IP, cabeçalhos, corpo da requisição e resposta não fazem parte do registro normal. A configuração central também mascara cookies, autorização, e-mail, e-mail de destinatário, IP e endereço remoto se algum contexto adicional tentar registrá-los.

Respostas de erro do Asaas não são gravadas integralmente, porque podem repetir dados do cliente. Permanecem apenas rota do provedor e status HTTP. Identificadores internos de usuário podem aparecer em erros operacionais pontuais para correlação, mas nome e e-mail não devem ser incluídos.

A retenção e rotação do Nginx de borda e do host ficam documentadas no runbook de infraestrutura do branch `ops/macbook-worker`, com limite máximo de seis meses.
