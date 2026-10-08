# Imposição da impressora única de testes: CAIXA — TATÁ Itaim (V5.3)

Data de decisão humana: 08/10/2026. César confirmou expressamente que o computador remoto chamado CAIXA_MOOCA **está fisicamente no TATÁ Itaim** e ordenou: **"testa sempre na impressora do caixa"**.

## Escopo operacional vinculante

- **ÚNICA fila autorizada para testes físicos**: \`CAIXA\`.
- **Outras filas** COZINHA, DELIVERY SUSHI 1/2, BALCAOSUSHI1/2, BAR: **NENHUM PAPEL DE TESTE** até eventual decisão humana diferente. Diagnósticos somente leitura são permitidos, não impressão.
- Driver observado da fila CAIXA: \`EPSON TM-T20 ReceiptE4\`; porta \`ESDPRT001\` (monitor Epson; porta USB \`TM-T20X\`), status pré-teste Normal.
- A presença de \`CAIXA_MOOCA\` no nome do Windows **não modifica a autoridade humana sobre a localização física**. Não alterar nomes de computador, impressoras, drivers ou filas a partir desse detalhe.
- Teste deve dizer em destaque **TESTE - NAO E PEDIDO**. Jamais enviar um pedido real ao caixa para teste, jamas imprimir cópias extras automaticamente, jamais mudar a densidade ou velocidade sem aprovação.
- Configuração versionada: \`data/thermal_test_target_policy_v53.json\`.

## Prova executada — 08/10/2026

1. **Identidade da fila:** \`CAIXA\`, driver Epson, USB \`ESDPRT001\`, impressora com descrição de dispositivo \`TM-T20X\`, 0 trabalhos na fila imediatamente antes do teste.
2. **Origem do arquivo:** \`tools/gerar_kit_qualidade_epson_v51.js\`, folha \`FOLHA_DE_CALIBRACAO_SEM_PEDIDO\`, **424 bytes**, SHA-256:
   \`8f6b02ea56f2daf6261fa6a5ce45d533ea68fa3e83d4344ad4fd860254dc1249\`.
3. **Primeira tentativa bloqueada antes do envio:** cópia Base64 incompleta (421 bytes), SHA diferente; o guard de integridade bloqueou a chamada de spooler. Nenhum trabalho foi criado.
4. **Correção segura:** transferência exata dos bytes a partir da fonte Foxxy para \`CAIXA_MOOCA\`, sem transcrição manual; validação do SHA-256 e do comprimento de 424 bytes **antes da impressão**.
5. **Execução única:** Winspool RAW na fila **CAIXA**, documento rotulado \`TATA CALIBRACAO - TESTE NAO E PEDIDO\`; \`WritePrinter\` reportou **424/424 bytes**, ID de trabalho **233**; sem envio ESC/POS de corte (\`GS V\`) ou acionamento de gaveta; sem alteração do driver, densidade ou configuração de fila.
6. **Confirmação independente Windows:** evento \`Microsoft-Windows-PrintService/Operational\` ID **307**, registro **4641086**, timestamp UTC \`2026-10-08T17:18:46.8594789Z\` (14:18:46 de São Paulo) registra trabalho 233 **impresso na CAIXA pela porta ESDPRT001, 424 bytes, uma página**. Evento 842 do processador de impressão reportou erro \`0x0\`.
7. **Depois do teste:** fila \`CAIXA\` voltou a estado \`Normal\`, nenhum job pendente. Dispositivo USB \`EPSON TM-T20X\` aparece no Windows.
8. **Reimpressão impedida:** guard local de uma tentativa em \`%TEMP%/tata_itaim_caixa_escpos_v51_one_shot_20261008.lock\`. Não repetir o script ou disparar outras filas automaticamente.

Evidência estruturada sem informações privadas desnecessárias:
\`docs/evidence/caixa_only_print_job_233_v53_20261008.json\`.

## O que AINDA não está provado

- O assistente **não viu nem recebeu fotografia do papel**. O evento do Windows atesta trabalho processado pela fila, **não qualidade óptica, alimentação física correta, legibilidade, corte manual ou aceitação do operador**.
- O teste físico na fila CAIXA não comprova nitidez das seis impressoras de produção. Nenhuma das outras filas foi acionada por este teste.
- Não foram aferidos contraste, fusão de letras, acentos \`ÇÃO PÃO É Ç SHISÔ\`, largura útil, escala em pontos, leitura de \`O/0\`, \`I/l/1\`, \`B/8\`, \`S/5\`, espessura da bobina, resultado sob luz baixa nem adequação do fallback para Font B.
- Não afirmar **WORLD_PROVEN** ou **10/10 físico** antes de evidência de papel. A regra atual do usuário é testar exclusivamente CAIXA, e essa regra prevalece sobre planos anteriores que propunham imprimir em outras praças.

## Próximo passo sem nova impressão

Receber uma ou mais fotos da única folha impressa pela CAIXA **no ambiente real do caixa**:
- foto perpendicular da comanda inteira, mostrando margens e alinhamento;
- close do trecho \`3 HOT ROLL TATA / 12 URAMAKI EBITEN\`, da linha de acentos e dos caracteres de distinção;
- iluminação real da bancada, sem filtros de câmera que alterem contraste.

Auditar então nitidez, tamanho, contraste, acentos, proporções, alinhamento, eventual excesso de densidade, legibilidade de Font A/B, margens, avanço e comprimento. Se houver necessidade material de ajuste, propor **um único próximo teste na CAIXA**, de forma reversível e com prova prévia, nunca nas outras filas.

## Continuidade sem trabalho duplicado

A cadeia segue **PR #16 → #17 → #18 → #19 → #20**. Este documento e a regra de fila única são atualização aditiva do **PR #20**. Não há cutover, merge, deploy ou conexão à impressão automática do DeliveryOS. Cada mudança da outra conversa deve comparar a branch atual e incorporar apenas o delta faltante.

Estado factual: HUMAN_ROUTING_CONFIRMED, RAW_PRINT_JOB_COMPLETED_OS_EVENT_307, PAPER_IMAGE_UNKNOWN, PHYSICAL_QUALITY_UNKNOWN, PRODUCTION_UNTOUCHED.
