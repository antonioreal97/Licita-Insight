# Municípios e coordenadas do IBGE

O arquivo `artifacts/api-server/src/service-region/ibge-municipalities.json` contém os 5.570 municípios da Divisão Territorial Brasileira de 2022. Cada registro preserva o código IBGE de sete dígitos, nome, UF e as coordenadas do ponto de referência da sede municipal, arredondadas para quatro casas decimais (aproximadamente 11 m no equador).

Fonte: **IBGE, Censo Demográfico 2022 — Localidades do Brasil**, arquivo oficial `Localidades_Brasil_gpkg.zip`, camada `BR_localidades_2022`, categorias `Cidade`/`Sede Municipal` (capitais têm a mesma coordenada nas duas classificações). Download público: <https://geoftp.ibge.gov.br/organizacao_do_territorio/estrutura_territorial/localidades/Localidades_do_Brasil/2022/Localidades_Brasil_gpkg.zip>. A documentação oficial descreve `CD_MUN`, `NM_MUN`, `SIGLA_UF`, `LAT_LOCALIDADE` e `LONG_LOCALIDADE`: <https://www.ibge.gov.br/geociencias/organizacao-do-territorio/estrutura-territorial/27385-localidades.html>.

Licença/uso: dados públicos do IBGE, reproduzidos com atribuição ao instituto e sujeitos ao Termo de Uso do Portal do IBGE: <https://www.ibge.gov.br/acesso-informacao/acoes-e-programas/politica-de-privacidade.html>. O Pardal mantém somente atributos geográficos públicos, sem dados pessoais.

O dataset é embarcado no bundle da API. Busca, cálculo de raio e recomendações não fazem chamadas externas em tempo de execução.
