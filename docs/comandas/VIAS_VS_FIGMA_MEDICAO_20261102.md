# Três vias × Figma V4.4 / V4.3 — medição de 02/11/2026

**Escopo:** parte D do handoff de 02/11 na PR #135. Mede as três vias que a cadeia nativa produz
(duas de produção e a conferência) contra os mestres do Figma, e confere o conteúdo de cada via.
Nada foi impresso, instalado ou enviado a dispositivo.

## Atualização — renderizador V4.8 alinhado ao Figma (decisão do César, 02/11)

César escolheu alinhar a prévia ESC/POS aos mestres em vez de aprovar o modo texto. A cadeia passou a
usar `src/production/operationalTicketEscposFigmaV48.ts`: layout novo sobre a semântica da V4.6, que
fica intacta com suas travas históricas (V7.2 e outras). Cada motivo não-de-layout da V4.6 (prontidão,
caixa, quantidade, plano de nota, identidade das três vias, vetos global e de conferência) é herdado: a
via V4.8 só tem bytes quando a V4.6 teria. Medição refeita com o mesmo conteúdo dos mestres `30:3` e
`20:9`, portão `verificar_comandas_papel_virtual_escpos_v1_offline.cjs` (12/12).

| # | V4.6 | V4.8 medida | Mestre |
|---|---|---|---|
| D1 | divisor 48,05 mm | **72,07 mm** (48 colunas) | 72,0 mm |
| D2 | sem divisor entre caixas | **divisor depois de cada caixa** | idem |
| D3 | `Op.` em 22,5–40,5 mm | **54,05–72,07 mm**, termina na borda | coluna direita até 72 mm |
| D4 | `1 CAIXA \| 1 PRODUTO` | **removida** (redundante; sem decisão humana registrada) | não existe |
| D5 | `FINALIZAÇÃO: CONFERIR FICHA VALIDADA` fixa | **removida** (sem decisão humana; nunca impressa) | não existe na conferência |
| D6 | `TESTE - NAO PRODUZIR` | `SIMULAÇÃO · NÃO PRODUZIR` nas três vias | só na produção |
| D7 | `PRODUCAO SUSHI` 3,0 mm | **`SUSHI` 1×2 negrito, 6,01 mm** | 6,1 mm |
| D8 | `CONFERENCIA` fonte B | **`CONFERÊNCIA`** fonte A negrito | idem |
| D9 | `IFOOD 5487 \| TEKNISA 1234` | **`iFood #5487  \|  TEKNISA 1234  \|  19:45`** | texto idêntico |
| D10 | sem descritor | sem descritor | `· COMBINADO FECHADO` |
| D11 | observação regular | **negrito na produção**, regular na conferência | idem |
| D12 | `SACOLA: A DEFINIR` … | **`Sacola: a conferir  \|  Kit: a conferir`** / **`Acomp.: 1 Gari  \|  1 Tare`** | texto idêntico |
| D13 | TATÁ 2×2, 6,01 mm = altura do item | **3×3, 9,01 mm**, o maior elemento | caixa de 9,5 mm |

Ficam abertos: D6 (a faixa de simulação continua nas três vias enquanto a cadeia for sombra), D10
(descritor da caixa, sem dado provado nas vias), a coluna da quantidade (nome em 4,5 mm contra 8,5 mm no
mestre) e as formas das letras, que só uma folha Epson supervisionada confirma. A via COZINHA com caixa
própria segue sem quadro mestre equivalente (`UNKNOWN`).

Pedido real 9627 em V4.8 (com observações de teste e número 037 sintético): COZINHA 449 B / 64,6 mm;
DELIVERY SUSHI 1 768 B / 102,9 mm; CONFERÊNCIA 1.326 B / 138,9 mm. Sem número TATÁ atestado continuam
0 bytes, mas a prévia agora mostra iFood e Teknisa.
Pedido real 9092 em V4.8 (kits pela regra do César, número 012 sintético): DELIVERY SUSHI 1 344 B;
DELIVERY SUSHI 2 337 B; CONFERÊNCIA 640 B / 66,1 mm, com `Sacola: 1 G  |  1 Kit p/2  |  1 Kit Simples`.
Os quadros `30:3` e `20:9` foram relidos no Figma no fechamento: nós, posições e tamanhos idênticos aos medidos.

## Como foi medido

| | |
|---|---|
| Mestres | Figma `nEjHuoJg2dMOqOzyutxXZ4`, lidos em 02/11 pelo conector Figma (somente leitura). Produção V4.4: página `30:2`, quadros `30:3` (SUSHI + DEPENDÊNCIA) e `30:36` (COZINHA · ORIGEM). Conferência V4.3: página `20:2`, quadro `20:9`. Foi a primeira leitura direta do Figma: as rodadas V5.0–V7.2 registraram falha de acesso. |
| Escala | O Figma desenha em escala física: 302 px = 80 mm, área útil 272 px = 72 mm (1 px = 0,2646 mm). A Epson TM-T20 imprime 576 pontos = 72 mm a 203 dpi. As duas larguras úteis coincidem, então a comparação é feita em milímetros. |
| Vias TATÁ | Bytes ESC/POS **exatos** do renderer V4.6 (campo `escpos` da cadeia), interpretados por `tools/comandas_papel_virtual_escpos_v1_offline.cjs` na grade de pontos da TM-T20: fonte A 12×24, fonte B 9×17, multiplicadores `GS !`, alinhamento `ESC a`. Comando desconhecido é recusado. |
| Mesmo conteúdo | Para isolar o desenho do conteúdo, o texto de exemplo dos próprios mestres (`30:3`, `20:9`) passou pelo renderer V4.6 real. As diferenças desta comparação são só de desenho. |
| Pedido real | Revisão real 9627 (cabeçalho X, itens 4) pela cadeia inteira, com três observações de item de teste e número TATÁ **037 sintético** (não existe número real). |
| Portão | `tools/verificar_comandas_papel_virtual_escpos_v1_offline.cjs` (CI Linux e Windows) fixa cada fato medido abaixo. Mudar o renderer exige nova medição. |

Limites da medição: a geometria horizontal é exata na grade de células. O avanço vertical foi modelado
como `max(30 pontos, célula mais alta da linha)`, que é uma hipótese a confirmar em papel. As formas
das letras não são os bitmaps da Epson. A página de código CP1252 ainda é candidata (acentos não
testados em papel).

## Conteúdo por via — resultado

Portões na cadeia: testes 17, 19 e 20 de `verificar_comandas_cadeia_nativa_v1_offline.cjs` (22/22).

| Requisito | Resultado | Prova |
|---|---|---|
| iFood + Teknisa + TATÁ nas três vias | **OK**: `IFOOD 9627 \| TEKNISA 0000348850 \| 22:58` e o número no fim de cada via | teste 20; o número aparece só com vínculo `LIVE_ATTESTED` (teste 17) |
| Caixas | **OK**: C1–C6 contíguas na conferência; modelo vindo do motor fixado (750 ×3, 650 ×2, 240) | testes 4 e 20 |
| Campo do operador | **OK**: 6 `Op. ________` para 6 caixas, um por caixa | teste 20 |
| Observações intactas | **OK depois da correção `c9368b0e`**: cada nota de item aparece literal (maiúscula, regra V6.7) na via do próprio setor, uma vez por caixa do produto, e na conferência, nunca na outra via. A mesma nota em DSOBS* e TXPRODCOMVEN sai uma vez. | teste 19 |
| Vias de setor sem itens alheios | **OK**: cada produto está em exatamente uma via de setor, com a quantidade nativa inteira | teste 20 |
| Conferência com todos os produtos | **OK**: soma por produto = quantidade nativa | teste 20 |
| Sacola, kit e caixa | **OK**: `1 SACOLA G \| 3 KIT KIDS \| 1 KIT QUENTE`, saída do motor fixado | teste 4 |
| Comanda nativa e NF não substituídas | **OK por construção**: a candidata não tem processo filho, rede, cliente SQL nem emissor de spooler; o único arquivo que grava é o JSON de decisão do consumidor já fixado (texto, sem bytes ESC/POS). Nada no fechamento toca `IDIMPPEDPROD`, fila ou fiscal. | `verificar_comandas_candidata_homologacao_v1.cjs` 5/5 |
| Nota geral do pedido (`DSOBSCOMANDA`) | **HOLD intencional**: pode trazer texto de pagamento; V7.6/V7.7 exigem disposição humana por nota. Não é descartada nem impressa. | teste 19 |

### Defeito encontrado e corrigido nesta medição

Qualquer revisão real com observação de item parava em L3 com
`PRODUCTION_CUSTOMER_OBSERVATION_DIVERGENCE`, porque a cadeia entregava `ticket_items: []` ao plano de
impressão. Teste vermelho em `057bdd8a`, correção em `c9368b0e`: `nativeTicketItemsV1` monta as notas por
item a partir da mesma junção nativa, com a regra exata do ingresso V6.6. O 9627 sem notas continua com
as mesmas impressões digitais de texto (`3a85dbf2`, `e6e9613b`, `3658f76e`).

## Desenho — o que bate com o mestre

- Ordem das seções: identificação → caixas `Cn  CAIXA modelo` → item (quantidade + nome em uma linha) → observação sob o item → recursos (conferência) → número TATÁ no fim, alinhado à direita.
- Destaque do item: fonte A negrito com altura dupla, célula de **6,01 mm**, contra a caixa de texto de **6,1 mm** do mestre. A altura dupla sem largura dupla dá letra alta e estreita, próxima da condensada do Figma.
- Nenhuma linha passa de 72 mm; a mais larga (identificação do 9627) tem 58,6 mm.
- Uma rubrica `Op.` por caixa física e numeração C1..Cn na conferência.

## Desenho — diferenças medidas

Medidas na comparação de mesmo conteúdo (mestre `30:3` e `20:9` → renderer V4.6).

| # | Elemento | Mestre (Figma) | Via TATÁ (ESC/POS) | Peso |
|---|---|---|---|---|
| D1 | Divisor | largura útil inteira, 72,0 mm | 32 traços = **48,05 mm** (67%) | baixo |
| D2 | Divisor entre caixas na conferência | presente entre C1 e C2 | **ausente**; só antes dos recursos | médio: fronteira da caixa física menos visível |
| D3 | `Op. ________` | coluna direita, termina em 72 mm | na mesma linha, de **22,5 a 40,5 mm** | médio: a varredura das rubricas perde a coluna |
| D4 | `1 CAIXA \| 1 PRODUTO` | não existe no V4.3 | uma linha por caixa (+3,75 mm cada; +22,5 mm no 9627) | baixo |
| D5 | `FINALIZAÇÃO: CONFERIR FICHA VALIDADA` | não existe na conferência V4.3 | sempre presente no fim | baixo a médio: instrução fixa vira ruído |
| D6 | Faixa de teste | só na produção, `SIMULAÇÃO · NÃO PRODUZIR` | nas três vias, `TESTE - NAO PRODUZIR` | nenhum em sombra |
| D7 | Nome da praça | `SUSHI`, condensada, caixa de 6,1 mm | `PRODUCAO SUSHI`, fonte A simples, célula de **3,0 mm** | médio a alto: a praça reconhece a via de relance |
| D8 | Cabeçalho da conferência | `CONFERÊNCIA` | `CONFERENCIA`, fonte B (2,1 mm) | baixo |
| D9 | Identificação | `iFood #5487  \|  TEKNISA 1234  \|  19:45` | `IFOOD 5487 \| TEKNISA 1234 \| 19:45`; no real, Teknisa com zeros à esquerda (`0000348850`) | baixo; os zeros dependem de como a comanda nativa imprime (UNKNOWN) |
| D10 | Descritor da caixa | `· COMBINADO FECHADO`, `· ENROLADOS` | ausente | baixo a médio |
| D11 | Observação na produção | negrito | regular | médio: negação e alergia devem saltar à vista |
| D12 | Recursos | `Sacola: a conferir  \|  Kit: a conferir` / `Acomp.: 1 Gari  \|  1 Tare` | `SACOLA: A DEFINIR`, `KIT: A DEFINIR`, `ACOMP: 1 GARI \| 1 TARE` em linhas separadas; provado: `1 SACOLA G \| 3 KIT KIDS \| 1 KIT QUENTE` sem rótulo | baixo |
| D13 | Número TATÁ | o maior elemento da via (texto de 30 px, caixa de 9,5 mm) | 2×2 fonte A: célula de **6,01 mm**, a **mesma altura** do nome do item | médio: o contrato pede o TATÁ como identificador mais proeminente |

Caso sem mestre: a via da COZINHA do 9627 leva pratos quentes com caixa própria (`C1  CAIXA 650 /
1  EDAMAME`). O mestre só desenha a cozinha como dependência (`PRODUÇÃO SOLICITADA`, `ORIGEM: …`,
`[  ] PRODUZIDO`). Para esse caso, a paridade é **UNKNOWN**.

## Veredito

- **Conteúdo das três vias: comprovado** para a revisão real 9627, com as observações corrigidas.
- **Paridade visual com o Figma: não existe hoje.** São 13 diferenças medidas. O renderer V4.6 é uma
  adaptação em modo texto do mestre, não uma reprodução.
- **Nada foi alterado no desenho.** A trava V7.2 exige comparação com a origem, teste óptico e aceite
  humano para qualquer ajuste visual. As diferenças estão fixadas no portão para que nenhuma mude sem
  nova medição.

Decisão de design do César, antes de qualquer papel: alinhar o renderer ao mestre (D2, D3, D7, D11 e D13
são os de maior peso) ou aceitar o modo texto como adaptação física aprovada. Com qualquer das duas,
a confirmação final é uma folha impressa sob autorização.

## Capturas (fora do Git, publicadas para revisão)

SVGs e PNGs gerados pela medição; os PNGs do Figma vieram do conector (o proxy bloqueia download
direto de `figma.com`). Os SVGs são determinísticos; os PNGs dependem das fontes do Chromium local.

| Arquivo | SHA-256 |
|---|---|
| `figma_30-3_producao_sushi.png` (302×278) | `cb59d08c0d905052d89b8cacd99ce5df9635e330509dbd9ca02fcdc8390e68ce` |
| `figma_30-36_producao_cozinha.png` (302×233) | `30c7a3ee30cb5f6ef5d53fe9e59bcd52f4bf5477572329908ba0b199baeb1270` |
| `figma_20-9_conferencia.png` (302×280) | `18a87fcc4bc8de9261627ec3b1e053e0dd26b60246fdad9e4223c775ab250d1e` |
| `A_sushi_master_content.svg` | `63a6d9f6e7aebe5cc2b0e99d6cc385467d4bd35862b93ad575389eca835a8693` |
| `A_conferencia_master_content.svg` | `f6871c3021badf5e4397b5ca5bcfa446b605cdd4b29bc0df2a6b289aa7eda6df` |
| `B_9627_cozinha.svg` | `1953ae94a79108fabd0187b64a2b8e7968483e48a7a6f69033dae31f6978466f` |
| `B_9627_delivery_sushi_1.svg` | `0069666a7bb4037604b37bff46d2524883080b4a1ac2324f01fe494d20092b50` |
| `B_9627_conferencia.svg` | `27fdb27a3b475e8bf691ad23f27f6a866eea7f0f879c54034421798d08652f49` |

Bytes ESC/POS medidos (SHA-256 dos bytes exatos):

| Via | Bytes | Papel | SHA-256 |
|---|---|---|---|
| Mestre 30:3 → V4.6 | 417 | 63,1 mm | `603079eeacec07b1d81627a10fdc34851c80b17504b8863f7d3b3127556fb98b` |
| Mestre 20:9 → V4.6 | 516 | 78,1 mm | `f20af0c1a965940308d178d82b453178e0247c4528e9a84319d78f43cdf85235` |
| 9627 COZINHA (com notas, 037 sintético) | 362 | 59,3 mm | `d8a4c2bc5a0e113cfc2bd738fc5d2189ba7f67223a04deee375150f973a8c7a3` |
| 9627 DELIVERY SUSHI 1 | 625 | 97,6 mm | `e2d4d4bcf0d658b9dbd95b78b02f6668d7b67a7d0af33921f8044b710e9e6cbc` |
| 9627 CONFERÊNCIA | 954 | 139,6 mm | `46ed4565e6bc02a473a2827998915bbb84c05583cdb3d47b82bd81dd231bba0d` |
