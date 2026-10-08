# Retenção de logs do Nginx

Atualizado em 8 de outubro de 2026.

## Política

Os logs de acesso e erro dos proxies Nginx são enviados somente para `stdout`/`stderr`. Os serviços `proxy` do servidor MacBook e da borda Oracle usam o driver Docker `local`, com `max-size: 10m` e `max-file: 18`. Não devem existir cópias ou exportações desses logs com mais de **180 dias**; esse é o limite máximo da política, correspondente ao Art. 15 do Marco Civil da Internet.

O limite por tamanho/arquivo impede crescimento indefinido e normalmente elimina dados antes do limite de 180 dias. O owner deve verificar semestralmente que nenhum coletor externo, backup ou configuração global do Docker prolonga a guarda. Se logs forem enviados futuramente a um agregador, o TTL de 180 dias deve ser configurado antes de habilitar o envio.

## Minimização

- **Borda Oracle:** registra data, status, método, rota sem query string, tempo e IP do cliente. O IP é mantido somente aqui para segurança e guarda legal; não há corpo, cookie, token, query string, nome ou e-mail.
- **Proxy interno (MacBook):** usa o IP completo apenas em memória para rate limit e encaminhamento. O log persiste somente a rede IPv4 `/24`, o rótulo `ipv6/64` ou `masked`, evitando duplicar o IP completo já guardado na borda.
- **API:** o serializer HTTP grava apenas request id, método, caminho sem query string e status. Cookies, autorização, e-mail e IP são mascarados na configuração central do logger.

## Verificação operacional

```sh
docker inspect licita-macbook-proxy-1 --format '{{json .HostConfig.LogConfig}}'
docker inspect abriu-oracle-edge-proxy-1 --format '{{json .HostConfig.LogConfig}}'
docker logs --since 10m licita-macbook-proxy-1 | tail -n 20
```

O primeiro e o segundo comando devem mostrar `local`, `max-size=10m` e `max-file=18`. No proxy interno, a saída deve conter `client_network`, nunca `client_ip`.
