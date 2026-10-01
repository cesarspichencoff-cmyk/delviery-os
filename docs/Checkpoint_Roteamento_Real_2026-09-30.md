# Checkpoint — roteamento real Odhen/Teknisa — 2026-09-30

## Estado

Branch de trabalho: `fix/odhen-routing-config-proof-20260930`.

Nenhuma mudança foi promovida para produção. Nenhum print, write no Odhen/Teknisa, ação fiscal, instalação de watcher/serviço ou cutover foi habilitado.

## PROVEN

- Cadastro atual de 463 produtos possui rota de produção configurada para todos os produtos.
- `9.05.05.080.00 — COMB EXEC SUSHI SALMAO` roteia somente para `00009 BALCAOSUSHI1 → 192.168.0.142`.
- A amostra real exportada de Executivo não sustenta atribuição a `.153`; Composição Padrão/Local vazias e Grupo de Produto Promocional sem esse produto foram observados na investigação.
- `9.15.00.075.00 — COMBINADO SALMAO 1 PESSOA` roteia para duas impressoras:
  - `00009 BALCAOSUSHI1 → 192.168.0.142`
  - `00003 DELIVERY SUSHI 1 → 192.168.0.153`
- Export real `Manuteno-de-Venda---Itens 2.xlsx` contém `COMBINADO SALMAO 1 PESSOA ×1`, total R$ 109,00. SHA-256: `f10d2e85689861ce5e61f5f86151dd8b5dfc43f74ed98afe30dee2d4c629cfa0`.
- O resolver puro `projectExpectedRouting` foi executado fora da loja contra essa amostra/configuração relevante e retornou `.142 + .153`, `ready=true`, sem efeitos.
- A cadeia de código preparada foi simplificada para o menor contrato necessário:
  `Odhen raw → normalizeOdhenRouting → product CDPRODUTO → projectExpectedRouting → printer code/name/IP`.
- `normalizeOdhenRouting` não exige observações de cliente/pedido; para roteamento, lê somente `NRCOMANDA + CDPRODUTO + NMPRODUTO + QTPRODCOMVEN` e não retém payload bruto/PII.
- O resolver agora falha fechado para pedido vazio, quantidade inválida, índice de item duplicado, código de impressora duplicado, alvo de rota duplicado e mistura de configurações de lojas diferentes.
- A auditoria do cadastro confirma coerência entre uso real e flags: somente `00002/00003/00004/00006/00007/00009` aparecem nas 463 rotas e são exatamente as impressoras marcadas `used_by_products=true`.
- Harness preparado: `tools/projetar_odhen_routing_stdin_v1.js` recebe snapshot JSON por stdin e devolve apenas a projeção minimizada, sem persistir o bruto.
- O export real de Produtos por Loja traz os códigos em formato compacto de 10 caracteres. A normalização determinística `1-2-2-3-2` foi conferida contra os 463 produtos: **463/463 códigos casaram**, com 0 faltantes e 0 extras; 19 códigos alfanuméricos também casaram. O resolver aceita tanto `9150007500` quanto `9.15.00.075.00`. Evidência: `data/retail_product_code_format_proof_20260930.json`.

## NÃO PROVADO

- O XLS de Itens não expõe a identidade/número/hora da segunda venda; portanto a amostra comprova item real + roteamento configurado, não correlação temporal com um append físico específico de log.
- Roteamento esperado não prova que o papel saiu fisicamente.
- Ainda não foi executada leitura live de pedido real pelo endpoint/runtime Odhen nesta branch.
- Ainda não foi provado um vínculo live `pedido real lido diretamente → CDPRODUTO → projeção de impressoras` sem export manual.

## Próximo gate correto

`LIVE_READ_ONLY_ORDER_TO_EXPECTED_ROUTE`

Objetivo: em ambiente autorizado da loja, ler um snapshot minimizado e estritamente read-only de um pedido Odhen real contendo `NRCOMANDA + CDPRODUTO + NMPRODUTO + QTPRODCOMVEN`; passar diretamente por `normalizeOdhenRouting` e `projectExpectedRouting`; comparar a projeção com o cadastro atual. Observações de cliente não fazem parte deste gate.

A prova deve continuar separando:
- rota configurada esperada;
- ocorrência física real de impressão.

Até esse gate existir, nenhuma inferência por tamanho de arquivo IMP deve ser promovida a verdade de pedido.
