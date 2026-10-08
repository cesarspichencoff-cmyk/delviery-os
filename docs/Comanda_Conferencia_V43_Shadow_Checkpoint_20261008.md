# Comanda de conferência V4.3 — checkpoint SHADOW (08/10/2026)

Estado: DESIGN_CANDIDATE + SHADOW_TEST_PASS local; NÃO IMPRESSO, NÃO DEPLOYADO, NÃO WORLD_PROVEN.

Master visual: https://www.figma.com/design/nEjHuoJg2dMOqOzyutxXZ4?node-id=20-2

Esta missão trata da CONFERÊNCIA DO DELIVERY. Não substituir o renderer de produção src/production/productionTicketEscPosV34.ts: ele monta tickets por praça e não a conferência final. A projeção src/production/productionTicketV2.ts já separa delivery check de produção, mas não é um ticket físico pronto.

Requisitos humanos preservados:
- Comanda térmica de 80 mm; área útil planejada 72 mm, calibração ESC/POS necessária;
- Produto completo em MAIÚSCULAS e UMA linha com quantidade dominante, sem truncamento;
- Observações imediatamente abaixo do próprio produto; C1/C2/C3 e caixa NUMÉRICA 240/450/650/750/1000/1500/1600;
- Campo Op. ______ POR caixa; nenhum campo geral de lacre ou envio;
- Sacola e kits compactos juntos quando couberem; kit por tipo e quantidade, nunca composição;
- Somente GARI, WASABI e TARE como acompanhantes, e SOMENTE se constarem explicitamente no pedido;
- Sequência TATÁ no canto inferior direito; cabeçalho discreto, iFood e TEKNISA presentes;
- Quente de cozinha separado de frio; combinado fechado não recebe extra na mesma caixa;
- Informação não provada permanece A CONFERIR, jamais tamanho inventado.

Auditoria Figma do catálogo de 199 produtos: 195 nomes cabem completos em uma linha sob as regras tipográficas do protótipo; quatro exigem rótulo operacional curto aprovado. Sem abreviação silenciosa. Ver página de exceções no Figma: https://www.figma.com/design/nEjHuoJg2dMOqOzyutxXZ4?node-id=27-3

Um contrato/validador SHADOW foi preparado e executado localmente: 10/10 testes passaram, cobrindo quantidade e observações, operador por caixa, fallback de item sem caixa, bloqueio de combinado fechado com extra, duas sacolas distintas, acompanhante explícito, kit não provado, revisão de pedido, proibição de apelido não aprovado e ausência de efeitos externos. Código experimental disponível no pacote de auditoria anexado à conversa (não integrado ao projeto).

PRÓXIMO PASSO SEGURO: implementar o contrato de conferência numa branch experimental com renderer de prova (ESC/POS ou raster de forma verificável) e cobertura adicional com pedidos reais anonimizados. NÃO PLUGAR NO SPOOLER. Medir na Epson real dimensões, acentos, cortes, 199 nomes, legibilidade, 1 linha por item e assinatura manuscrita por caixa.

MARCOS: DESIGN_READY ≠ ESC_POS_READY ≠ PHYSICAL_TEST_PASS ≠ WORLD_PROVEN ≠ HUMAN_ACCEPTED. Não declarar 10/10 sem prova física e aceite do César.