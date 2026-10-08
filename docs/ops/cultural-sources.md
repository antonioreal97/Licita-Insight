# Fontes culturais: TLS, ritmo e desbloqueio

Diagnóstico executado em **08/10/2026**, a partir da máquina de desenvolvimento,
com o comando abaixo para cada host:

```sh
openssl s_client -connect <host>:443 -servername <host> -showcerts
```

Nenhuma fonte usa desativação global da validação TLS. A coleta envia
`Accept: application/json` e o identificador honesto
`PardalDigital/0.1 (+https://pardaldigital.com; contato@pardaldigital.com)`.

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

- `CULTURE_PAGE_DELAY_MS=500`: intervalo mínimo entre requisições;
- `CULTURE_HTTP_MAX_RETRIES=2`: tentativas adicionais para 429 e 5xx;
- `CULTURE_RETRY_BASE_MS=1000`: backoff exponencial quando não há `Retry-After`;
- `Retry-After` em segundos ou data HTTP prevalece sobre o backoff local;
- HTTP 403 não é repetido em sequência: a fonte é marcada `blocked`.

## Liberação do Mapa da Cultura

O canal oficial publicado pelo Ministério da Cultura é
`suporte.mapa@cultura.gov.br`:
<https://www.gov.br/cultura/pt-br/acesso-a-informacao/perguntas-frequentes/mapas-culturais>.
O pedido deve informar o User-Agent acima, IP de saída do ambiente de produção,
rota `/api/opportunity/find`, volume baixo e finalidade de reutilização pública.

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
