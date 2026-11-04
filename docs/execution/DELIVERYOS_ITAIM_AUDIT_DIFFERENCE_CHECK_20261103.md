# Delivery OS Itaim — auditoria adversarial de continuidade e diferença real (03/11/2026)

**Escopo:** decisões de César; auditoria de fonte de verdade de 01/08; constituição e índice canônico; auditoria de preservação de 13/10; auditoria independente de Operação Viva V4 e revisão de 07/08; auditoria de interligação de Comandas 22/10; decisões de 26/10; auditoria Reader de 02–03/11; árvore conectada de 02/11; checklist de lançamento e testes cruzados de 03/11; código Android/Reader/Home atual. **Nenhuma operação real executada nesta auditoria.**

**Refs lidas:** PR #133 `39f394c95744cf4c152ee5c99982f80afa5544a6` · PR #135 `168a9faa9c2350231dd97f3e3957d6ca323d94ce` · PR #137 `d0fc34ac30b573b496f22c39300ce8354751c447`, todas DRAFT/HOLD sem merge. Árvores examinadas com GitHub: PR #135 **949 blobs**; PR #133 **2.078 blobs**; PR #137 **2.131 blobs** (contagem de arquivos da API Git trees, sem truncamento). Referências são checkpoints, não indicadores de progresso. GitHub Actions no HEAD de leitura da #137: `Delivery OS silent fixture` **SUCCESS** (run 41762979875); #135 `DeliveryOS Thermal Shadow Gate` **SUCCESS** (run 41746524381). Essas CI **não** são prova de instalação, fonte comercial ou execução do teste cruzado 28/28 no runner.

## Síntese: não é ausência de software; são decisões perdidas e evidências faltantes

### A. CORREÇÃO DE ROTA CRÍTICA — fronteira iFood × Teknisa fora do lugar
**Fonte prevalente:** `docs/comandas/CONVERGENCIA_VERTICE22_REQUISITOS_PROVAS_20261026.md` e `docs/comandas/READER_V2_ESTADOS_REAIS_FONTE_POR_VIA_20261026.md` (PR #135).

Duas vias de **produção** (Sushi e Cozinha) dependem da composição nativa integral, revisão e classificação da Teknisa; **não exigem cruzamento independente com iFood** como pré-condição para **avaliar conteúdo nativo**. Cruzamento independente iFood × Teknisa é obrigatório **para a via de Conferência/correlação entre fontes** quando ela fizer alegações sobre pedido externo. Um UUID do iFood não deve ser exigido globalmente para a leitura e classificação das praças, e tampouco inferido de número curto. A PR #137 tinha documentos/roteiro que misturavam a exigência forte da Conferência com o intake básico de produção. **Corrigir esse roteamento documental.** A fonte nativa continua derivada de software de terceiro: não chamar origem independente, nem promover a impressão real. Para associar Trip/Delivery a pedido externo, provar vínculo forte no ponto dessa associação.

### B. DECISÃO HUMANA JÁ FECHADA — Quentes/Sushi/Cozinha não voltam à discussão
**Fonte prevalente:** `docs/product/DELIVERYOS_CANONICAL_SOURCE_INDEX.md` §3.5, decisões de 01/08, e `src/product/viewmodels/copiloto-celulas-v33.ts`.

`enrolados_quentes` = **Sushi Quentes**, visível como subárea dentro do ambiente maior Sushi; `cozinha_quentes` = **Cozinha**, outro ambiente. A célula específica `Quentes` no V3.3 corresponde a Sushi Quentes, com consolidação sem contagem duplicada. A redação anterior “mapa Quentes/Cozinha ambíguo” é **obsoleta**. O que permanece HOLD é **provar cada código novo/ambíguo de produto e sua estação** na fonte viva, não definir a taxonomia. A PR #135 já trabalhou equivalências e exceções; histórico de 14 códigos em revisão não equivale a 14 problemas atuais comprovados.

### C. PROVA REAL HISTÓRICA PRESERVADA — não reabrir o pipeline de Comandas
**Fonte:** `docs/comandas/CADEIA_NATIVA_E_CANDIDATA_HOMOLOGACAO_20261102.md` e `CANDIDATA_FINAL_HOMOLOGACAO_20261102.md`.

As revisões reais **9627 e 9092**, capturadas anteriormente, já atravessaram a cadeia nativa em laboratório e produziram **três vias virtuais** consistentes sob as políticas daquele momento. Isto não autoriza operação nem diz que os pedidos são atuais. O novo teste cruzado da PR #137 em `tests/reporting/run-reader-comandas-deliveryos-cross-branch-tests.cjs` **28/28 PASS em Foxxy** já provou compatibilidade de eventos/observações/hash/joins entre módulos PR #135 e PR #137, mas sua decisão V7.14 foi **fabricada como fixture**, não lida do consumidor comercial. Não repetir o motor/renderer/joins; fechar apenas atestação, versão instalada, frescor, ciclo real e o consumer real.

### D. GATE CENTRAL DE PRODUTO NÃO PODE SER REDUZIDO A “DADOS CHEGARAM”
**Fontes:** `docs/auditoria/DELIVERYOS_SOURCE_OF_TRUTH_RECOVERY.md`, `DELIVERYOS_PRODUCT_REALIGNMENT_AUDIT.md`, `docs/product/CONTRATO_CONSCIENCIA_COPILOTO.md`, `docs/execution/DELIVERYOS_REVOLUTION_0A_PROGRESS.md`.

Home/Organismo V3.3 já existe. `#/copiloto` e `src/entregas/ui/copiloto` são diagnósticos; `SimulatedCopilotoConsumer` e `copiloto-celulas-v33` são provas parciais. **Não há demonstração de que o fluxo real Reading → Operação Viva (dona de Calmo/Ambiente/Foco) → motor original de orientação limitado à mesma causa-raiz → Home tenha sido fechado.** `src/platform/projections/operacao-viva.ts` projeta viagens; não tomar a existência de suas 9 dimensões como sinal de pressão de cozinha.
O **Lab Operação Viva V4** tem substrato funcional, cenários e avaliação independente final `APPROVED` em 07/08; porém o visual foi **rejeitado por César em 05/08**. **Preservar mecanismos de leitura/confiabilidade e de validação aprovados em laboratório**, mas não promover sua tela como Home nem fazê-lo proprietário de outro Foco. Qualquer promoção de lógica entre motores exige o contrato de autoridade/correlação causal, não uma junção ingênua de objetos.

### E. 22 SINAIS ORIGINAIS NÃO PODEM SUMIR DO CONTRATO
**Fonte:** `docs/Mapa_Sinais_Operacionais.md` (S1–S22) e índice canônico §4.1: abandonar um sinal exige decisão de César.

A matriz V1 escrita em 03/11 descreve 8 áreas de comprovação mas **não faz a rastreabilidade dos 22 sinais**. Não significa que todos os 22 tenham fonte ao vivo, nem que todos devam ter alerta no primeiro dia. Significa que o escopo não pode ser esquecido. Antes do release classificar cada sinal **capaz de funcionar com fonte provada / exibido apenas como informação parcial / bloqueado e rotulado / atualização futura expressamente decidida**. Prioridade de segurança para a fatia V1: S4/S5/S7/S9 (praças e trava), S10/S11 (custódia), S12/S13 (fechamento), S14 (sacolas apenas com motivo comprovado), **S20 (observação especial/alergia)** e **S21 (bebida, sobremesa, kit)**. Não afirmar “sem alergia/sem kit” quando faltam observações.

### F. “PRONTO” POR PRAÇA É UM FATO FÍSICO, NÃO UMA COLUNA DE STATUS NEM UMA IMPRESSÃO
**Fontes:** PR #135 `docs/comandas/READER_V2_ESTADOS_REAIS_FONTE_POR_VIA_20261026.md`; PR #137 `src/entregas/pilot/ready-orders.ts`, `ready-queue-observation.ts`.

Cabeçalhos `3/P/X/4` e status de item `4/6` são conhecidos **sem semântica de “concluído fisicamente por praça” comprovada**. `ready_order` e evento `delivery_ready` preservam um registro de expedição, não o ato físico de concluir cada item. Impressão da via TATÁ Comandas é outra frente e não é recibo de conclusão. O Copiloto só poderá falar “quentes prontos”, “pedido pronto” ou “pronto sem sair” quando cada predicado tiver evento/prova, cobertura e frescor. A via útil mais curta é **reusar eventos de conferência e entrega que já existam**, mais fonte autoritativa por praça quando houver, e mostrar desconhecido quando ausente. Proibido digitação extra por pedido no pico sem evidência de benefício.

### G. ANDROID: código pronto ≠ segurança do piloto comprovada
**Fontes:** `docs/entregas/pilot/GATE_CAMPO_ANDROID_COPILOTO_2026-10-20.md` e `SyncWorker.kt` da árvore PR #137.

Já existem TripLocationService nativo com fallback sem GMS, Room/WorkManager, outbox, domínio Trip e provas JVM/Chromium anteriores — **não reescrever**. Porém `SyncWorker.kt` continua com `ApiResult.Rejected -> db.outbox().markFailed(...)` para eventos operacionais, que permanecem elegíveis à fila de reenvio; é bloqueador potencial de recusa terminal/loop até classificação por motivo e recibo. `TermAck` enviado ao piloto pela rota legada usa cliente sem credencial própria e, para `Unauthorized/Rejected`, permanece pendente; **ACK local não é aceite remoto**. Cenário de encerramento remoto durante offline, consentimento/termo, HTTPS/assinatura, bateria Xiaomi e campo ainda não têm prova final. **Não afirmar que falta só instalar o APK.** Diferenciar rejeição de domínio, rejeição de credencial, falha recuperável e recibo remoto.

### H. MANTER A PROTEÇÃO DO CAIXA E A AUTORIZAÇÃO JÁ DADA
**Fonte:** PR #135 `docs/comandas/READER_SUPERVISED_MAINTENANCE_PREFLIGHT_20261103.md`.

César já autorizou avaliação/manutenção supervisionada, inclusive possível parada breve reversível, mas o pré-ensaio concluiu `STOP_SAFE`: binário/owner/checkpoint protegidos (EPERM), sem canal efetivo autenticado do Reader para um SELECT controlado, sem prova de drenagem e restauração. **Não reiniciar o serviço por insistência, contornar ACL, usar shell visível, reativar seis tarefas Edge/UIA, tocar impressoras/SQL, consultar dados de clientes ou criar coletor novo.** Um restart da versão atual não cria a rota de diagnóstico. Falta acesso administrativo legítimo e mecanismo técnico aprovado; autorização prévia não é bypass técnico.

## Delta mínimo após a auditoria

| Ordem | Ação | Estado |
| --- | --- | --- |
| 0 | **Consolidar as decisões A–H** para não repetir exigência iFood em Produção, nem reabrir taxonomia de praças e não substituir o visual | **Documento/reconciliação nesta branch** |
| 1 | **Reader sob a identidade autorizada:** confirmar bytes do serviço, isolamento SQL, observações/revisão atuais, sem efeito no caixa; duas produções podem ser analisadas com nativo atestado | **HOLD operacional: rota de execução/ACL/drenagem** |
| 2 | **Prova física de pronto** por praça, lacre e expedição; catalogar S1–S22 e a cobertura do primeiro piloto; não repetir três vias virtuais | **HOLD de fonte física/estados** |
| 3 | **Fechar a Home** usando o motor soberano de atenção + orientação causal e todos os fatos autorizados; testar com E2E navegador/PG e regressão visual canônica | **HOLD de integração live** |
| 4 | **Entregas seguro no Xiaomi:** corrigir / provar rejeições, termo/ACK remoto, stop offline, GPS e sincronização; piloto acompanhado e reversível | **HOLD de campo/segurança** |

**Prova realizada nesta auditoria:** leitura e confronto de docs/código/GitHub/CI. **Não** houve execução nova de tests runtime, nem alteração de código de produto, banco, serviço, impressora, GPS ou aplicativo no caixa. O último teste direto cross-branch permanece `28/28 SYNTHETIC_ONLY`, em Foxxy, registrado anteriormente.

**Estado ao fechamento do relatório:** maioria do software já existe; de fato restam interfaces operacionais e prova de campo. `DRAFT/HOLD` não equivale a `DEPLOYED`, `WORLD_PROVEN` ou `HUMAN_ACCEPTED`.
