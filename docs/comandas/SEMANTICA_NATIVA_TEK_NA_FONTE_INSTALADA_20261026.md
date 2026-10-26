# TATÁ Comandas — semântica nativa comprovada no código local (26/10/2026)

**Escopo:** leitura passiva de arquivos PHP presentes em `CAIXA_MOOCA`, cruzada com 350 revisões/177 chaves do Reader e evidências de 05–26/10. **Fonte instalada ≠ prova de execução desse caminho para todos os pedidos.** REVIEW_ONLY / DRAFT / HOLD. Nenhum banco, serviço, impressora, sequência, spooler, arquivo produtivo ou fiscal foi alterado.

## Proveniência local, sem publicar código proprietário ou pedidos

Raiz examinada: `C:\TEKNISA\odhenPOS\backend_74000\vendor\odhen\api\src`.

| Arquivo | SHA-256 capturado em leitura | Pontos verificáveis |
|---|---|---|
| `Service/Comanda.php` | `130E6BF073F1FAD0F7C2A04A4CA86585350C440E2C2FC1C878B7F0EDE33EAD36` | mapa `const status` (linha 27), `getTheThing` (343), `trataSTComanda` (~990), `abreComanda` (~1001), `cancelaPedido` (~1071), `mudarStatusComanda` (1905), `liberaComandaDelivery` (1916) |
| `Service/Venda.php` | `D5376156D3364A14F66ACCBC65EBAF3AA0F225C47199010CAFA2113DAC1D4B63` | após sucesso da venda, chama `liberaComandaDelivery`; somente **depois** consulta `IMPRIMEDLV_AUTOMATICO` e pode chamar `imprimeDelivery` (~475–493) |
| `Util/MSDEQuery.php` | `0F578882EDB25A67941452AE41CE53E62C5A624AAB651AD9325B43FAF045E115` | `CANCELA_COMANDAVEN` define `IDSTCOMANDA='4'` e `IDCOMANDAPAGA='N'` (~1180); `CHANGE_STATUS_COMANDA` atualiza status (~4643); `GET_RETIRA_BALCAO` lê configuração de liberação |

## Estado do cabeçalho (`COMANDAVEN.IDSTCOMANDA`)

- `A`: `trataSTComanda()` atribui quando `isScheduled` é verdadeiro; portanto **não é condição universal de comanda iFood normal**.
- `1`: atribuído ao pedido não agendado se `IDCONTROPROD='S'`; no mapa da classe, rótulo *Em Aberto*.
- `3`: atribuído ao pedido não agendado que não atende à condição anterior; rótulo *Pago* no mapa da classe. Isso descreve essa rotina, não toda variante de integração.
- `P`: rótulo *Impresso* no mapa da classe, mas `liberaComandaDelivery` pode atribuí-lo **antes** de `imprimeDelivery` e mesmo quando `IDIMPAUTENTREG` não é `S`. **P não é recibo de impressão nem papel físico.**
- `X`: `liberaComandaDelivery` atribui quando `IDRETBALLOJA='S'` **ou** `IDFINPEDAUTDLV='S'`; comentário no código descreve dispensa de etapa de controle de entrega para retirada no balcão. **X não é sinônimo automático de cancelamento**. O mapa `const status` examinado nem define rótulo `X`; outras rotas de mutação são possíveis.
- `4`: `CANCELA_COMANDAVEN` atribui diretamente no caminho explícito de cancelamento e retira a indicação de paga. Consequentemente **não autorizar impressão com `4`**; não inferir que toda remoção do SQL atual se deu por esse caminho.
- `2`, `5`, `6` e `O` aparecem como rótulos no mapa da classe; não foram comprovados como transições dos pedidos da amostra.

## Estado do ITEM é outro campo (`ITCOMANDAVEN.IDSTPRCOMVEN`)

`Comanda::getTheThing()` retorna **`1`** quando `IDCONTROPROD='S'` e a consulta de setor retorna valor não nulo; caso contrário, retorna **`4`**. Assim, `IDSTPRCOMVEN=4` pode existir já na inserção legítima. **Não confundir com `IDSTCOMANDA=4`** nem com item cancelado. O contrato da candidata que exige `IDSTPRCOMVEN='A'` para todos os itens não corresponde a esses caminhos observados.

## Cruzamento com observações anteriores

- Amostra de 26/10: 350 revisões, 177 chaves, padrões `3→P` (105), `3→X` (19), `3→X→P` (16), `X→P` (13) e `3→P→4` (2). A rotina de liberação explica possibilidades `3→P` e `3→X`, mas **não prova causalidade** nem explica, sozinha, `X→P`.
- Auditoria de 05/10 (12 pedidos): dois em `3` sem NFC-e; dez em `X` com NFC-e autorizada. `VENDA.IDSTATUSNFCE='A'` é **campo diferente** de `COMANDAVEN.IDSTCOMANDA='A'`.
- Os 331 pedidos no arquivo histórico e 326 na consulta atual de 25/10 pertencem a tempos de observação distintos; nenhuma inferência de exclusão ou cancelamento deriva dessa diferença.
- Classificação histórica: 14 códigos desconhecidos, 0 promovações autorizadas; Cookie Pistache `8.20.11.002.00` sem rota. Dois destinos na tabela não provam escolha por LUNCH/DINNER ou impressora fisicamente ativa.
- Sequência TATÁ ainda sem bindings observados, sem prova de três vias em papel.

## Implicação técnica imediata

**Falha identificada:** o watcher candidato V1 de horário nativo e o projetor de essenciais V8.57 usam `A` como filtro positivo de status do pedido **e do item**. Os testes anteriores com `A` comprovam apenas um cenário sintético — não elegibilidade da população real.

**Correção de segurança na candidata de timestamp:** não privilegiar `A` como liberação. Todos os estados, inclusive `A`, permanecem em `NATIVE_*_STATUS_NOT_ATTESTED` até existir um contrato de evento/revisão aprovado e independente. Isso **não é a regra definitiva de negócio**; é a restrição provisória que impede falseamento de prontidão. A PR continua sem deploy.

## Portões ainda materiais

1. Determinar qual evento inicial/revisão deve emitir via de produção (não uma tradução de estado final); cancelamento, revisão, pedido agendado, reimpressão e `X→P` devem ter casos positivos/negativos com origem independente.
2. Comprovar versão executada e chamada real do caminho Odhen para a unidade, `IDCONTROPROD` e `IDFINPEDAUTDLV` vigentes, sem importar semântica de outra versão ou loja.
3. Confirmar catálogo/praças/destinos físicos vigentes, composição e observações de mesma revisão, sequência TATÁ persistida e proteção antirreimpressão.
4. Só depois propor instalação reversível, janela aprovada e papel Epson supervisionado. **NÃO executar efeito no caixa com base neste documento.**

**Resultado:** semântica parcial **SOURCE_CODE_OBSERVED**, elegibilidade de impressão **NOT_PROVEN**; `P` não prova papel; `X` não equivale a cancelamento; `4` de item e `4` de comanda são campos diferentes. Produção continua HOLD.
