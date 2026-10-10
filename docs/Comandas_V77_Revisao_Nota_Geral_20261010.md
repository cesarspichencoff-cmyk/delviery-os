# Comandas V7.7 — revisão vinculada à nota geral, sem alterar o desenho

**Estado em 10/10/2026:** PR #38 DRAFT/HOLD. Etapa apenas de código e testes offline.

## Problema e reuso

A V7.6 já impede que a observação geral `DSOBSCOMANDA` de um evento do watcher V2 seja descartada silenciosamente. O componente V6.6 também bloqueia observações gerais cuja relevância por item não foi comprovada. A evidência histórica de 05/10 confirma exclusão de metadados sensíveis de pagamento/cancelamento **apenas para aquele pedido**, não para pedidos futuros.

Não foi criado classificador de texto de cliente, novo motor de embalagem ou novo renderer.

## Componente V7.7 adicionado ao reconciliador V6.8 existente

- `prepareOrderNoteReviewPacketV77` valida o hash do evento V2 e o fingerprint da decisão correspondente. Sem ambos, devolve `BLOCKED`.
- O pacote não contém texto de cliente nem ID do pedido: contém digest da chave, hash do snapshot, SHA-256 e tamanho UTF-8 da nota, origem `DSOBSCOMANDA` e status `REVIEW_REQUIRED`.
- `inspectOrderNoteDispositionClaimV77` aceita somente uma declaração estrutural que corresponda **ao pedido, ao hash do snapshot e à nota exata**, exigindo referência limitada de uma revisão. Não aceita reutilização entre pedidos, revisões ou textos, classificações conflitantes nem valores arbitrários.
- **Importante:** uma declaração correspondente recebe status `MATCHED_REVIEW_CLAIM_NOT_AUTHORIZED`. Não autentica a pessoa que a declarou, não prova a semântica da observação e **não concede autorização de prévia, comanda, impressão, serviço ou estado**.
- As regras já existentes V7.6 e V6.6 continuam bloqueando qualquer nota geral até que sua finalidade seja realmente comprovada e haja aceite operacional independente.
- As observações por item V2 permanecem vinculadas à revisão e identidade, sem omissão.

## Prova

[CI térmica #38088431170](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38088431170): **SUCCESS**.

- `STABLE_READER_SHADOW_PAIR_V68=41/41`: 14 cenários V7.7, além de 27 anteriores;
- `PASSIVE_READER_AUDIT_V69=21/21`;
- `READER_SHIFT_HUMAN_REVIEW_V70=29/29`;
- **`THERMAL_DESIGN_LOCK_V72=12/12; SVG_GOLDENS_MATCH`**: as três comandas continuam com o desenho e os hashes anteriores;
- `THERMAL_DIRECT_RENDERER_SEMANTIC_V71=12/12`.

## Limites

A nota geral do único pedido atual consultado permanece **UNKNOWN em relevância operacional**. Nenhuma nova leitura de pedidos foi executada nesta etapa. O contrato temporal do turno instalado continua pendente de ativação segura. O motor canônico e as classificações de praças, caixas e kits ainda exigem reconciliação para um pedido vivo.

**Próxima prova de maior valor:** obter, com a pessoa autorizada, uma decisão real sobre a observação da revisão exata; reconciliar o turno, as praças e as embalagens; executar o projetor V6.8 em SHADOW e comparar as vias com o Figma protegido. Aceite óptico Epson somente sob autorização específica.

**Não houve:** impressão, spooler, serviço Windows, banco SQL, merge, deploy, alteração de Figma, SVG, renderer ou motor nesta etapa.
