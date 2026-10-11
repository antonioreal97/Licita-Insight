# Fontes culturais: TLS, ritmo e desbloqueio

Diagnóstico executado em **08/10/2026**, a partir da máquina de desenvolvimento,
com o comando abaixo para cada host:

```sh
openssl s_client -connect <host>:443 -servername <host> -showcerts
```

Nenhuma fonte usa desativação global da validação TLS. A coleta envia
`Accept: application/json` e o identificador honesto
`PardalDigital/<versão> (+https://pardaldigital.com; contato@pardaldigital.com)`.

## Resultado por fonte afetada

| Fonte                                        | Resultado do `openssl`                                                                                                                                | Classificação                              | Conduta da coleta                                                                      |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------- |
| Mapa da Cultura (federal)                    | TLS válido; a API respondeu HTTP 403, `Server: cloudflare`, `Cf-Mitigated: challenge`, sem `Retry-After`, e HTML pedindo JavaScript/cookies           | WAF com desafio gerenciado, não rate limit | `blocked`: não tenta evasão; pede liberação ao MinC                                    |
| Amapá (`mapacultural.ap.gov.br`)             | o servidor enviou somente o certificado folha; `verify return code: 21`                                                                               | cadeia incompleta, intermediário ausente   | adiciona apenas o intermediário público R36 às raízes do Node para esse host           |
| Maranhão (`mapadacultura.ma.gov.br`)         | cadeia até `ISRG Root YR`, que o trust store usado pelo `openssl`/coletor não reconhece; `verify return code: 19`; o nome do host confere             | AC não reconhecida                         | `degraded`; não adiciona uma nova raiz de confiança e tenta novamente no próximo ciclo |
| Mato Grosso (`mapas.mt.gov.br`)              | `verify return code: 10`; folha válida de 15/04/2026 a 14/07/2026; o nome confere                                                                     | certificado expirado                       | `degraded`: “certificado ... expirou em 14/07/2026” e nova tentativa no próximo ciclo  |
| Tocantins (`mapadacultura.secult.to.gov.br`) | folha autoassinada `Kubernetes Ingress Controller Fake Certificate`, SAN `ingress.local`, válida de 04/05/2026 a 04/05/2027; `verify return code: 18` | autoassinado **e** nome errado             | `degraded`; não aceita a fonte e tenta novamente no próximo ciclo                      |

O endpoint do Maranhão alternou entre folhas emitidas por `YR1` e `YR2` durante o
diagnóstico; ambas terminavam na raiz nova `ISRG Root YR`. Isso reforça que fixar a
folha sem decisão explícita do owner seria frágil.

## Intermediário público do Amapá

O arquivo versionado é
`artifacts/api-server/src/ingest/certificates/sectigo-public-server-authentication-ca-dv-r36.pem`.

- sujeito: `Sectigo Public Server Authentication CA DV R36`;
- emissor: `Sectigo Public Server Authentication Root R46`;
- validade: 22/03/2021 a 21/03/2036;
- SHA-256: `8C:54:C3:34:B6:6B:A4:E4:26:77:2A:F4:A3:F9:13:6C:19:A1:AE:C7:29:FD:B2:8C:53:5C:07:A5:A4:EF:22:E0`;
- origem AIA publicada no certificado folha:
  `http://crt.sectigo.com/SectigoPublicServerAuthenticationCADVR36.crt`.

O agente de `mapacultural.ap.gov.br` usa `tls.rootCertificates` mais esse
intermediário. O teste de unidade abre um servidor TLS com cadeia incompleta e prova
que a cadeia completada passa enquanto uma cadeia realmente inválida continua sendo
rejeitada.

## Pinning excepcional

`CULTURE_TLS_PINNED_HOSTS` fica vazio por padrão. Caso o owner decida aceitar uma
fonte específica apesar de certificado expirado, autoassinado ou nome errado, deve
configurar host exato e fingerprint SHA-256 da folha:

```dotenv
CULTURE_TLS_PINNED_HOSTS=host.gov.br=AA:BB:...:FF
```

Não há wildcard. O conector recusa redirecionamento para outro host e encerra a
conexão se o fingerprint divergir. Renovação do certificado exige revisão e rotação
explícita do pin; nunca use `NODE_TLS_REJECT_UNAUTHORIZED=0`.

## Ritmo e tentativas

- `CULTURE_PAGE_DELAY_MS=1000`: intervalo mínimo entre requisições;
- `CULTURE_HTTP_MAX_RETRIES=2`: tentativas adicionais para 429 e 5xx;
- `CULTURE_RETRY_BASE_MS=1000`: backoff exponencial quando não há `Retry-After`;
- `CULTURE_MAX_PAGES=20`: teto de páginas de 50 chamadas por instalação;
- `Retry-After` em segundos ou data HTTP prevalece sobre o backoff local; acima de
  60 segundos a instalação fica para o próximo ciclo, sem segurar a coleta;
- HTTP 403 não é repetido em sequência: a fonte é marcada `blocked`.

## Liberação do Mapa da Cultura

O canal oficial publicado pelo Ministério da Cultura é
`suporte.mapa@cultura.gov.br`:
<https://www.gov.br/cultura/pt-br/acesso-a-informacao/perguntas-frequentes/mapas-culturais>.
O pedido deve informar o User-Agent acima, IP de saída do ambiente de produção,
rota `/api/opportunity/find`, volume baixo e finalidade de reutilização pública.

O rascunho do pedido está em [`pedido-liberacao-mapa-cultura.md`](./pedido-liberacao-mapa-cultura.md).
Enquanto ele não é atendido, as chamadas federais vêm das páginas de editais do MinC e da Funarte e do
Transferegov.br (`CULTURE_FEDERAL_COLLECT=true`; ver "Fontes federais de cultura" em
`docs/contracts/opportunities-v1.md`).

Não foi encontrada alternativa oficial equivalente para **oportunidades**. O portal
de dados da Cultura documenta recursos antigos do Mapa principalmente para espaços,
agentes, eventos e projetos; e a página atual do SNIIC informa que o padrão de dados
e o datalake ainda estão em estruturação:
<https://www.gov.br/cultura/pt-br/assuntos/acoes-programas-e-politicas/sniic/>.
Portanto, o SNIIC não é tratado como fallback de oportunidades até publicar um
recurso oficial verificável.

## Prova ao vivo após a correção

Execução do cliente real em 08/10/2026, janela de 30 dias, desta máquina:

| Instalação  | Estado | Chamadas audiovisuais | Páginas | Resultado                                                       |
| ----------- | -----: | --------------------: | ------: | --------------------------------------------------------------- |
| federal     |     BR |                     0 |       0 | `blocked` pelo desafio Cloudflare                               |
| Amapá       |     AP |                     0 |       4 | TLS validado com o intermediário; consultas datadas responderam |
| Maranhão    |     MA |                     0 |       0 | `degraded`: AC não reconhecida                                  |
| Mato Grosso |     MT |                     0 |       0 | `degraded`: certificado expirado                                |
| Tocantins   |     TO |                     0 |       0 | `degraded`: certificado autoassinado e nome errado              |

No Amapá, a consulta adicional de fluxo contínuo excedeu o timeout de 30 segundos;
as quatro consultas datadas válidas foram preservadas e não retornaram chamada
audiovisual na janela.

## Coleta de todas as chamadas (10/10/2026)

Até aqui a coleta consultava cada instalação quatro vezes por palavra-chave
(`audiovisual`, `cinema`, `filme`, `documentario`) e uma quinta vez por fluxo contínuo.
Agora faz uma consulta por instalação, sem palavra-chave:
`registrationTo=GTE(<hoje>)`, com áreas, tipo e origem no mesmo `@select`.

### Causa do "invalid JSON"

A quinta consulta mandava `continuousFlow=EQ(true)`. No Mapas Culturais essa coluna é
uma data (`"type":"datetime"` em `/api/opportunity/describe`), não um booleano. O
PostgreSQL da instalação recusa a comparação
(`SQLSTATE[22007] invalid input syntax for type timestamp: "true"`) e o servidor
devolve a página de erro em HTML: status 200 e `text/html` em AP, ES, GO, PA, PB, PE,
PI e SE; status 500 no CE. O cliente tentava ler esse HTML como JSON.

A consulta foi removida. Chamadas de fluxo contínuo já vêm na listagem por data,
porque o Mapas grava `registrationTo = 2111-01-01` nelas. As respostas reais estão
gravadas em `artifacts/api-server/src/ingest/fixtures/mapas/`.

### Instalações municipais

A lista vem da seção "Instalações" do `README` oficial
(<https://github.com/mapasculturais/mapasculturais>), lida em 10/10/2026: 31
municípios. Ribeirão das Neves e Santa Luzia aparecem lá com `http://` e
redirecionam para HTTPS, então estão cadastradas em HTTPS. **Aracaju e Bento
Gonçalves só respondem na porta 80**; ficam em HTTP sem TLS, marcadas com
`plainHttp` em `cultural-installations.ts`. O dado é público e nada sigiloso é
enviado, mas a resposta não tem garantia de integridade no caminho.

Uma instalação municipal que falha em três coletas seguidas passa a `disabled` e não
recebe requisição por sete dias. Depois é testada de novo e volta sozinha se
responder. O estado fica em `ingest_runs.details`, sem tabela nova.

### Execução real

Coletor real contra as APIs públicas, desta máquina, em 10/10/2026 — 33 requisições,
59 segundos. "Coletadas" são as chamadas com inscrição que encerra hoje ou depois;
"abertas" as que já estão recebendo inscrição.

| Âmbito    | UF  | Município               | Status     | Coletadas | Abertas | Observação                                     |
| --------- | --- | ----------------------- | ---------- | --------: | ------: | ---------------------------------------------- |
| federal   | BR  | —                       | `blocked`  |         0 |       0 | HTTP 403, desafio Cloudflare                   |
| estadual  | AP  | —                       | `ok`       |         0 |       0 | última chamada encerrou em 06/05/2026          |
| estadual  | CE  | —                       | `ok`       |        33 |      31 | não publica termos de área                     |
| estadual  | ES  | —                       | `ok`       |        11 |      10 |                                                |
| estadual  | GO  | —                       | `ok`       |         1 |       1 |                                                |
| estadual  | MA  | —                       | `degraded` |         0 |       0 | AC não reconhecida                             |
| estadual  | MT  | —                       | `degraded` |         0 |       0 | certificado expirado em 14/07/2026             |
| estadual  | PA  | —                       | `ok`       |         1 |       1 |                                                |
| estadual  | PB  | —                       | `ok`       |         0 |       0 | última chamada encerrou em 08/09/2026          |
| estadual  | PE  | —                       | `ok`       |        17 |      15 |                                                |
| estadual  | PI  | —                       | `ok`       |         0 |       0 | última chamada encerrou em 30/11/2024          |
| estadual  | SE  | —                       | `ok`       |         2 |       2 |                                                |
| estadual  | TO  | —                       | `degraded` |         0 |       0 | autoassinado e de outro endereço               |
| municipal | BA  | Camaçari                | `failed`   |         0 |       0 | conexão encerrada pelo servidor (`ECONNRESET`) |
| municipal | CE  | Chorozinho              | `ok`       |         0 |       0 |                                                |
| municipal | CE  | Iguatu                  | `failed`   |         0 |       0 | HTTP 404 "Acesso Negado"                       |
| municipal | CE  | São Gonçalo do Amarante | `ok`       |         0 |       0 |                                                |
| municipal | GO  | Anápolis                | `ok`       |         0 |       0 |                                                |
| municipal | GO  | Aparecida de Goiânia    | `ok`       |         1 |       1 |                                                |
| municipal | MG  | Belo Horizonte          | `blocked`  |         0 |       0 | HTTP 403 "Acesso Bloqueado"                    |
| municipal | MG  | Lagoa Santa             | `ok`       |         0 |       0 |                                                |
| municipal | MG  | Nova Lima               | `ok`       |         2 |       2 |                                                |
| municipal | MG  | Ribeirão das Neves      | `ok`       |         1 |       1 |                                                |
| municipal | MG  | Santa Luzia             | `ok`       |         0 |       0 |                                                |
| municipal | PA  | Parauapebas             | `ok`       |         1 |       1 |                                                |
| municipal | PB  | João Pessoa             | `ok`       |         1 |       1 |                                                |
| municipal | PE  | Petrolina               | `ok`       |         0 |       0 |                                                |
| municipal | PR  | Apucarana               | `ok`       |         0 |       0 |                                                |
| municipal | PR  | Campo Mourão            | `ok`       |         1 |       1 |                                                |
| municipal | PR  | Cianorte                | `ok`       |         2 |       2 |                                                |
| municipal | PR  | Londrina                | `degraded` |         0 |       0 | cadeia de certificados incompleta              |
| municipal | PR  | Maringá                 | `ok`       |         2 |       2 |                                                |
| municipal | PR  | Sarandi                 | `degraded` |         0 |       0 | cadeia de certificados incompleta              |
| municipal | PR  | Toledo                  | `failed`   |         0 |       0 | tempo de conexão esgotado                      |
| municipal | RJ  | Campos dos Goytacazes   | `ok`       |         0 |       0 |                                                |
| municipal | RN  | Natal                   | `ok`       |         3 |       3 |                                                |
| municipal | RS  | Bento Gonçalves         | `ok`       |         0 |       0 | HTTP sem TLS                                   |
| municipal | RS  | Gravataí                | `ok`       |         0 |       0 |                                                |
| municipal | SE  | Aracaju                 | `ok`       |         2 |       2 | HTTP sem TLS                                   |
| municipal | SP  | Campinas                | `ok`       |         0 |       0 |                                                |
| municipal | SP  | Mauá                    | `ok`       |         3 |       3 |                                                |
| municipal | SP  | Santo Anastácio         | `ok`       |         0 |       0 |                                                |
| municipal | SP  | Santo André             | `ok`       |         3 |       1 |                                                |
| municipal | SP  | São Bernardo do Campo   | `degraded` |         0 |       0 | cadeia de certificados incompleta              |

|                                | Antes (coletor antigo) |   Depois |
| ------------------------------ | ---------------------: | -------: |
| Chamadas no banco              |                     10 |       96 |
| Com inscrição aberta           |                      1 |       80 |
| Com inscrição futura           |                      0 |        5 |
| Instalações com "invalid JSON" |                      8 |        0 |
| Instalações que responderam    |                9 de 13 | 33 de 44 |

As duas medições foram feitas no mesmo dia, em banco temporário: primeiro o coletor
de `main`, depois a migração `0039` e o coletor novo sobre as mesmas dez linhas.

Londrina, Sarandi e São Bernardo do Campo enviam só o certificado folha, como o
Amapá. Dá para tratá-las do mesmo jeito (intermediário público versionado, por host),
mas isso pede conferir a cadeia de cada uma e não foi feito aqui.
