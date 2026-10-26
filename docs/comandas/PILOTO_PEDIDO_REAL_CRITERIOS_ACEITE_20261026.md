# TATÁ Comanda — protocolo do primeiro pedido real (piloto com autorização separada)
**26/10/2026 | DRAFT / HOLD | sem instalação, impressão ou escrita em produção**

## Objetivo de aceite
Um único pedido **real e legitimamente observado** no Itaim percorre: identidade independente Gestor iFood/Teknisa → mesmo snapshot/revisão V2 → conferência V6.8 → classificação vigente do motor canônico Academia com origem validada → sequência TATÁ persistida e não duplicada → duas vias de produção e uma de conferência, distintas e legíveis, **sem repetir o que o Gestor iFood já imprime**. Documento fiscal permanece isolado.

## Fase 0 — pré-voo sem efeitos (executável antes de autorizar piloto)
1. Confirmar `CAIXA_MOOCA` real, saúde do leitor, versão e hashes dos arquivos e supervisor, sem tocar na aplicação de caixa.
2. Comprovar proveniência independente da captura iFood e da linha Teknisa, sem nova API ou credencial iFood; caso nenhuma fonte independente esteja disponível, registrar `UNKNOWN`, não reconstituir de um mesmo envelope.
3. Comprovar chave composta, revisão, itens, quantidades, observações item por item, cancelamentos e alergênicos. O número curto iFood sozinho não é chave forte.
4. Comprovar motor Academia em versão aceita, correspondência código↔nome↔classificação↔praça para os itens do pedido; discrepância/sem prova = `A DEFINIR` apenas em caixa/sacola/kit depois de efetiva avaliação, nunca em item/quantidade/iFood/seq TATÁ.
5. Determinar origem autorizativa da sequência 3 dígitos; até 26/10 a fonte observada tinha `bindings=0`. Testar idempotência/casos negativos exclusivamente em cópia, sem criar `001` na operação.
6. Provar destino lógico e papel das impressoras A/B por evidência nativa independente; `LUNCH/DINNER` não decide automaticamente. O posto de caixa já tem impressão do Gestor iFood: não duplicar.
7. CI ou replay isolado sobre commit exato, rollback, exclusividade de processos V1 supervisor / V2 leitor, atomicidade/restart, consentimento para qualquer alteração.

## Fase 1 — autorização humana específica e estreita
Só depois de Fase 0 aprovada, apresentar identificação da unidade, dispositivo, janela, pedido de teste deliberadamente escolhido, lista exata de arquivos/serviços a alterar (se houver), sequência e destino, plano de reversão, quem supervisiona o papel e quem tem poder de STOP. **NÃO usar autorização geral de “continue” como autorização física.** Uma autorização de leitura não autoriza vinculação de sequência, serviço, SQL, spooler ou impressão.

## Fase 2 — observação/aceite físico (não autorizado)
Em janela acordada, uma única tentativa por identidade de pedido e por via, com teste anti-reimpressão e recibo externo quando aplicável. Sem paper/output independentemente observável: `NOT_WORLD_PROVEN`. Se houver duplicação de vias, divergência de sequência, erro de observação, falha do leitor, reclassificação arbitrária, destino ambíguo, estado de rollback sem prova ou outra condição inesperada: `STOP/HOLD`; preservar evidências e não dar retry automático. Evidência óptica e aceite humano da operação são obrigatórios antes de marcar `PHYSICAL_ACCEPTED`.

## Status atual
- Leitor: `RUNNING` observado no host.
- Consumidor: `ready_count=0`, `blocked_count=2047`; não reproduzir recibos shadow como se fossem pedidos impressos.
- Códigos investigados: 14/14 conferem com cache de identidade e nome de 05/10, 0/14 têm alias; 1/14 sem rota; fontes antigas precisam de atualização autorizada.
- Sequência TATÁ: `bindings=[]`; sem autorização de persistência.
- Código candidato: offline tests PASS para partes da cadeia, CI hospedada e implantação sem prova do HEAD exato.
- Pilot readiness: **HOLD**; **physical effects = 0**.

**Aceite 10/10 só depois de `CODE_READY + CI/TEST_PASS + DEPLOYED + WORLD_PROVEN + HUMAN_ACCEPTED` sem obrigação crítica aberta.**
