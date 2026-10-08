# Calibração física Epson TATÁ Itaim — Preflight V5.2 (08/10/2026)

## Estado: BLOQUEADA POR CONECTIVIDADE DO AMBIENTE ATUAL

Esta etapa foi executada de forma **somente leitura**, após autorização genérica para avançar na calibração. Nenhum dado foi enviado a impressoras e nenhuma comanda operacional foi alterada.

Fonte canônica de impressoras: \`data/production_printer_calibration_registry_v1.json\`, unidade **0001 — TATÁ ITAIM**.

Execução de 08/10/2026, máquina remota **Foxxy**, com:
- \`tools/preflight_printers_itaim_v52_readonly.js\` — enumeração de filas locais e abertura/fechamento de conexão TCP 9100, SEM envio de bytes;
- \`docs/evidence/physical_preflight_v52_foxxy_20261008.json\` — relatório de prova com timestamp ISO e status individuais;
- \`tools/verificar_preflight_printers_v52.js\` — **9/9 testes**, incluindo comportamento de conexão/porta fechada apenas no loopback do próprio Foxxy.

## Resultado por fila

| Praça / impressora | Fila Epson instalada no Foxxy | TCP 9100 a partir do Foxxy | Papel realmente visto |
|---|---|---|---|
| COZINHA | Não | Timeout | Não |
| DELIVERY SUSHI 1 | Não | Timeout | Não |
| DELIVERY SUSHI 2 | Não | Timeout | Não |
| BALCAOSUSHI2 | Não | Timeout | Não |
| BAR | Não | Timeout | Não |
| BALCAOSUSHI1 | Não | Timeout | Não |

**0/6 acessíveis a partir deste computador; 0/6 filas locais; 0 impressões enviadas.**

Interpretação correta: NÃO prova que as Epson estejam offline, quebradas ou mal configuradas. IPs \`192.168.0.*\` são privados e podem existir em redes de locais diferentes. Abrir conexão de outra unidade ou máquina sem identidade física da rede não provaria nada sobre o Itaim. O computador remoto **CAIXA_MOOCA** foi identificado como de outra unidade e não foi utilizado para imprimir pedidos do Itaim.

Houve tentativa inicial de script \`.ps1\` de somente leitura; o sistema operacional bloqueou scripts pela política local. **A política não foi alterada**. O diagnóstico equivalente foi executado com Node.js, já instalado no ambiente.

## O que foi provado até aqui

- O software V5.1 executou inspeção independente de bytes ESC/POS, fonte nativa A/B, largura em pontos, itens e observações, regras de HOT/EBITEN/SHISO e testes de regressão; esses resultados ficam documentados no PR #20.
- O kit \`tools/gerar_kit_qualidade_epson_v51.js\` gera quatro arquivos de prova apenas offline: folha de calibração SEM PEDIDO e três vias de pedido real **arquivado**; acompanha manifestos, hash e SVG geométrico não-fiel ao bitmap físico.
- O preflight real V5.2 NÃO encontrou conectividade da rede das seis Epson a partir de Foxxy. **Não há foto de papel, prova de densidade, nitidez nem avaliação na luz ambiente**.
- Código e drivers em uso na unidade não foram modificados; sem criação/cancelamento de job, sem acesso fiscal/estoque e sem envio de corte.

## Dependência para executar o teste físico de forma segura

É necessário que um **computador autorizado e situado na rede real do TATÁ ITAIM**, com acesso comprovado às Epson, seja disponibilizado no Remote Desktop Commander. O fato de uma máquina estar em \`192.168.0.0/24\` **não basta**; verificar também a identidade do computador/unidade e fila de impressão, sem inferir por IP.

Assim que existir esse ponto de acesso:
1. Rodar novamente \`node tools/preflight_printers_itaim_v52_readonly.js\` e conferir a identidade da loja, drivers/filas e caminhos realmente alcançáveis.
2. Selecionar **uma única Epson identificada** e uma janela operacional segura, sem alterar fluxo de comandas existente.
3. Usar a folha \`TESTE - NAO E PEDIDO\` do kit V5.1. Enviar **apenas uma** prova física controlada pela fila/rota certa, com autorização da unidade; registrar que o job foi submetido, sem declarar papel visto antes de confirmação.
4. Receber foto nítida da impressão real, com régua, sob iluminação da bancada, além do auto-teste/modelo/firmware quando possível.
5. Auditar recortes/acentos, largura, Font A/B, 1/O, B/8, 5/S, contraste, altura, bobina, alimentação e corte. Não maximizar densidade arbitrariamente. Se houver necessidade, comparar um ajuste de densidade adjacente com autorização e reversão, guardando antes/depois.
6. Repetir por praça: COZINHA, DELIVERY SUSHI 1/2, BALCAOSUSHI1/2, BAR. Registrar **WORLD_PROVEN** apenas para cada impressora que tenha evidência física e aceite operacional.

**Critério de aprovação física:** 100% das informações legíveis no contexto escuro do TATÁ; sem nomes cortados, confusão entre quantidades, observações ou acentos, nem via duplicada. O teste digital V5.1 não substitui esse aceite.

## Transferência sem duplicidade

Manter o PR #20 como centro da qualidade. Esta V5.2 acrescenta **somente** ferramenta de preflight read-only, evidência observada em Foxxy e este documento; não gera motor paralelo, PR independente desnecessário nem alteração de recursos. A outra conversa deve comparar sua branch com PR #20 antes de importar e não declarar impressão física perfeita enquanto o acesso à loja não existir.

**Estado correto:** DIGITAL_TEST_PASS; SITE_CONNECTIVITY_UNKNOWN_FROM_STORE; FOXxy_PREFLIGHT_NO_ROUTE; PHYSICAL_QUALITY_UNKNOWN. Nenhuma ação externa de impressão foi executada.
