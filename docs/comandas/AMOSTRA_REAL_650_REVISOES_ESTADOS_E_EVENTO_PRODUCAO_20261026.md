# TATÁ Comandas — recorte passivo de estados nativos e limite de emissão (26/10/2026)

**Estado:** REVIEW_ONLY / DRAFT / HOLD. Fonte operacional: `CAIXA_MOOCA`, pastas `C:\ProgramData\TataComandaReader\state\reader-events-v1`, somente leitura. Nenhuma exportação de chave, UUID, produto, cliente, observação, hash individual ou texto de comanda; não houve SQL, modificação de arquivo, serviço, spooler ou impressão.

## Recorte observado e método

Foi examinado um lote limitado dos **650 arquivos JSON mais recentes por `LastWriteTimeUtc`** do Reader (de um total observado de 9.650 arquivos), parseando apenas atributos estruturais em memória local. O `DTHRABERMESA` informa a data operacional do pedido; `observed_at` fornece o instante de observação registrado pelo Reader. As contagens abaixo **são revisões de snapshots, não pedidos únicos**.

| Data original do pedido | Revisões no lote |
| --- | ---: |
| 25/10/2026 | 240 |
| 26/10/2026 | 410 |
| **Total** | **650** |

| Estado do cabeçalho `IDSTCOMANDA` | Revisões |
| --- | ---: |
| `3` | 263 |
| `P` | 289 |
| `X` | 94 |
| `4` | 4 |
| `A` | 0 |

Entre **1.901 aparições de linhas de itens ao longo das revisões**: `IDSTPRCOMVEN=4`: 1.876; `6`: 17; `3`: 8; `A`: 0. **Aparições de linha não são produtos distintos.** Em cinco revisões havia ao menos um item `6` (quatro com cabeçalho `4`, uma com `3`).

Outros agregados: 327 chaves compostas distintas no recorte; 284 com ao menos uma mudança observada de estado. Repetições de hash de snapshot contabilizadas na amostra: 0. Pares consecutivos com status conflitante e mesmo instante de observação: 0.

Os eventos foram agrupados pela chave composta **apenas em memória**, ordenados pelo instante UTC de `observed_at` e por hash somente para desempate, deduplicando mesmo hash na análise. Resultado agregado:

| Transição observada | Ocorrências |
| --- | ---: |
| `3 → P` | 190 |
| `3 → X` | 66 |
| `X → P` | 61 |
| `P → 4` | 4 |

**Fronteira temporal:** o lote contém os 650 arquivos mais recentes, não o histórico completo de cada pedido. A ordem dos timestamps do Reader não é uma trilha auditável de mutações da origem Teknisa. `X → P` tem evidência de mudança observada; sua causa operacional **permanece UNKNOWN**. Não comprova que uma comanda saiu em papel, que houve entrega, retrabalho ou reimpressão.

## Interpretação fundamentada no código de produção presente no computador

- `Service/Comanda.php`, SHA-256 `130E6BF073F1FAD0F7C2A04A4CA86585350C440E2C2FC1C878B7F0EDE33EAD36`: `trataSTComanda` atribui `A` para agendado e `1/3` conforme controle de produção; `liberaComandaDelivery` atribui `P` ou `X` segundo retirada/configuração; caminho de cancelamento atribui cabeçalho `4` por SQL. Esses trechos **não provam cada caminho efetivamente executado na amostra**.
- `Service/Venda.php`, SHA-256 `D5376156D3364A14F66ACCBC65EBAF3AA0F225C47199010CAFA2113DAC1D4B63`: `ITEM_CANCELADO='6'` (linha 91). No mapeamento de itens para venda, `IDSTPRCOMVEN='6'` resulta em `IDSITUITEM='6'`. A chamada `liberaComandaDelivery` antecede a tentativa condicional `imprimeDelivery`: `P` não é recibo de papel.
- `Util/MSDEQuery.php`, SHA-256 `0F578882EDB25A67941452AE41CE53E62C5A624AAB651AD9325B43FAF045E115`: `BUSCA_ITPEDIDO_ENTREGA` filtra itens de estado `6`. Cabeçalho `4` e item `4` são campos distintos e não podem compartilhar significado.
- Fonte histórica de roteamento/identidade continua com hashes locais idênticos aos de 05–06/10; não inferir atualização automática de 14 códigos `CLASSIFICATION_UNKNOWN`. Estado da sequência TATÁ lido sem escrita: `bindings=0`, `next_value=1`. O serviço `TataComandaReader` estava Running nesta inspeção.

## Implicações obrigatórias para o sistema

1. **Nunca** usar `IDSTCOMANDA='A'`, `'3'`, `'P'` ou `'X'` como autorização suficiente para produzir, emitir, reimprimir ou concluir: a semântica da abertura/agendamento/liberação difere do evento de produção.
2. O estado `4` do cabeçalho é bloqueio crítico e não autoriza impressão; o estado `4` **de item não equivale** automaticamente a cancelamento. Itens `6` correspondem à constante nativa de cancelamento no caminho lido, mas ainda exigem confirmação por identidade/revisão para determinar tratamento.
3. Antes de emitir primeira via, falta um evento-fonte de produção **identificado e atestado de modo independente**, com revisão exata, evento anterior/posterior, itens, observações, estado de cancelamento, integridade e ausência de duplicação. A inferência por `P` ou por horário está proibida.
4. Distinguir pelo menos: `FIRST_PRODUCTION`, `REVISED_ITEMS`, `CANCELLATION`, `REPRINT_REQUEST`, `UNKNOWN`, **mas não inventar esses tipos quando a origem real não os atesta**. Registros de estado só dão visibilidade, nunca autoridade do evento.
5. A candidata V8.57 usa fixtures sintéticas com `A`; os novos testes na PR #127 asseguram que os estados `3/P/X/4` e itens `3/4/6` não herdem elegibilidade da fixture mesmo com hashes de snapshot/fingerprint recalculados; o resultado permanece HOLD/no print.
6. O próximo ganho técnico não é afrouxar estado: provar a chamada efetiva do gerador nativo de via de produção e a identidade do mesmo pedido/revisão, depois comprovar sequência, roteamento, exclusividade do emissor e papel. Até lá `PRINT_ELIGIBILITY=UNKNOWN`, `WORLD_PROVEN=NO`.

## Critério adversarial de conclusão

Dados de 650 snapshots + semântica parcial do código ≠ prova da intenção de produção, da execução do fluxo real de impressão, da origem Gestor iFood ou de efeito físico. **DRAFT/HOLD; ZERO alteração no caixa.** Nenhum novo status foi promovido e nenhuma sequência atribuída.

## Segunda amostra independente: decisões, sem duplicar os pedidos

Outro recorte passivo de **500 arquivos mais recentes por `LastWriteTimeUtc`** em `state/reader-shadow-decisions-v1` foi analisado exclusivamente em memória local, sem exportar chave, nome, produto, nota ou identificador:

- **250 chaves compostas distintas**; análise adicional considera somente o arquivo mais recente **dentro da amostra** para cada chave.
- **56/250** tinham apenas a família de bloqueios de serviço/turno (`UPSTREAM_SERVICE_STATE_*` e `SERVICE_REQUIRED_*`). Isso **não** significa prontidão real caso o bloqueio de turno desapareça: prova de item, origem, sequência, impressora e evento segue independente.
- **194/250** tinham ao menos um bloqueio adicional fora da família turno/serviço.
- Contagens sobre as 250 revisões selecionadas por chave: `BAG_*=141`, `KITS_*=107`, `CLASSIFICATION_UNKNOWN_*=67`, `ROUTE_NOT_FOUND*=1`. **Famílias se sobrepõem e não são proporções do universo**.
- Nenhuma decisão dessa análise foi promovida a READY nem foi alterado o sistema.

**Prioridade:** turno obsoleto é uma causa universal no lote de 500 decisões, mas não a única; depois de removê-lo em código de revisão, a maioria das chaves ainda precisa de outra prova. Sanar em paralelo identidade/classificação, embalagens com motor aprovado e roteamento de praça; não reintroduzir assinatura diária ou horário fictício, e não tratar `A` como estado universal de pedido ou item.
