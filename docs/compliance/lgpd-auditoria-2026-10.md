# Auditoria de Conformidade com a LGPD (Lei 13.709/2018) — Pardal Digital

> **AVISO LEGAL:** Este documento constitui um relatório técnico de auditoria de software, infraestrutura e governança de dados pessoais. As avaliações e recomendações aqui expressas têm caráter estritamente consultivo e técnico, **NÃO constituindo nem substituindo parecer jurídico formal** emitido por advogado habilitado. Recomenda-se a validação das minutas contratuais e políticas institucionais por assessoria jurídica especializada em Direito Digital e Proteção de Dados.

Data de referência da auditoria: Outubro de 2026  
Versão do documento: 1.0  
Status: Concluída  

---

## 1. Resumo Executivo

### 1.1 Nota Geral de Conformidade: 7,5 / 10 (Conceito B+ · Conforme com Ressalvas)

O projeto **Pardal Digital** apresenta um nível notável de maturidade técnica em **Privacy by Design** (Privacidade desde a Concepção) na arquitetura de software e no código-fonte. Destacam-se positivamente o tratamento estrito de cookies e armazenamento local, a anonimização e hash de credenciais de sessão, a segregação de responsabilidades de pagamento com o gateway Asaas, o modelo de consentimento granular e revogável para o motor de recomendações e a implementação nativa de endpoints para exercício de direitos do titular (exportação e eliminação de conta em cascata).

As principais vulnerabilidades concentram-se na **ausência de camada formal de transparência institucional** (falta de Termos de Uso e Política de Privacidade publicados no frontend), na **segurança física e lógica em repouso da infraestrutura de produção** (hospedagem em servidor caseiro Ubuntu e backups locais `pg_dump` desprovidos de criptografia em repouso), na **inexistência de processos formalizados de resposta a incidentes** e na **ausência de contratos de operador (Data Processing Agreements - DPAs)** com parceiros de nuvem e inteligência artificial.

---

### 1.2 Top 10 Lacunas por Nível de Risco

| # | Lacuna Identificada | Artigo da LGPD | Risco | Impacto Principal |
|---|---|---|---|---|
| **1** | **Inexistência de Política de Privacidade e Termos de Uso na UI:** Não há links, páginas ou termos informando controlador, finalidades, compartilhamento, retenção ou direitos. | Art. 6º, VI; Art. 9º | **ALTO** | Ilegalidade na coleta direta de dados por ausência de transparência obrigatória; risco imediato de sanções pela ANPD. |
| **2** | **Servidor caseiro e backups `pg_dump` locais sem criptografia em repouso:** Volume Docker do PostgreSQL e dumps binários residem em disco sem criptografia de volume (LUKS/FileVault). | Art. 46 | **ALTO** | Furto físico ou acesso não autorizado à máquina expõe integralmente a base de dados de usuários, perfis e pesquisas. |
| **3** | **Ausência de Plano de Resposta a Incidentes (CSIRP) e procedimento ANPD:** Não há processo definido para comunicação de incidentes de segurança à ANPD no prazo de 3 dias úteis. | Art. 48; Res. CD/ANPD 15/2024 | **ALTO** | Agravamento de penalidades em caso de vazamento por intempestividade na comunicação formal à autoridade e aos titulares. |
| **4** | **Falta de DPAs e Cláusulas Padrão para Transferência Internacional:** Ausência de contratos formais de operador com OpenAI (EUA), Brevo (França), Google (EUA), Vercel (EUA) e Cloudflare (EUA). | Art. 33, II; Art. 39 | **MÉDIO** | Irregularidade na transferência internacional de dados e responsabilização solidária por falhas de terceiros. |
| **5** | **Ausência de Encarregado pelo Tratamento (DPO) e Canal de Contato:** A aplicação não divulga identidade de DPO ou e-mail de contato de privacidade para atendimento a titulares. | Art. 41, §§ 1º e 2º | **MÉDIO** | Descumprimento de dever funcional perante a ANPD e impossibilidade de comunicação pré-processual com titulares. |
| **6** | **Retenção indefinida de sessões inativas, notificações e histórico de e-mails:** Ausência de rotinas automáticas de expurgo para sessões revogadas, notificações lidas e logs de e-mails entregues. | Art. 15; Art. 16 | **MÉDIO** | Violação ao princípio da necessidade e conservação excessiva de dados pessoais obsoletos no banco relacional. |
| **7** | **Omissões no payload de exportação de dados (`GET /me/export`):** Arquivo JSON não inclui corpos de e-mail recebidos, passagens de edital retornadas pela IA nem histórico de tarefas da fila `ai_jobs`. | Art. 18, II | **MÉDIO** | Atendimento parcial do direito de acesso amplo às informações tratadas pelo controlador. |
| **8** | **Persistência de e-mail na tabela `beta_access_grants` pós-exclusão:** Se um usuário beta solicitar exclusão da conta (`DELETE /me`), seu e-mail permanece registrado indefinidamente na tabela de grants. | Art. 18, VI | **MÉDIO** | Falha de deleção integral na exclusão de conta, retendo identificador pessoal sem base legal sobrevivente. |
| **9** | **Armazenamento de IP em logs do Nginx sem política formal de ciclo de vida:** Logs de acesso na borda Nginx gravam `client_ip` em texto puro sem parametrização de expurgo após o prazo do Marco Civil. | Art. 7º, II c/c Art. 15 MCI | **BAIXO** | Risco de acúmulo desnecessário de logs contendo dados pessoais de conexão além do prazo legal de 6 meses. |
| **10** | **Ausência de aviso anti-PII na interface de perguntas com IA (`AskTender`):** Campo de pergunta livre não orienta o usuário a não inserir dados pessoais sensíveis ou nomes próprios nos prompts à OpenAI. | Art. 6º, III; Art. 46 | **BAIXO** | Possibilidade de transmissão acidental de dados pessoais de terceiros para inferência de modelo em servidor internacional. |

---

### 1.3 O que já está conforme (Pontos Fortes de Privacidade por Design)

1. **Gestão Ética de Cookies e Armazenamento Local:**
   - Banner de cookies simétrico com botões "Concordar" e "Recusar" com mesmo peso visual (`artifacts/licitainsight/src/features/privacy/cookie-notice.tsx:27-33`).
   - Bloqueio técnico preventivo: nada é gravado em `localStorage` antes da escolha do usuário; a função `optionalStorageAllowed()` protege tema, buscas recentes, sidebar e relógio de inatividade (`cookie-consent.ts:19-21`).
   - O cookie de autenticação `licita_session` é estritamente necessário para prestação do serviço autenticado (Art. 7º, V), configurado como `HttpOnly`, `SameSite: "lax"` e `Secure` em produção (`artifacts/api-server/src/auth/http.ts:9-25`).
2. **Opt-in Rigoroso em Recomendações Comportamentais:**
   - A preferência `recommendation_personalization_enabled` nasce `false` por padrão (`lib/db/src/schema/accounts.ts:47-49`).
   - O backend valida a preferência antes de registrar qualquer evento em `recommendation_events` (`artifacts/api-server/src/recommendations/recommendation-service.ts:901-906`). Sem opt-in ativo, as buscas e cliques do usuário são descartados imediatamente.
   - Ao desligar, a exclusão do histórico é acionada (`deleteHistory: true`) e existe botão avulso para purga imediata do histórico (`DELETE /api/v1/me/recommendation-history`). Retenção limitada a 180 dias com limpeza diária sob job lock (`recommendation-service.ts:38`).
3. **Autonomia nos Direitos do Titular (Art. 18):**
   - Endpoints de Exportação (`GET /api/v1/me/export`) e Exclusão (`DELETE /api/v1/me`) ficam deliberadamente fora do gate de assinatura paga (`402 SUBSCRIPTION_REQUIRED`), permitindo que usuários em teste expirado ou cancelados exerçam seus direitos a qualquer momento (`docs/contracts/account-v1.md:328-330`).
   - A exclusão cancela a assinatura recorrente no Asaas via API externa antes de tocar no banco local, impedindo cobranças órfãs em cartão de crédito (`artifacts/api-server/src/account/account-privacy-service.ts:299-301`).
   - A exclusão local roda em transação atômica única com deleção em cascata de todas as tabelas vinculadas (`account-privacy-service.ts:204-272`).
4. **Segurança Criptográfica de Sessão e Credenciais:**
   - Integração Google OAuth 2.0 com protocolo PKCE e cookie assinado temporário para `state` (`artifacts/api-server/src/auth/http.ts:31-44`).
   - Tokens de sessão aleatórios de 256 bits (`randomToken()`); o banco de dados armazena apenas o hash criptográfico SHA-256 (`sessionsTable.id`), impedindo a apropriação de sessões mesmo em caso de vazamento do banco (`artifacts/api-server/src/auth/session-service.ts:160-168`).
   - Janela deslizante restrita de 10 minutos de inatividade (`SESSION_IDLE_MS = 600_000`).
5. **Mitigação e Minimização no Processamento Financeiro:**
   - Nenhum dado de cartão de crédito, código de segurança (CVV) ou CPF/endereço de faturamento é armazenado na base de dados do Pardal Digital; todo o checkout é hospedado e operado diretamente pela infraestrutura regulada do Asaas (`artifacts/api-server/src/billing/asaas-client.ts:75-99`).
6. **Defesa em Profundidade na Camada Web e API:**
   - Validação estrita de CSRF em todas as mutações (`requireCsrf`) via header customizado `X-Requested-With: licita-insight` e conferência de `Origin` (`artifacts/api-server/src/auth/http.ts:53-65`).
   - Rate limit em memória categorizado por perfil de rota (`auth`, `ai`, `write`, `billing`, `privacy`, `preauth`) para evitar ataques de força bruta, scraping e exaustão de conexões (`artifacts/api-server/src/middlewares/request-protection.ts:106-123`).
   - Configuração de `store: false` em requisições à OpenAI, assegurando contratualmente que os dados de inferência não sejam persistidos para retreinamento de modelos (`artifacts/api-server/src/ai/openai-client.ts:70`).
   - Comunicação segura entre a borda Oracle e o servidor da aplicação encapsulada por túnel criptografado Tailscale WireGuard (`ops/oracle-edge/compose.yml:8,12`).

---

## 2. Tabela de Achados e Recomendações

| Item | Situação Atual | Evidência (Arquivo:Linha) | Artigo da LGPD | Risco | Correção Sugerida | Esforço | Responsável |
|---|---|---|---|---|---|---|---|
| **A-01** | Ausência de Política de Privacidade e Termos de Uso públicos na interface do usuário. | `artifacts/licitainsight/src/App.tsx:53-68`<br>`artifacts/licitainsight/src/features/landing/landing-page.tsx:1-200` | Art. 6º, VI;<br>Art. 9º | **ALTO** | Elaborar Política de Privacidade e Termos de Uso completos, disponibilizando páginas em `/privacidade` e `/termos` com links no rodapé e tela de login. | **M** | Jurídico / Owner / Código |
| **A-02** | Ausência de criptografia em repouso no servidor caseiro (Ubuntu) e em dumps de backup do PostgreSQL. | `deploy/beta-local/backup.sh:17-21`<br>`ops/macbook/monitor/ALBERT.md:15` | Art. 46 | **ALTO** | Habilitar criptografia de disco completo (LUKS) no host Linux e implementar cifragem assimétrica (GPG / age) nos scripts de `pg_dump` antes da gravação em disco. | **M** | Owner (DevOps) |
| **A-03** | Inexistência de Plano de Resposta a Incidentes de Segurança e canal de notificação à ANPD. | `docs/ops/`<br>`ops/macbook/monitor/ALBERT.md:1-127` | Art. 48;<br>Res. CD/ANPD 15/2024 | **ALTO** | Formalizar fluxo de contenção, triagem de gravidade e comunicação à ANPD e titulares no prazo de até 3 dias úteis. | **P** | Owner / Jurídico |
| **A-04** | Falta de formalização de acordos de tratamento de dados (DPAs) com operadores de nuvem e IA. | `artifacts/api-server/src/ai/config.ts:16-23`<br>`artifacts/api-server/src/email/brevo-client.ts:6-7` | Art. 33, II;<br>Art. 39 | **MÉDIO** | Assinar e arquivar DPAs padrão com OpenAI, Brevo, Asaas, Google Cloud, Cloudflare e Vercel, adotando Cláusulas Padrão Contratuais. | **M** | Owner / Jurídico |
| **A-05** | Ausência de indicação do Encarregado pelo Tratamento de Dados (DPO) e canal de contato de privacidade. | `artifacts/licitainsight/src/features/auth/auth-page.tsx:147-150` | Art. 41, §§ 1º e 2º | **MÉDIO** | Nomear formalmente o Encarregado (ou declarar dispensa de agente de pequeno porte, se aplicável pela Res. CD/ANPD nº 2/2022) e publicar e-mail de contato (ex.: `privacidade@pardaldigital.com.br`). | **P** | Owner |
| **A-06** | Falta de rotinas automáticas de expurgo para sessões mortas, notificações lidas e logs de e-mail. | `artifacts/api-server/src/auth/session-service.ts:182-198`<br>`docs/contracts/account-v1.md:177, 401` | Art. 15;<br>Art. 16 | **MÉDIO** | Criar jobs agendados para expurgar sessões expiradas há mais de 30 dias, notificações com mais de 90 dias e entregas de e-mail com mais de 90 dias. | **P** | Código (Backend) |
| **A-07** | Omissão de dados no arquivo de exportação pessoal do titular (`GET /api/v1/me/export`). | `artifacts/api-server/src/account/account-privacy-service.ts:127-154` | Art. 18, II | **MÉDIO** | Incluir no export o conteúdo completo de perguntas e respostas de IA (`passages` e `summary`), corpos de e-mail entregues e tarefas na fila `ai_jobs`. | **P** | Código (Backend) |
| **A-08** | E-mail do usuário permanece retido na tabela `beta_access_grants` após exclusão de conta via `DELETE /me`. | `artifacts/api-server/src/account/account-privacy-service.ts:223-272`<br>`lib/db/src/schema/accounts.ts:87-97` | Art. 18, VI | **MÉDIO** | Adicionar comando `delete from beta_access_grants where email = user.email` na transação de exclusão de conta em `deleteLocalAccount`. | **P** | Código (Backend) |
| **A-09** | Log do Nginx na borda Oracle registra endereço IP (`client_ip`) em texto puro sem política de retenção. | `ops/oracle-edge/templates/default.conf.template:21-31` | Art. 7º, II c/c<br>Art. 15 MCI | **BAIXO** | Configurar rotação de logs (logrotate) garantindo descarte após 180 dias ou aplicar pseudonimização/truncamento de IP nos logs analíticos de longo prazo. | **P** | Owner (DevOps) |
| **A-10** | Ausência de orientação de minimização na caixa de perguntas de editais com IA (`AskTender`). | `artifacts/licitainsight/src/features/tenders/components/ask-tender-panel.tsx:1-350` | Art. 6º, III;<br>Art. 46 | **BAIXO** | Inserir texto auxiliar abaixo do campo de pergunta: *"Não insira dados pessoais ou informações confidenciais da sua empresa na pergunta."* | **P** | Código (Frontend) |
| **A-11** | Ausência de interface para retificação cadastral de Nome e E-mail fora da sincronização Google OAuth. | `artifacts/licitainsight/src/features/settings/settings-page.tsx:1-280` | Art. 18, III | **BAIXO** | Adicionar nota explicativa nas configurações informando que o nome e foto são gerenciados pela Conta Google, com link para a central de ajuda. | **P** | Código (Frontend) |
| **A-12** | Registro das Operações de Tratamento (ROPA) não estava documentado formalmente no repositório. | `docs/compliance/` | Art. 37 | **BAIXO** | Institucionalizar o inventário ROPA anexo a esta auditoria como documento de conformidade mantido sob controle de versão. | **P** | Owner |

*Legenda de Esforço:* **P** (Pequeno: 1 a 2 dias), **M** (Médio: 3 a 5 dias), **G** (Grande: > 1 semana).

---

## 3. Inventário de Dados Pessoais (ROPA Simplificado — Art. 37 da LGPD)

| Operação / Tabela | Dados Pessoais Coletados | Categoria de Titulares | Finalidade Específica | Base Legal Provável (LGPD) | Compartilhamento / Operadores | Prazo de Retenção Previsto |
|---|---|---|---|---|---|---|
| **Cadastro e Usuários**<br>(`users`) | Nome, E-mail, Avatar (foto), ID Google (`googleSub`), ID do usuário (`id`), preferências de notificação e consentimento. | Usuários cadastrados (titulares que realizaram login via Google). | Autenticação no sistema, identificação da conta, prestação de serviços e registro de consentimento. | Art. 7º, V (execução de contrato);<br>Art. 7º, I (consentimento para recomendações). | Google LLC (OAuth). | Enquanto a conta estiver ativa. Excluído em até 24h após solicitação via `DELETE /me`. |
| **Sessões Ativas**<br>(`sessions`) | Hash SHA-256 do token de sessão, ID do usuário, data de criação, último acesso (`lastSeenAt`), expiração (`expiresAt`). | Usuários autenticados. | Manutenção da sessão autenticada e segurança contra sessões ociosas. | Art. 7º, V (execução de contrato);<br>Art. 7º, IX (segurança da informação). | Interno (PostgreSQL local). | 10 minutos de inatividade. *Lacuna:* registros expirados ou revogados permanecem no banco até exclusão manual. |
| **Tombstone de Teste**<br>(`google_trial_tombstones`) | Hash HMAC-SHA256 do `googleSub` e data limite do teste (`trialEndsAt`). | Usuários que ativaram o período de teste de 7 dias. | Prevenção a fraude e abuso de recriação de conta para obter teste gratuito perpétuo. | Art. 7º, IX (legítimo interesse do controlador);<br>Art. 11, II, "g" (analogia a prevenção à fraude). | Interno (PostgreSQL local). | Permanente (dado estritamente pseudonimizado e não reversível sem a chave). |
| **Acesso Beta Fechado**<br>(`beta_access_grants`) | E-mail do usuário convidado, data limite de acesso e data de revogação. | Usuários convidados para a fase beta fechada. | Concessão e controle administrativo de acesso gratuito antecipado. | Art. 7º, V (procedimentos preliminares a contrato);<br>Art. 7º, IX (legítimo interesse). | Interno (PostgreSQL local). | Até revogação manual pelo owner. *Lacuna:* não é expurgado ao deletar a conta. |
| **Perfil da Empresa**<br>(`company_profiles`) | Descrição do negócio, ofertas, exclusões, palavras-chave, categorias, porte (`ME/EPP`, outros), faixa de valor e estados de atuação. | Empreendedores, sócios de ME/EPP e empresários individuais. | Parametrização do motor de busca, cálculo de aderência de editais e recomendações. | Art. 7º, V (execução de contrato a pedido do titular). | TypeSafe AI / Jev (envia descrição e ofertas para cálculo semântico). | Enquanto a conta estiver ativa ou até exclusão do perfil pelo usuário (`DELETE /me/company-profile`). |
| **Cálculo de Aderência**<br>(`company_tender_fits`) | ID do usuário, ID do edital, score de aderência, motivos classificados, modelo de IA e tokens consumidos. | Usuários que consultaram aderência de certames. | Cache de cálculo de relevância e minimização de custos com chamadas repetidas de IA. | Art. 7º, V (execução de contrato). | TypeSafe AI / Jev. | Excluído junto com a conta ou ao atualizar a versão do perfil da empresa. |
| **Editais Salvos e Monitorados**<br>(`saved_tenders`) | ID do usuário, ID do edital, data de salvamento, flag de monitoramento, etapa de participação, anotações de checklist, protocolo e prazos pessoais. | Usuários com certames salvos. | Gestão operacional de processos licitatórios pelo usuário e envio de alertas de alterações. | Art. 7º, V (execução de contrato). | Interno (PostgreSQL local). | Até remoção pelo usuário ou exclusão da conta. |
| **Buscas Salvas**<br>(`saved_searches`) | ID do usuário, nome da busca, query de filtros, flag de alerta, data de verificação e novos matches. | Usuários cadastrados. | Automação de monitoramento de editais correspondentes a critérios do titular. | Art. 7º, V (execução de contrato). | Interno (PostgreSQL local). | Até exclusão pelo usuário (soft delete de 30s) ou exclusão da conta. |
| **Notificações do App**<br>(`notifications`) | ID do usuário, tipo de alteração no certame, título do edital, órgão, prazos e novidades de buscas salvas. | Usuários que monitoram editais ou buscas. | Notificação interna em painel sobre prazos, documentos e alterações de certames. | Art. 7º, V (execução de contrato). | Interno (PostgreSQL local). | *Lacuna:* retido indefinidamente no banco (planejado para 90 dias no contrato). |
| **Histórico de E-mails**<br>(`email_deliveries`) | E-mail do destinatário, assunto, corpo HTML e texto integral (com dados de prazos e editais pessoais), status, headers, ID do provedor. | Usuários que optaram por alertas ou digest diário. | Auditoria de entregabilidade de e-mails transacionais e reenvio em caso de falha. | Art. 7º, V (execução de contrato);<br>Art. 7º, VI (exercício regular de direitos). | Brevo / Sendinblue SAS (França/UE); Resend (fallback). | *Lacuna:* retido indefinidamente no banco (planejado para 90 dias no contrato). |
| **Eventos de Recomendação**<br>(`recommendation_events`) | ID do usuário, tipo (`search` ou `tender_view`), termos normalizados da busca, ID do edital visualizado, data/hora. | Usuários que ativaram expressamente o opt-in de personalização. | Calibração de algoritmo de recomendação de certames baseado no histórico comportamental. | Art. 7º, I (consentimento livre, informado e inequívoco). | Interno (PostgreSQL local; não enviado a terceiros). | 180 dias com limpeza diária automática; expurgado imediatamente ao revogar opt-in. |
| **Interesses e Recomendações**<br>(`recommendation_interest_profiles`, `user_recommendations`) | ID do usuário, perfil agregado de termos ponderados, ranking dos 50 editais sugeridos e score. | Usuários cadastrados. | Exibição da vitrine personalizada de oportunidades na área logada. | Art. 7º, V (execução de contrato);<br>Art. 7º, I (para a fração derivada de buscas/cliques). | Interno (PostgreSQL local). | Atualizado ciclicamente; excluído na exclusão da conta. |
| **Assinatura e Faturamento**<br>(`subscriptions`) | ID do usuário, status da assinatura, ID do cliente Asaas (`asaasCustomerId`), ID da assinatura Asaas, data de fim do período pago. | Assinantes do plano pago. | Controle de acesso a funcionalidades pagas e conciliação com gateway financeiro. | Art. 7º, V (execução de contrato);<br>Art. 7º, II (obrigação legal e contábil). | Asaas Gestão Financeira S.A. (Brasil). | Mantido enquanto ativa a conta; cancelado no Asaas ao excluir a conta. |
| **Perguntas à IA sobre Editais**<br>(`ai_ask_requests`) | ID do usuário, ID do edital, texto da pergunta elaborada pelo usuário, status, modelo de IA, tokens e custo estimado. | Usuários que utilizaram a ferramenta "Perguntar ao Edital". | Histórico de consultas, cache de perguntas frequentes e auditoria de cotas diárias de uso. | Art. 7º, V (execução de contrato). | OpenAI LLC (EUA) e TypeSafe AI. | Excluído na exclusão da conta do usuário. |
| **Controle de Cotas Diárias de IA**<br>(`ai_daily_usage`, `ai_daily_tenders`, `ai_fit_daily_usage`) | ID do usuário, data calendário de São Paulo, contagem de requisições, editais consultados e custo acumulado. | Usuários que utilizam recursos de IA. | Imposição de limites de segurança (rate limit diário) e proteção de custos de infraestrutura. | Art. 7º, V (execução de contrato);<br>Art. 7º, IX (legítimo interesse do controlador). | Interno (PostgreSQL local). | Excluído na exclusão da conta do usuário. |
| **Hub de Oportunidades**<br>(`cultural_opportunities`) | Nenhum dado de pessoa física por desenho: instituição publicadora, título e resumo da chamada e tipo do agente dono (individual ou coletivo). Pode restar nome escrito pelo publicador no título ou no resumo. | Pessoas físicas que publicam chamadas em fontes públicas (Mapas Culturais). | Divulgar chamadas públicas de cultura e fomento. | Art. 7º, IX (legítimo interesse) sobre dado tornado público pelo titular (Art. 7º, § 4º), com minimização. | Interno (PostgreSQL local). | Enquanto a chamada constar do hub. *Lacuna:* não há lista de supressão para pedido de titular sobre chamada ainda aberta na fonte. |
| **Logs de Acesso da Borda**<br>(Nginx Oracle Edge) | Endereço IP do requisitante (`client_ip`), data/hora, método HTTP, rota sem query params, status HTTP, tempo de resposta. | Todos os visitantes (anônimos e autenticados). | Cumprimento de dever legal de guarda de logs e detecção de ataques cibernéticos/DDoS. | Art. 7º, II c/c Art. 15 da Lei 12.965/2014 (Marco Civil da Internet);<br>Art. 7º, IX (legítimo interesse). | Oracle Cloud Infrastructure (hospedagem da VM de borda). | Dever legal de 6 meses (Marco Civil da Internet). *Lacuna:* falta rotina formal de purge de logs antigos. |

---

## 4. Avaliação Aprofundada dos 9 Eixos da LGPD

### 4.1 Inventário de Dados Pessoais e Bases Legais (Art. 7º)

O mapeamento detalhado evidencia que a maioria das operações de tratamento encontra amparo no **Art. 7º, V (execução de contrato)**, uma vez que os dados são estritamente necessários para viabilizar as funcionalidades requeridas pelo próprio usuário (salvar certames, receber notificações solicitadas, gerar análises de conformidade de sua empresa e processar pagamentos de planos contratados).

As demais operações utilizam bases legais perfeitamente compatíveis:
- **Consentimento (Art. 7º, I):** Reservado estritamente para o rastreamento comportamental de termos de busca e aberturas de editais em `recommendation_events`. A separação entre o perfil estático da empresa (baseado em contrato) e o histórico de navegação (baseado em consentimento) demonstra rigor técnico exemplar.
- **Cumprimento de Obrigação Legal (Art. 7º, II):** Aplicável à guarda obrigatória de registros de conexão e de acesso a aplicações pelo prazo legal de 6 meses, conforme exigido pelo Artigo 15 da Lei nº 12.965/2014 (Marco Civil da Internet), bem como para os registros de faturamento mantidos pelo Asaas sob normativas tributárias e do BACEN.
- **Legítimo Interesse (Art. 7º, IX):** Adotado para a prevenção a fraudes no benefício de trial (`google_trial_tombstones`), rate limiting preventivo por IP em memória (`request-protection.ts`) e auditoria de limites de uso para sustentabilidade econômica da infraestrutura de IA.

---

### 4.2 Transparência (Art. 6º, VI e Art. 9º)

Este eixo representa a **principal fragilidade jurídica** do projeto na presente auditoria:
- **Ausência de Documentos Obrigatórios:** A aplicação não possui rotas ou páginas para Política de Privacidade (`/privacidade`) e Termos de Uso (`/termos`) em seu roteamento principal (`artifacts/licitainsight/src/App.tsx:53-68`).
- **Omissão de Informações aos Titulares:** A única menção na tela de login (`AuthPage.tsx:147-150`) é um texto resumido: *"Usamos seu nome, e-mail e foto do Google apenas para identificar sua conta."* Não há informação disponível sobre:
  - Quem é o controlador dos dados (Nome/Razão Social e CNPJ);
  - Como contatar o Encarregado pelo Tratamento de Dados (DPO);
  - As categorias de dados compartilhadas com operadores terceiros (OpenAI, TypeSafe AI, Brevo, Asaas, Oracle, Vercel, Cloudflare);
  - A ocorrência de transferência internacional de dados para os EUA e União Europeia;
  - Os prazos de guarda e retenção;
  - O catálogo completo de direitos previstos no Artigo 18 e o canal de suporte.

---

### 4.3 Consentimento e Cookies (Art. 7º, I; Art. 8º; Art. 9º)

- **Aviso de Cookies (`artifacts/licitainsight/src/features/privacy/cookie-notice.tsx`):**
  - O aviso é exibido de forma destacada e transparente.
  - Oferece paridade de escolha entre "Concordar" e "Recusar" sem empregar técnicas manipulativas (*dark patterns*).
  - Em caso de recusa, todas as chaves opcionais em `localStorage` são imediatamente limpas (`cookie-consent.ts:27`).
- **Caráter do Cookie de Sessão:**
  - O cookie `licita_session` é estritamente técnico e indispensável para manter o usuário autenticado na API (`artifacts/api-server/src/auth/http.ts:9-25`). Sua dispensa de consentimento prévio está plenamente alinhada às melhores práticas internacionais e ao Guia Orientativo de Cookies da ANPD (base legal no Art. 7º, V da LGPD).
- **Opt-in de Recomendações:**
  - Plenamente livre, informado e revogável. A opção é desligada por padrão, a interface explica textualmente o prazo de 180 dias de retenção, o backend não aceita eventos sem a flag ativa e o desligamento aciona a deleção imediata do histórico armazenado.

---

### 4.4 Direitos do Titular (Art. 18 da LGPD)

- **Confirmação e Acesso aos Dados (Art. 18, I e II):**
  - Implementado via `GET /api/v1/me/export` (`account-privacy-service.ts:30-194`). O usuário obtém um arquivo JSON estruturado contendo dados cadastrais, sessões ativas, editais salvos e monitorados, buscas salvas, notificações recebidas, entregas de e-mails, perguntas de IA, perfil corporativo, cálculo de aderência e assinatura.
  - *Omissões a sanar:* Corpos completos de e-mails (`htmlBody`), passagens/resumos de IA de perguntas sobre editais e tarefas históricas em `ai_jobs`.
- **Correção de Dados Incompletos ou Inexatos (Art. 18, III):**
  - O usuário retifica perfil corporativo, filtros, preferências de e-mail e recomendações a qualquer momento na UI.
  - Nome, e-mail e avatar são sincronizados a partir da Conta Google. Falta instrução clara na UI orientando que alterações de nome devem ser feitas no perfil Google para reflexo na aplicação.
- **Eliminação dos Dados Pessoais (Art. 18, VI):**
  - Implementado via `DELETE /api/v1/me` (`account-privacy-service.ts:276-321`), exigindo digitação da palavra de segurança `"EXCLUIR"` e CSRF.
  - Garante cancelamento prévio de assinaturas ativas no Asaas e apaga em cascata atômica todas as tabelas associadas.
  - *Retenções lícitas mantidas:* Tombstone de teste (`google_trial_tombstones`, justificado pelo legítimo interesse e prevenção a fraude) e registros fiscais de faturas mantidos pelo gateway Asaas (obrigação legal de 5 anos).
  - *Ponto de atenção:* A tabela `beta_access_grants` não remove o e-mail convidado quando a conta é excluída.
- **Revogação do Consentimento (Art. 18, IX):**
  - Atendida em um clique na seção de preferências de recomendações (`recommendation-preferences-section.tsx:34`), limpando os dados coletados.
- **Portabilidade (Art. 18, V):**
  - Atendida pelo formato padronizado e aberto do arquivo JSON emitido na exportação.

---

### 4.5 Minimização e Prazos de Retenção (Art. 6º, III; Art. 15; Art. 16)

- **Minimização de Dados Coletados:**
  - A aplicação não coleta dados sensíveis (dados biométricos, políticos, sindicais ou de saúde).
  - O formulário de login solicita exclusivamente as permissões padrão de escopo do Google OAuth (`email`, `profile`).
  - No faturamento, dados bancários e de cartão de crédito não trafegam pelos servidores da aplicação.
  - *Corrigido em 11/10/2026 (achado posterior à auditoria):* o hub de oportunidades gravava o nome do agente dono da chamada no Mapas Culturais mesmo quando ele era pessoa física, em `organization_name`, `origin_name`, `search_text` e `raw_payload`. A coleta passou a pedir o tipo do agente e não grava nome, id, documento nem contato de pessoa física; as linhas existentes são revisadas pelo job `opportunity_owner_review`. Regra, limpeza e fontes em [`minimizacao-fontes-publicas.md`](minimizacao-fontes-publicas.md).
- **Ciclo de Vida e Retenção:**
  - *Conforme:* Sessões expiram em 10 minutos de inatividade; eventos de recomendação são expurgados em 180 dias; passagens e documentos de IA de editais vencidos são purgados em 90 dias após o encerramento do certame.
  - *Inconforme (Lacunas):* Sessões revogadas e expiradas permanecem permanentemente em `sessions`; notificações acumulam-se perpetuamente em `notifications`; histórico de e-mails acumula-se perpetuamente em `email_deliveries`.

---

### 4.6 Compartilhamento com Terceiros, IA e Transferência Internacional (Art. 33 e Art. 39)

1. **OpenAI LLC (EUA):**
   - Recebe a pergunta textual do usuário em `generateAskSummary` (`openai-summary.ts:110`).
   - Mitigação técnica: A aplicação envia `store: false` no corpo da requisição (`openai-client.ts:70`), solicitando exclusão imediata de retenção nos servidores da OpenAI para fins de treinamento.
   - Pendência: Falta celebração formal do Data Processing Addendum (DPA) corporativo com Cláusulas Contratuais Padrão (SCCs) para regularizar a transferência internacional de dados sob o Artigo 33, II da LGPD.
2. **TypeSafe AI / Jev (Inferência de IA):**
   - Recebe dados do perfil da empresa (descrição e ofertas) em `scoreCompanyFit` (`jev-client.ts:123-128`). Em empresas individuais (MEI), tais informações representam dados de pessoa natural.
   - Pendência: Ausência de DPA formalizado com o provedor do serviço Jev e confirmação da localização geográfica dos servidores.
3. **Brevo / Sendinblue SAS (França / União Europeia):**
   - Recebe e-mail de destino, assunto e conteúdo dos comunicados (`brevo-client.ts:93-106`).
   - Sediado na França, submetido ao GDPR (regulamento europeu de proteção de dados com elevado grau de adequação). É necessário assinar/confirmar o DPA de proteção de dados disponibilizado pelo Brevo.
4. **Asaas Gestão Financeira S.A. (Brasil):**
   - Recebe `externalReference` (`userId`) na geração do checkout. Dados de cobrança (CPF, endereço, cartão) são coletados diretamente no ambiente do Asaas.
   - Atua como instituição financeira homologada pelo BACEN. Necessário formalizar o anexo de proteção de dados (DPA) padrão de clientes PJ.
5. **Vercel Inc. e Cloudflare Inc. (EUA):**
   - Provedores de infraestrutura de frontend, CDN e DNS. Requerem adesão formal aos respectivos DPAs padrão online.

---

### 4.7 Segurança da Informação (Art. 46)

- **Medidas Técnicas Implementadas (Nível Forte):**
  - Autenticação OAuth 2.0 com PKCE;
  - Segregação de tokens: apenas hash SHA-256 é gravado no PostgreSQL;
  - Cookies configurados com atributos `HttpOnly`, `SameSite: Lax` e `Secure`;
  - Janela de sessão deslizante estrita de 10 minutos com renovação controlada;
  - Proteção anti-CSRF exigindo header proprietário `X-Requested-With` e conferência de `Origin`;
  - Rate limiting multicamada e isolamento contra esgotamento de conexões;
  - Comunicação criptografada ponto a ponto entre a borda Oracle e o servidor caseiro via túnel Tailscale WireGuard.
- **Fragilidades de Infraestrutura (Nível Crítico):**
  - **Servidor Caseiro sem LUKS:** O servidor físico Ubuntu onde residem o Postgres e a aplicação não possui garantia de criptografia de disco completo (*Full Disk Encryption*). Em caso de furto físico do equipamento, os dados podem ser acessados diretamente.
  - **Backups Locais em Texto Claro:** O script `backup.sh` grava dumps binários do banco (`pg_dump -Fc`) em pastas locais sem nenhuma camada de cifragem criptográfica (ex.: GPG ou age). Qualquer invasor que obtenha acesso de leitura ao sistema de arquivos obtém cópia íntegra de todos os usuários, pesquisas e perfis corporativos.

---

### 4.8 Gestão e Resposta a Incidentes (Art. 48)

- **Diagnóstico:**
  - Inexistência de um Plano de Resposta a Incidentes de Violação de Dados Pessoais (CSIRP).
  - A equipe técnica não possui procedimentos estabelecidos para avaliação de severidade (risco aos titulares), registro em livro de incidentes ou notificação formal à ANPD no prazo estipulado pela **Resolução CD/ANPD nº 15/2024** (que define o prazo de **3 dias úteis** contados a partir da ciência do incidente relevante).
- **Avaliação do Monitoramento Atual (Albert-CLAUDE):**
  - O sistema de monitoramento operacional existente (`ops/macbook/monitor/ALBERT.md` e `licita_monitor.py`) é eficiente para métricas de disponibilidade (serviço ativo, sincronização de borda, status de containers e espaço em disco).
  - No entanto, ele **não monitora eventos de segurança da informação**, tais como tentativas excessivas de enumeração, anomalias de exfiltração de dados, consultas massivas ao banco de dados ou acessos administrativos não autorizados.

---

### 4.9 Registro das Operações e Avaliação de Impacto (Art. 37 e Art. 38)

- **Registro das Operações de Tratamento (ROPA):**
  - A LGPD, em seu Artigo 37, determina que o controlador mantenha registro formal das operações de tratamento. Esta auditoria supre essa exigência ao entregar a matriz ROPA documentada na Seção 3 deste relatório.
- **Relatório de Impacto à Proteção de Dados Pessoais (RIPD / DPIA):**
  - O projeto utiliza inteligência artificial para inferência de dados empresariais e classificação de perfis (`scoreCompanyFit`, recomendações ponderadas e perguntas a editais).
  - Nos termos do Artigo 38 da LGPD, a ANPD pode determinar ao controlador a elaboração de RIPD referente a operações que envolvam legítimo interesse ou perfilamento comportamental automatizado.
  - A documentação de critérios de exclusão, pesos transparentes em `recommendations-v1.md` e a garantia de não intervenção discriminatória constituem elementos preparatórios fundamentais para o RIPD.

---

## 5. Checklist de Ações do Owner (Ações Não-Código)

Este checklist reúne as providências administrativas, institucionais e jurídicas que competem diretamente ao proprietário do produto e não envolvem modificação direta no código-fonte da aplicação:

### Prioridade I: Imediata (Até 15 dias)
- [ ] **Aprovar e Publicar a Política de Privacidade e os Termos de Uso:**
  - Redigir os textos em linguagem clara e acessível, incorporando as finalidades, operadores, prazos de retenção e direitos do titular mapeados neste documento.
  - Disponibilizar os documentos em URLs permanentes acessíveis publicamente.
- [ ] **Nomear o Encarregado pelo Tratamento de Dados (DPO):**
  - Designar formalmente o responsável pelas comunicações com titulares e ANPD (pode ser o próprio fundador ou terceiro contratado).
  - Divulgar publicamente a identidade e canal de contato (e-mail dedicado: ex.: `privacidade@pardaldigital.com.br` ou `dpo@pardaldigital.com.br`) na Política de Privacidade e no rodapé do site.
  - *Observação:* Caso o Pardal Digital se enquadre como Agente de Tratamento de Pequeno Porte (Resolução CD/ANPD nº 2/2022), a nomeação formal de DPO não é obrigatória, mas a disponibilização de canal de comunicação com o titular permanece estritamente exigida.

### Prioridade II: Curto Prazo (Até 30 dias)
- [ ] **Criptografia em Repouso no Servidor Caseiro e Backups:**
  - Garantir que a partição de dados do servidor Ubuntu (`/var/lib/docker` e diretório de volumes) esteja sob LUKS (*Linux Unified Key Setup*).
  - Ajustar o script de backup para cifrar os arquivos `.dump` imediatamente após o `pg_dump` utilizando chave assimétrica GPG ou ferramenta `age`.
- [ ] **Formalizar Acordos de Operador (DPAs) com Fornecedores:**
  - Aderir formalmente aos aditivos contratuais de proteção de dados (DPAs) e Cláusulas Padrão Contratuais das seguintes plataformas:
    - **OpenAI:** Assinar o OpenAI Business Data Processing Addendum (com cláusula de *zero data retention*);
    - **Brevo (Sendinblue):** Confirmar adesão ao GDPR/LGPD Data Processing Agreement nas configurações da conta;
    - **Asaas:** Formalizar termos de tratamento de dados financeiros para clientes corporativos;
    - **Google Cloud / Workspace:** Validar termos de proteção de dados no Google Cloud Console;
    - **Vercel / Cloudflare:** Aceitar o DPA nas contas administrativas das plataformas.
- [ ] **Instituir Procedimento de Resposta a Incidentes (CSIRP):**
  - Documentar formulário interno e roteiro passo a passo de contenção de incidentes de segurança, definindo quem avalia o impacto e o canal oficial de notificação à ANPD em até 3 dias úteis.

### Prioridade III: Médio Prazo (Até 60 dias)
- [ ] **Plano de Transição de Infraestrutura para Nuvem com Certificação:**
  - Em linha com o plano de escala documentado em `docs/architecture-scale.md`, priorizar a migração do PostgreSQL e do backend para ambiente em nuvem gerenciado (ex.: Fly.io em São Paulo / AWS / GCP) dotado de certificações SOC 2 Tipo II, ISO 27001 e criptografia gerenciada em repouso por padrão, eliminando os riscos decorrentes da operação em servidor caseiro.
- [ ] **Auditoria e Revisão Anual de Conformidade:**
  - Estabelecer rotina anual de revisão do ROPA e validação de novos fluxos de IA ou novos operadores contratados.

---

## 6. Conclusão da Auditoria

O Pardal Digital demonstra uma postura técnica responsável e diferenciada: suas escolhas de engenharia privilegiam a minimização de dados, proteção de sessão e autonomia do titular em níveis superiores à média de produtos em estágio equivalente.

A superação das lacunas apontadas — com foco na publicação imediata dos instrumentos de transparência (Termos e Política de Privacidade), proteção criptográfica dos backups/servidor e formalização documental de DPAs — colocará o produto em **plena conformidade com a Lei Geral de Proteção de Dados Pessoais (LGPD)**, blindando a operação contra riscos regulatórios e transmitindo máxima confiança a seus usuários e assinantes.
