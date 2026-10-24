# DeliveryOS V8.55 — cruzamento mínimo, A DEFINIR, sem mudar a loja
**20/10/2026 · PR #107 · revisão/offline · DRAFT/HOLD**

## O que já sabemos — sem novo acesso ao computador
- César confirmou que, no turno de hoje, **as comandas impressas vieram do Gestor iFood**; algumas notas fiscais foram emitidas/impressas pela **Teknisa**. É observação operacional humana, não log per-order autenticado.
- Código e evidência arquivada mostram que, nos pedidos com origem `DLV_IFO`, `NRCOMANDAEXT` corresponde ao **ID curto iFood** (exemplo histórico 9627). Os identificadores nativos `NRCOMANDA` e `NRVENDAREST` vinculam a venda interna a sua observação fiscal (exemplo histórico 8332). Identificador curto **não é UUID completo**, nem prova de origem do papel.
- Impressão de pedido no iFood e NFC-e na Teknisa são **trilhas diferentes**. Uma NFC-e não comprova que a comanda da cozinha foi produzida, e a ausência de NF na amostra não justifica deixar de exibir o pedido.
- Fonte oficial: https://blog-parceiros.ifood.com.br/impressora-para-ifood/ — explica distinção entre impressão térmica não fiscal do Gestor e emissão fiscal.

## Redução para concluir o essencial
O percurso de comparação no código puro `tools/comandas_cruzamento_simples_v855_offline.cjs` é:

`comanda iFood observada (loja + dia + ID curto + itens/quantidades/observações)`
→ `registro nativo Teknisa DLV_IFO (mesma loja/dia/ID curto + itens e quantidades)`
→ **um único candidato**, preservando `NRCOMANDA` e `NRVENDAREST`
→ `NFC-e nativa` **opcional**, vinculada por ambos os identificadores internos.

A saída `CANDIDATE_REVIEW` é **candidata**, nunca identidade UUID comprovada, prova de papel ou autorização de impressão. Dois pedidos com o mesmo ID curto na mesma loja/dia bloqueiam o cruzamento. Cancelamento, item ou quantidade divergente, observação comprovadamente contraditória e itens incompletos também bloqueiam. Ausência de registro numa captura é **não observado**, e não pedido perdido.

A **nota fiscal ausente**, o kit/sacola/caixa não comprovados ou as observações nativas com cobertura incompleta **não invalidam os itens reais capturados do iFood**: o campo correspondente fica **A DEFINIR** para conferência posterior. Jamais inventar caixa/quantidade, apagar `SEM`/alergia ou transformar campo desconhecido em zero. O arquivo fiscal é somente leitura; não emitir, cancelar, reimprimir ou alterar NF.

O renderer já existente `operationalTicketEscposV46.ts` passou a usar `CAIXA: A DEFINIR`, `SACOLA: A DEFINIR`, `KIT: A DEFINIR` **somente quando há evidência explícita de pendência**. Um pedido comprovadamente sem kit não recebe um kit inventado. O arquivo continua **TESTE - NAO PRODUZIR**, e com dados essenciais incompletos continua sem bytes aprovados de impressão. Nenhuma trava de identidade, conteúdo obrigatório, serviço, idempotência ou impressão física foi removida.

## O que falta de verdade
1. **Fonte viva autorizada e com revisão identificada:** capturar de forma legítima a mesma composição real de iFood/Teknisa. O cruzamento atual recebe observações fornecidas; não lê o Gestor nem o banco da Teknisa. Se não há UUID completo, a identidade final permanece a conferir.
2. **Saída física numa janela autorizada:** provar o destino, a leitura na Epson e a ausência de comanda duplicada, respeitando a impressão do Gestor que já está ativa.
3. **Integração/instalação separada:** somente após provas e autorização, sem mexer em emissão fiscal. Não usar esta prova offline para corte automático.

Testes: `tools/verificar_comandas_cruzamento_simples_v855_offline.cjs` e regressão existente `tools/verificar_operational_escpos_v46.js` em CI Linux/Windows. Sem custos, nenhum novo serviço, chave, aprovação diária ou arquitetura paralela.
