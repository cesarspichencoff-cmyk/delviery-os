# V5.9 — Integridade das quantidades nas comandas offline

**Data:** 08/10/2026. **Escopo:** branch de validação do DeliveryOS, PR #21. **Efeitos operacionais:** nenhum. **Issue:** #24.

## Problema reproduzido antes da correção

Uma comanda de referência `CONFERENCIA` era clonada apenas em memória, e valores inválidos eram atribuídos à quantidade de um produto, de uma sacola, de um kit ou de um acompanhamento antes da renderização. O renderer antigo aprovava a prévia ESC/POS sem bloqueios com quantidades como `0`, `-2`, `1.5`, `NaN`, `Infinity` e strings. A impressão operacional sempre esteve desabilitada nesse renderer; nenhum pedido real ou impressão foi afetado por essa experiência.

A origem desse erro é uma conversão indiscriminada `String(quantity)`: compatibilidade com o alfabeto e a largura do papel **não prova** que a quantidade seja semanticamente válida.

## Reparos V5.9 (somente branch SHADOW)

1. O renderer `src/production/operationalTicketEscposV46.ts` aplica `typeof value === "number"`, `Number.isSafeInteger(value)` e `value > 0` para itens, sacolas, kits, acompanhamentos e contagens explícitas de caixas. Quando falha, insere `INVALID_QUANTITY:<contexto>` no conjunto de bloqueios. O resultado tem **zero bytes**, `ready_for_offline_preview=false` e `ready_for_operational_print=false`. O marcador de texto diagnóstico **não** é emitido para dispositivo.
2. A contagem física de caixas é opcional no contrato V4.5. Campo **ausente (undefined)** continua usando a interpretação pré-existente de uma caixa. Campo **explicitamente nulo ou inválido** agora é rejeitado; essa diferença evita inventar um fallback para entradas malformadas.
3. O projetor `src/production/operationalTicketsV45.ts` exige unidades vendidas inteiras e positivas, com representação numérica segura, na entrada de itens de origem. A função `positive()` usada para quantidades de recursos não foi alterada: quantidades fracionárias de consumo seguem sujeitas às regras próprias, não à contagem de unidades vendidas.
4. O helper de fixture `tools/verificar_real_order_tickets_v46.js` exporta a mesma entrada arquivada que já existia, somente para permitir o teste da borda do projetor. Não altera os dados fonte.

## Provas

`npm run verificar:quantidades-termicas-v59` executa `tsc` e `tools/verificar_quantidades_termicas_v59.js`:

- **66/66 testes PASS**: 49 casos negativos no renderer (itens, recursos e contagem explícita de caixas), 10 rejeições na origem da venda, preservação do fallback de campo ausente, comparação com recibos arquivados, contagens válidas, limite de inteiro seguro e ausência de efeitos reais.
- Comandas arquivadas preservam **332, 349 e 665 bytes** na produção Cozinha, Balcão Sushi e Conferência.
- As entradas adversariais foram alteradas apenas em cópias locais de objetos; não houve escritura em origem de vendas nem controle de impressora.

## Limites e aceite

- Nenhum limite máximo **de negócio** para quantidade de unidades vendidas foi comprovado na fonte atual. O limite implementado é de **inteiro seguro de JavaScript**, e a capacidade horizontal do papel permanece validada separadamente. Não confundir isso com autorização para comercializar quantidades extremas.
- A correção é `CODE_READY + LOCAL_TEST_PASS` somente na branch de prova; **não está em produção**, nem representa aceite humano, óptico ou operacional.
- A Issue #22 continua com falhas adversariais comprovadas no inspetor ESC/POS e bloqueio de edição preexistente. O reparo V5.9 **não mexeu nesse inspetor** nem contornou o bloqueio.
- A Issue #23 mantém pendente o CI de PR com testes adversariais obrigatórios. Não ocultar esse portão.
- Segunda folha óptica V5.4 segue sem impressão; a única fila autorizada para um futuro teste físico é `CAIXA` no Itaim, mediante autorização e meio permitido.
- Sem merge, deploy, alteração de driver/densidade/estoque, corte, gaveta ou impressão.

**Próximo portão:** regressão completa, publicar alterações verificadas em PR #21, revisão humana e posterior prova de integração. Não declarar a Issue #24 resolvida na realidade produtiva somente por testes locais.
