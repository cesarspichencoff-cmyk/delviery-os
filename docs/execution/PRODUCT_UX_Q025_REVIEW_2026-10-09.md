# Revisão Q-025 — composição visual na integração do DeliveryOS

Data: 2026-10-09

## Autorização
César aprovou a versão visual mais recente do Claude, incluindo a correção de contraste AA na barra inferior da Home. Integração somente na branch de testes. O DeliveryOS será operado exclusivamente no Itaim; não priorizar alternância entre unidades.

## Base e composição
- Base íntegra de integração: `cbfbc7b`.
- Branch isolada para homologação: `integration/deliveryos-q025-review-20261009`.
- Mudanças aplicadas a partir de Claude: `02b56c3`, `5dfdb4a`, `ba3aa4b`, `2b8bbf9`, `5862d9d`, `84a2b71`.
- Integrados: ocorrência na rua, moldura fiel à fonte, listas históricas limitadas, releitura sem apagar dados, contraste AA e guarda axe-core (12 auditorias).
- Preservados: correções Android da integração, teste de não vazamento de detalhes PostgreSQL, demais superfícies e fronteiras do Comanda.
- CI do Claude isolado anteriormente verde; integração composta exige CI próprio. Antes do CI, status CODE_COMPOSED_TEST_PENDING.

## Limites
Não houve merge na main, deploy, alteração da plataforma real, impressão, alteração no TATÁ Comanda ou autorização de mudança de janela da leitura. A Q-026 permanece aberta: 1,03 milhão de fatos simulados exigiram 23,7 s de HTTP e +1,19 GiB de memória; redesenho da porta depende de decisão de contrato que preserve viagens abertas e histórico necessário. Q-021/Q-023/Q-024 não foram resolvidas nesta revisão.