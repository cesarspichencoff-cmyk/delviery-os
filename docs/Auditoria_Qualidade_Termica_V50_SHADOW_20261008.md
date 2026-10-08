# Auditoria adversarial de qualidade térmica — V5.0 SHADOW

Data: 2026-10-08. Autoridade humana: qualidade máxima legível para operação TATÁ em ambiente escuro, sem mudar o layout aprovado e sem alterar impressoras ativas.

## Evidência realmente examinada

- `src/production/operationalTicketEscposV46.ts`: renderer textual ESC/POS Epson, Font A 48 e Font B 64 colunas **presumidas**, ESC @, ESC t 0x10 candidato Windows-1252, ESC M, ESC E, GS !, alinhamento e line feed; nenhum comando de corte ou envio físico.
- `src/production/twoKitchenTicketEscposV47.ts`: duas vias separadas da cozinha, HOT/EBITEN/SHISO e PRATOS, em prova offline.
- `data/production_printer_calibration_registry_v1.json`: família Epson TM-T20, 203 dpi de referência, 80 mm nominal e 576 dots imprimíveis no modo referencial; impressoras reais **sem confirmação física** de largura, variante, codificação, corte, densidade e legibilidade.
- `tools/verificar_operational_escpos_v46.js`: 12 verificações, incluindo seis caixas, operador por caixa, 3 kits Kids, 1 Quente, IDs, nomes em linha única, corte ausente e bloqueios.
- Figma nodes de produção 30:2 e conferência 20:2: tentativa de screenshot retornou **link_id must identify an eligible linked account**; portanto **NÃO** houve revisão visual direta do Figma nesta execução. Referência documental preservada, sem afirmar paridade pixel a pixel.

## Achado crítico corrigido nesta branch

**Problema anterior:** `OfflinePrinter.line()` validava comprimento pelo limite de colunas normal, mas `GS ! 0x11` aplica largura e altura duplas. Uma linha com 30 caracteres na Font A ampliada ocuparia 60 colunas e poderia cortar/avançar no papel.

**Correção:** `currentWidthMultiplier` rastreia largura efetiva; limite calculado `floor(fontColumns / multiplier)`. Font A normal 48, dupla 24; Font B normal 64, dupla 32. Altura dupla sozinha não reduz largura. Overflow bloqueia **todos os bytes do comprovante**, sem truncar nomes. O código mantém `ready_for_operational_print=false` e nenhuma operação externa.

**Prova:** `tools/verificar_thermal_geometry_v50.js`: 12/12 PASS; `npm run verificar:tickets-reais-v46`: 2 replays reais arquivados e 12 verificações térmicas PASS.

## Qualidade máxima possível sem inventar prova

1. Prioridade para texto preto sólido, fundo branco, sem cinza, decoração ou rasterização desnecessária; contraste e reconhecimento rápidos na iluminação real.
2. Quantidade e item devem ser hierarquizados, com nome completo em uma linha, sem truncamento. A fonte B condensada deve ser aprovada **no papel**; se ficar pequena para a equipe, preferir fonte A e nomes operacionais aprovados, nunca abreviar sem aprovação.
3. Calibrar em cada Epson **modelo/variante**, papel 80 mm real, largura imprimível efetiva, modo fonte, code page e acentos `Á É Í Ó Ú Ã Õ Ç`; ESC t 0x10 é hipótese, não prova de que a impressora seleciona a tabela pretendida.
4. Densidade/energia térmica e velocidade devem ser otimizadas em teste comparativo. Escurecer demais pode engrossar e fundir letras; escurecer pouco pode deixar texto apagado. O alvo é traço bem definido sem perda de abertura em `A/O/8/0` e números grandes.
5. Conferir qualidade do papel térmico, manutenção/limpeza da cabeça e rolete, alimentação e papel úmido/antigo; esses fatores podem limitar a nitidez independentemente do arquivo.
6. Comparar amostras com itens de 1 e 2 dígitos de quantidade, observações, acentos, nomes longos, operador por caixa, kits, sequência final grande e quatro vias.
7. Validar especificamente os caminhos/filas de **cada setor**, sem substituir o driver ativo às cegas: COZINHA com Epson TM-T20 ReceiptE4; DELIVERY SUSHI 1 com Generic / Text Only e TCP 9100 anteriormente inacessível; outros setores devem ser inspecionados no cadastro e no local.
8. Verificar comprimento do papel, margens, avanço final, corte, congestionamento e leitura a distância/ângulo da bancada escura.
9. Registrar por impressora: foto do papel com régua, modelo, driver, papel, largura real, parâmetros, fila, fonte, densidade, teste de acentos, hora, responsável e aceite. Nenhuma dessas medições foi executada fisicamente aqui.

## Prova e fronteira

- **Código auditado e corrigido:** sim, para a geometria de largura dupla.
- **Regressão digital:** sim, 12/12 V5.0 + 12 V4.6 + 2 replays reais.
- **Figma screenshot atual:** indisponível por autorização do conector.
- **Impressão real e legibilidade por setor:** NÃO EXECUTADAS.
- **Aprovação 10/10 física:** NÃO COMPROVADA.
- **Efeitos em produção:** nenhum. Não enviar bytes, não fazer cutover, não mudar drivers ou parâmetros em impressoras ativas sem janela e autorização.

## Transferência sem duplicação

Continuar a partir de `feat/thermal-quality-v50-audit-shadow-20261008`, base V4.9 PR #18, incluindo a correção de geometria, os testes e este relatório. Reconciliar com branch corrente da outra conversa **antes** de aplicar mudanças. Não recriar o renderer nem um motor paralelo. A parte de cálculo HOT/EBITEN/SHISO 1 por porção vendida da praça Sushi Quente permanece no PR #18.

A próxima prova obrigatória é a calibração física por impressora e o comparativo do papel com a referência visual aprovada. Não declarar impressão perfeita antes disso.
