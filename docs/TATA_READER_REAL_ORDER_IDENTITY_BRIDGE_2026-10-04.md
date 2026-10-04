# TATÁ Reader — ponte de identidade do pedido real — 2026-10-04

## Objetivo

Continuar a cadeia já provada do TATÁ Reader até o roteamento atual sem promover uma equivalência de produto que ainda não foi provada.

## Fontes revalidadas

- DeliveryOS: `fix/odhen-routing-config-proof-20260930`
- TATÁ OS / Unified Core: `feature/unified-tata-core-20261001`
- pedido real: `data/tata_reader_real_read_success_20261003_v1.json`
- roteamento atual: `data/odhen_product_routing_compact_v1.json`
- mapa de impressoras: `data/runtime_printer_map_v1.json`
- catálogo histórico usado apenas como ponte candidata: `packages/unified-restaurant-core/data/historical_sales_backfill_jan_aug_2026.json`

## Descoberta material

O `CDPRODUTO` lido diretamente do SQL e o código usado pelo cadastro Retail/roteamento não estão no mesmo namespace.

Pedido real observado:

- `0000001459` — `COMB SUSHI + SASHIMI ESPECIAL 2 P`
- `0000001641` — `TEMAKI DE BARRIGA DE SALMAO `

Aplicar a normalização Retail de 10 caracteres diretamente nesses dois IDs produz códigos inexistentes no snapshot atual. Portanto o antigo pressuposto `SQL CDPRODUTO == Retail Código` está bloqueado.

## Replay candidato, sem efeito

Foi feito um replay conservador usando somente nome de produto após `trim`, contra o snapshot histórico factual de 210 produtos no Unified Core.

Para os dois itens houve exatamente um match nesse snapshot:

| SQL CDPRODUTO | Nome normalizado | Código Retail candidato | Rota atual configurada |
| --- | --- | --- | --- |
| `0000001459` | COMB SUSHI + SASHIMI ESPECIAL 2 P | `9.15.00.030.00` | `00009 BALCAOSUSHI1` + `00003 DELIVERY SUSHI 1` |
| `0000001641` | TEMAKI DE BARRIGA DE SALMAO | `9.60.00.010.00` | `00006 BALCAOSUSHI2` + `00004 DELIVERY SUSHI 2` |

Isso prova que existe uma ponte candidata coerente entre o pedido real, o catálogo histórico e o roteamento atual.

Isso **não** prova que `0000001459 == 9.15.00.030.00` nem que `0000001641 == 9.60.00.010.00` como identidade canônica.

## Regra de segurança

A ponte por nome:

- pode ser usada para replay analítico zero-effect;
- não pode ser usada como identidade de runtime;
- não pode autorizar impressão;
- não pode autorizar estoque/CMV;
- não pode virar regra canônica;
- deve bloquear se o match não for único.

Também permanece UNKNOWN se o nome é único nos 463 produtos completos do Retail. A unicidade provada nesta etapa vale apenas para o snapshot histórico de 210 produtos.

## Prova automatizada

`tools/verificar_tata_reader_identity_bridge_candidate_v1.js` verifica:

- vínculo com o pedido real já provado;
- normalização de nome apenas por `trim`;
- existência dos códigos candidatos no roteamento atual;
- correspondência exata dos destinos configurados;
- correspondência com o mapa atual de impressoras;
- permanência explícita de `runtime_authority=false`;
- todos os efeitos em `false`.

Evidência persistida:

`data/tata_reader_real_order_identity_bridge_candidate_20261004_v1.json`.

## Investigação preparada para o próximo gate

Documentação pública da própria Teknisa diferencia três campos relevantes:

- `CDPRODUTO`: código interno do produto;
- `CDPROINTE`: código externo do produto;
- `CDARVPROD`: código do produto no sistema Teknisa.

Isso é apenas uma pista de nomenclatura externa; ainda não prova que o schema local do POS possui esses campos nem que algum deles corresponde ao código Retail usado pelo TATÁ.

Foi preparado `tools/tata_reader_product_identity_metadata_probe_readonly.ps1`.

O probe lê somente metadados `sys.objects/sys.schemas/sys.columns`, procura superfícies visíveis contendo `CDPRODUTO` junto de `CDPROINTE`, `CDARVPROD` ou `CDPRODESTO`, e não lê nenhuma linha operacional.

Gate estático:
`tools/verificar_tata_reader_product_identity_metadata_probe_static_v1.js`.

## Próximo gate

`PROVE_CANONICAL_SQL_INTERNAL_PRODUCT_ID_TO_RETAIL_PRODUCT_CODE_CROSSWALK`

A próxima prova deve encontrar no Teknisa uma relação determinística entre o identificador interno de `TEKNISA.PRODUTO` e o código Retail de produto.

Preferência:

1. coluna/tabela/view oficial já existente;
2. transformação oficial já usada pelo Retail;
3. somente se isso não existir, tabela de crosswalk explícita e versionada.

Nome de produto não é aceito como autoridade de identidade de runtime.

## Effect boundary

Nenhuma escrita no banco, Odhen, impressora, spooler, fiscal/SEFAZ ou produção foi executada nesta etapa.
