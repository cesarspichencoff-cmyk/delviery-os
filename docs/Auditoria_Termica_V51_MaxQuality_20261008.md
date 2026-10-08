# Auditoria Epson TM-T20 — tipografia, bytes, geometria e qualidade máxima (V5.1 SHADOW)

**Data:** 08/10/2026. **Estado:** CODE_READY + TEST_PASS offline, impressão física NÃO WORLD_PROVEN.

## Objetivo e método adversarial

A revisão foi dividida em: especialista ESC/POS, tipografia de recibo para ambiente escuro, engenharia do motor de comandas, QA de dados reais, compatibilidade de drivers e operação de seis praças. Cada conclusão deve ter evidência verificável; hipóteses de hardware permanecem marcadas UNKNOWN.

Proibição: nenhum efeito em impressora, spooler, fiscal, estoque ou pedido vivo; nenhuma alteração de densidade/velocidade automaticamente; sem cutover/deploy/merge.

## Fontes técnicas consultadas

1. **Epson — GS !, Select character size:** https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/gs_exclamation.html . Bits 0–2 = ampliação de ALTURA; bits 4–6 = ampliação de LARGURA. Portanto `GS ! 01` = altura 2x; `GS ! 10` (hex) = largura 2x; `GS ! 11` = ambas.
2. **Epson — ESC M, Select character font:** https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/esc_cm.html . Na família registrada, Font A 12x24 dots, Font B 9x17 dots; depende da variante real.
3. **Epson — ESC t:** https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/esc_lt.html . `ESC t 16` seleciona WPC1252 quando suportado pelo firmware/variante. Acentos brasileiros devem ser testados NO PAPEL.
4. **Epson — GS L / GS W:** https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/gs_cl.html e https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/gs_cw.html . Margem e largura podem ser configuradas na impressora/driver; 576 dots é REFERÊNCIA do modo 80 mm para esta família, não prova de configuração real.
5. **Epson TM-T20II, guia técnico:** https://files.support.epson.com/pdf/pos/bulk/tm-t20ii_trg_en_revc.pdf . Exemplo de níveis de densidade 1–7, inicial 4 e ajuste conforme papel. Aumento de densidade pode reduzir velocidade; NÃO extrapolar as configurações para modelos/variantes não identificadas.
6. **ReceiptLine:** https://github.com/receiptline/receiptline . Compara visualização SVG e ESC/POS, prevê `cpl`, codificação, imagens, gamma, threshold, margem e modo sem corte. Serve de benchmark independente, não justifica instalar outra cadeia de impressão.
7. **ReceiptIO:** https://github.com/receiptline/receiptio . CLI/API de prova, perfil de impressora e diagnóstico de status. Usar apenas como referência de QA; nunca conectar ao hardware sem autorização.
8. **python-escpos:** https://github.com/python-escpos/python-escpos . Capabilities por perfil e mapeamento de code pages, melhor que assumir que todas as seis filas são idênticas.
9. **escpos-printer-db:** https://github.com/receipt-print-hq/escpos-printer-db . Catálogo comunitário de capacidades; NÃO constitui calibração física do TATÁ.

## Falha crítica encontrada e corrigida

A V4.6 e a V5.0 usavam `heightDouble(true)` enviando `GS ! 0x10`, que é **DOBRAR LARGURA**, não altura. Na V5.0 o rastreador lógico de largura era incompatível com os bytes enviados. Isso era um falso positivo dos testes anteriores e afetava a composição real. A V5.1 corrigiu o valor para `GS ! 0x01` e criou um **segundo inspetor que decodifica os bytes reais ESC/POS**, não aceita apenas o `text_trace`.

## Melhorias objetivas na V5.1

- `src/production/operationalTicketEscposV46.ts`: fonte A (12x24) para linhas de produto, observações, cabeçalho e caixas quando cabem em uma linha; fonte B (9x17) apenas para nomes/linhas longas. Itens ampliados na **altura** correta; número de sequência continua altura+largura x2.
- `src/production/twoKitchenTicketEscposV47.ts`: preparações HOT / EBITEN / SHISO em fonte A de maior legibilidade. A via COZINHA — PRATOS permanece separada.
- `tools/escposByteInspectorV51.js`: decodificador INDEPENDENTE de `ESC @`, `ESC t`, `ESC M`, `ESC a`, `ESC E`, `GS !` e LF. Mede cada caractere em DOTS, verifica 576 dots por linha e bloqueia código desconhecido, corte, gaveta, caracteres de controle, área excedida.
- `tools/verificar_thermal_official_qa_v51.js`: 19 verificações contra pedidos reais arquivados, títulos, caracteres acentuados, fonte A/B, quantidade, observações, compositor das duas vias e ausência de efeitos.
- `tools/gerar_kit_qualidade_epson_v51.js`: gera em diretório TEMP 4 provas .escpos, .txt, .svg **somente offline** e manifesto SHA-256 com as SEIS impressoras. O SVG é **projeção geométrica**, não raster nativo da Epson nem captura da máquina.
- `tools/auditar_legibilidade_cardapio_v51.js`: prova TODOS os 199 nomes do catálogo histórico de julho com quantidade 1 e 12. Resultado confirmado: **193 usam Font A e 6 exigem Font B**, nenhum truncado ou bloqueado. O relatório aponta os seis casos, inclusive itens de bar; validar se ainda integram o menu ativo.
- `tools/verificar_legibilidade_cardapio_v51.js`: snapshot regression 199 itens, seis exceções, nenhum bloqueio, zero efeitos.
- Nenhuma dependência nova instalada; reuso integral do renderer e motor existentes.

## Resultado da auditoria do catálogo histórico

Para quantidade 1 ou 12, de 199 produtos históricos: **193 em Font A**, **6 em Font B**, **0 bloqueados**. Exceções para prova especial sob luz real:
- Combinado Tradicional Sashimi + Sushi 1 pessoa
- Combinado Tradicional Sashimi + Sushi 2 pessoas
- Sake para presentear - Hakutsuru Daiginjo Yamadaho
- Tatá chocolate com sorvete de caramelo salgado
- Vinho Argentino Norton Sexy Fish Cabernet Franc Seco 750ml
- Vinho Rose 2020 Grenache Lulu Le Francais 750ml

Arquivo de apoio: `docs/evidence/thermal_font_legibility_v51_20261008.md` e JSON. A condição de Font B é alerta para testar **legibilidade real**, não razão para abreviar automaticamente nem imprimir nome errado.

## Seis filas reais a calibrar — estado documentado

| Praça | Driver cadastrado | Prova física |
|---|---|---|
| COZINHA | EPSON TM-T20 ReceiptE4 | UNKNOWN |
| DELIVERY SUSHI 1 | Generic / Text Only | UNKNOWN; TCP 9100 anteriormente inacessível |
| DELIVERY SUSHI 2 | EPSON TM-T20 ReceiptE4 | UNKNOWN; TCP 9100 anteriormente inacessível |
| BALCAOSUSHI2 | EPSON TM-T20 ReceiptE4 | UNKNOWN |
| BAR | EPSON TM-T(203dpi) Receipt6 | UNKNOWN |
| BALCAOSUSHI1 | Generic / Text Only | UNKNOWN |

A tabela é do REGISTRO local `data/production_printer_calibration_registry_v1.json`, não prova de conectividade viva neste instante. Não confundir driver cadastrado com variante do hardware instalada.

## Critérios operacionais para QUALIDADE MÁXIMA (não apenas software verde)

1. **Identificação:** detectar a variante real (TM-T20, II, III ou outra), papel e firmware/driver por praça. Self-test da Epson e amostra assinada; confirmar se efetivamente 80 mm e 576 dots úteis.
2. **Fidelidade de texto:** acentos `AÇÃO PÃO CAFÉ LIMÃO SHISÔ Ç Ã Õ Ê`, números 0/O, 1/I/l, 5/S, 8/B, nomes grandes e pequenos, nomes completos em linha única, observações corretas, seis caixas C1–C6 com operador, kits/sacolas e sequência TATÁ.
3. **Ambiente escuro:** leitura a distância real de trabalho, com luz e ângulos das bancadas, por um operador de cada praça. Fonte B só passa se o operador conseguir identificar o texto de primeira, sem dúvida.
4. **Densidade e velocidade:** baseline por modelo e papel; ensaio controlado de densidade padrão versus um nível adjacente, sem assumir que máximo é melhor; verificar que letras não se fundem e não há manchas, faixas brancas ou perda de velocidade impraticável.
5. **Papel e manutenção:** confirmar papel térmico de qualidade compatível e limpeza da cabeça/rolete conforme recomendação do fabricante. Fotografia de amostras com régua e luz consistente.
6. **Métricas de aprovação:** 100% dos nomes, observações, quantidades e acentos corretos, 0 truncamento, 0 duplicação, 0 via ausente indevida, 0 erro de corte/posição e leitura operacional imediata. Não declarar 10/10 por apenas passar em teste de código.
7. **Roteamento:** prova isolada e reversível por fila, sem interrupção do software de impressão que atende clientes; efeito real exige janela e autorização humana.

**Observação de design:** a leitura visual do Figma falhou nesta rodada por autorização do conector; o comparativo pixel-a-pixel do Figma com o papel continua UNKNOWN. O espelho SVG do ESC/POS é nova rota independente, mas NÃO substitui bitmap real Epson. A tipografia native A prioriza a operação em baixa luz sem usar logos, cinza ou design supérfluo.

## Portão de continuidade e transferência

Esta branch segue **V4.9 PR #18 → V5.0 PR #19 → V5.1**, sem tocar na branch de produção. A implementação da outra conversa deve primeiro fazer `git merge-base`, `git diff` e `git range-diff` (ou equivalente) com a branch avançada; incorporar apenas o delta ausente e rodar todas as regressões. Não montar outro motor, não reimplementar regras 1:1 de Sushi Quente, não duplicar funções de ESC/POS.

**Estado:** CODE_READY e QA digital (sujeito aos testes registrados), não DEPLOYED, não WORLD_PROVEN, não HUMAN_ACCEPTED fisicamente. Impressão, corte, alteração de fila/driver, densidade, velocidade, stock, fiscal e deployment: **não executados**.
