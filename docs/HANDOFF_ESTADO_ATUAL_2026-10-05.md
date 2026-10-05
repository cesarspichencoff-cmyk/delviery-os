# HANDOFF — Estado atual — 2026-10-05

## Fonte e continuidade

- VÉRTICE `vertice-active`: `e81b6d810e6a20e4a7e2f55ff9d1902b23dcf664`
- DeliveryOS branch: `fix/odhen-routing-config-proof-20260930`
- DeliveryOS HEAD ao escrever este handoff: `6f587d029953e931264db4203ae1bd0a0aa7717c`
- TATÁ OS / Unified Core branch: `feature/unified-tata-core-20261001`
- Unified Core HEAD: `9e6f46c8e19cc9485bc4bd028b845c7e52cdf95c`

Não reiniciar a investigação.

## Estado PROVEN do TATÁ Reader

### Identidade de produto

`TEKNISA.PRODUTO.CDARVPROD` foi provado como ponte direta para os produtos reais observados.

Catálogo local:
- 554 produtos;
- 554 `CDARVPROD` preenchidos;
- 554 valores distintos.

O catálogo local NÃO é equivalente ao routing Retail:
- routing atual: 463;
- overlap exato: 391;
- 72 códigos do routing não aparecem no conjunto local;
- 163 códigos locais não estão no routing.

Regra segura:
`CDARVPROD -> membership no routing atual -> rota`.
Sem membership: fail closed.

### Menor privilégio

Permissão real do serviço foi alterada com sucesso:

Antes:
`PRODUTO(CDPRODUTO,NMPRODUTO)`

Depois:
`PRODUTO(CDPRODUTO,CDARVPROD)`

Resultado:
`PERMISSION_SWAP_COMMITTED`.

O preflight v8 sob a identidade real:
`NT SERVICE\TataComandaReader`

provou:
- nenhuma role ampla;
- nenhuma permissão ampla;
- nenhuma procedure executável;
- nenhuma coluna extra;
- `safe_for_minimized_order_read=true`.

### Leitura real v2

Pedido real:
- `NRCOMANDA=0000348850`
- `NRCOMANDAEXT=9627`
- `NRVENDAREST=0000349281`
- `DLV_IFO`
- 4 itens.

Itens:
- `9800001000` ×3
- `9100008000` ×1
- `9100002000` ×1
- `9300009000` ×1

Leitura feita sob `NT SERVICE\TataComandaReader`, sem nome, observação, PII, escrita ou print.

### Shadow de rota real

Status:
`PROVEN_REAL_ORDER_SHADOW_ROUTE`

Rotas:
- `9.80.00.010.00 -> 00009 + 00003`
- `9.10.00.080.00 -> 00002`
- `9.10.00.020.00 -> 00002`
- `9.30.00.090.00 -> 00009 + 00003`

4/4 itens roteados, zero blockers.

Verificador independente:
`TATA_READER_SHADOW_ROUTE_SUCCESS_PASS`.

### Deduplicação

Duas passagens controladas do mesmo snapshot sob o serviço:

1. `NEW_SHADOW_ORDER_RECORDED`
2. `DUPLICATE_SHADOW_ORDER_NO_ACTION`

Mesma chave:
`7606EAAA23B6A80A2FDACE6E1825AA3EFD1E41589006B51437B7B414B58D92BE`

Status:
`PROVEN_REPLAY_DEDUPLICATION`.

Nenhum SQL, rede ou print foi disparado pelo teste de dedupe.

## Log passivo Odhen

Fonte física existe:
`C:\TEKNISA\odhen-perifericos\Log`

Arquivos `IMP` por impressora foram observados para os IPs atuais.

Mas:
- pedido shadow de 22:58 ocorreu após o último append observado do dia;
- cinco pedidos anteriores foram lidos apenas por IDs operacionais;
- IDs SQL/iFood não apareceram literalmente ou em janelas estruturais seguras;
- normalização somente-dígitos foi rejeitada por falso positivo.

Status:
`PASSIVE_SOURCE_EXISTS_IDENTITY_BRIDGE_UNPROVEN`.

Não usar o log como prova específica de impressão ou identidade.

## Unified Core — replay real

Os quatro códigos têm nomes factuais no histórico do Unified Core:
- `9800001000` — COMBINADO KIDS
- `9100008000` — EDAMAME
- `9100002000` — NASU NO MISSO
- `9300009000` — SUSHI DE UNAGUI

Porém NÃO fabricar um `tata.unified-order-decision.v1`.

Blockers reais persistidos em:
`data/tata_reader_unified_core_real_order_replay_readiness_20261005_v1.json`

Principais blockers:
1. `NRCOMANDAEXT=9627` ainda não provado como sequência iFood canônica;
2. regra da sequência TATÁ existe, mas não há estado/bindings persistidos;
3. serviço LUNCH/DINNER não pode ser inferido pelo relógio;
4. nomes históricos não são ainda fonte atual de rendering;
5. observações não foram lidas no reader v2;
6. full box grouping/packaging ainda não foi migrado para autoridade do Unified Core;
7. projeção real de conferência Delivery ainda não foi construída.

## Próxima ordem correta

1. Resolver uma fonte atual de nome de produto para rendering, sem torná-la identidade.
2. Fazer leitura minimizada das observações já permitidas, mantendo conteúdo sensível local.
3. Definir/persistir o estado real da sequência TATÁ diária.
4. Provar `NRCOMANDAEXT -> sequência iFood` ou obter o identificador canônico por outra fonte.
5. Migrar/consumir packaging/box grouping no Unified Core com parity tests.
6. Executar `REAL_ORDER -> tata.unified-order-decision.v1` sem placeholders.
7. Só depois gerar production print intent.
8. Impressão física continua separada de expected route e exige prova de mundo.

## Efeito atual

PROVEN:
- Reader real;
- identidade CDARVPROD para itens observados;
- menor privilégio;
- rota real em shadow;
- dedupe de replay.

NÃO PROVEN:
- decisão completa do Unified Core para pedido real;
- conteúdo final de comanda real;
- submissão de print;
- spooler;
- papel físico;
- fiscal/NFC-e nesta cadeia.

Nenhum print/cutover foi executado por esta frente.
