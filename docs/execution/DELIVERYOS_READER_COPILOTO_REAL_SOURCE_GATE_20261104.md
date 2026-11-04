# Delivery OS — Reader nativo → Copiloto: admissão segura de dados reais (04/11/2026)

**Objetivo do lançamento, mantido:** Itaim: pedidos/itens/observações → praças conforme mapa canônico → conclusão física comprovada → conferência → Entregas → Copiloto Home. Nenhuma versão reduzida apenas a Entregas pode ser chamada de V1 completa.

**Estado da revisão:** PR #137 em DRAFT/HOLD, HEAD na verificação `cbacf47d0fc7dd51d0a39a355f7524d509a0774f`; PR #135 permanece separada. Este relatório é prova de **laboratório**, não homologação do Reader instalado.

## Atualização factual posterior — fonte instalada e alternativa sem restart
Consultar **primeiro** `docs/execution/DELIVERYOS_READER_V2_LEGACY_HASH_IN_MEMORY_BRIDGE_20261104.md` e PR #135 `docs/comandas/ITAIM_REAL_READER_SQL_SOURCE_PROOF_20261104.md`. A sessão SQL **do watcher V2 instalado** foi comprovada na auditoria administrativa, e seus campos de notas existem. `RCSI=OFF` e `SNAPSHOT=OFF` — portanto **integridade atômica de revisão não comprovada**, mesmo que o digest confira. Nova ponte em memória para hash legado estritamente recomputado, desligada por padrão, 11/11 + arquivo 19/19 no CI `41780271973`; **nenhum deploy**. Esse avanço supera a antiga hipótese de que o V2 instalado omitia necessariamente observações e de que a falta de acesso administrativo aos diretórios era o único bloqueio. Os resultados do gate anterior abaixo continuam válidos apenas no seu escopo laboratorial.

## Reuso confirmado antes da intervenção
- `runtime/reporting/copiloto_tata_file_feed_v1.cjs` já implementava leitura limitada por checkpoint e consistência do diretório/arquivos, janelas de tempo, unidade e modo; não foi duplicado.
- `runtime/reporting/copiloto_tata_reader_adapter_v1.cjs` já adaptava identidade, itens e quantidades, preservando `ready_for_dispatch=null` e estado KDS `UNKNOWN`.
- `runtime/reporting/native_reader_producer_contract_review_v1.cjs` **já** inspecionava leitura de observações, vínculo de nota com item, digest SHA-256 minúsculo e chave nativa em quatro partes, sem alegar autenticação da origem.
- `src/product/eventos/produtor-trabalho-praca.ts` e `projetar-leitura.ts` **já** produzem/projetam fatos explícitos `aguardando/iniciado/concluido` por praça, com conflitos, ordem e idempotência. Não criamos outro mecanismo de pronto.
- `src/product/viewmodels/home-vm.ts` já governa a Home com único Foco, degradação e sem verde inventado. `#/copiloto` continua diagnóstico.

## Lacuna real fechada nesta revisão de código
Antes: o adaptador permitia um envelope declarado `sourceMode:'real'` passar pelo parsing de itens/quantidades mesmo que o evento não tivesse `order.observation_scan_complete` e `observation_rows`. Isso poderia fazer uma revisão incompleta parecer suficientemente íntegra para leitores posteriores; preocupante para S20, alergias e observações especiais.

Agora: **exclusivamente para escopo Itaim 0001/01, origem DLV_IFO e modo real**, o adaptador exige o `canonicalContractChecked` do **validador nativo já existente**. Falta de notas/completude, hash maiúsculo/incorreto, nota adulterada, associação errada e escopo indevido retornam `blocked`. Não se duplicou o hash, a leitura de SQL, o classificador ou o motor; controles `simulated/control` continuam explícitos e não viram dados reais. Outras origens comerciais não herdam a qualificação DLV_IFO automaticamente.

**Importante:** a revisão de contrato **não prova** que o Reader instalado é legítimo, está atualizado, leu todas as observações ou tem SQL consistente. O retorno `live_source_verified` permanece **false**; `operational_order_total` permanece **null**; nenhuma revisão é declarada pronta para expedição por causa do código 3/P/X. Texto sensível das observações não é exportado no read model.

## Provas reais de CI, mas apenas com dados fictícios
- Commit `69cf4076`: workflow já existente `Delivery OS silent fixture (isolated)`, sucesso. Inclui validador 27/27 e adaptador 21/21, com seis novos casos de real-mode.
- Commit `cbacf47d`: mesmo workflow, execução **41773277307**, estado **completed/success**; job Linux de contratos e Windows de fixture passaram. Leitura de logs do job Linux confirmou:
  - `NATIVE_READER_PRODUCER_CONTRACT_REVIEW_PASS 27/27 SYNTHETIC_ONLY`
  - `COPILOT_READER_ADAPTER_PASS 21`
  - `COPILOTO_REAL_CHECKPOINT_BOUNDARY_PASS 5/5 SYNTHETIC_ONLY`
  - Regressões existentes: silent observer 42/42, pair 40/40 e diagnostic readiness 53/53.
- `tests/tata-reader/run-real-feed-boundary-tests.cjs` usa arquivos temporários sintéticos no formato **checkpoint + evento do Reader** e verifica leitura positiva restrita, revisão sem observações, nota adulterada, vínculo de item falso e revisão atual bloqueada. Em todos os casos a quantidade total de pedidos reais é **UNKNOWN**, e `ready_for_dispatch=null`.
- O CI não usou Foxxy, caixa, banco, GPS, impressão nem um pedido comercial. Não atesta build Android completo nem o executável instalado.

## Ainda falta — não reabrir áreas já resolvidas
1. **Origem verdadeira:** Reader em execução no host de Itaim, bytes/identidade efetiva, canal autenticado read-only, contrato de observações e revisão completa/fresca. O pré-ensaio da manutenção supervisionada autorizada pela direção concluiu `STOP_SAFE` por EPERM, falta de drenagem/rollback e ausência de canal sob identidade do serviço. Reiniciar a versão atual não cria essa capacidade. Continuar bloqueado até acesso legítimo e procedimento seguro; nada de bypass ou SQL sob outra conta.
2. **Praça física:** as oito praças e nomenclatura já existem; falta atrelar cada trabalho/etapa ao código de item do pedido com identidade comprovada, sem inventar carga. O produtor de trabalho explícito R5-D3 está implementado, mas **não comprovado como evento real emitido pela bancada**. O SQL nativo não é KDS por praça.
3. **Pronto e conferência:** conclusão física por praça e lacre não são automaticamente `IDSTCOMANDA=P`, `ready_order` ou impressão. Usar recibos de fatos autorizados já existentes; sem isso, estado UNKNOWN.
4. **Home e Entregas:** a Home original e o event log existem, mas ainda falta o ensaio ponta a ponta com evento de pedido real, prova de pronto e viagem sincronizada. Não usar o laboratório V4 (visual rejeitado) como substituto da Home.
5. **Campo:** validação assistida iPhone/Xiaomi, consentimento e recibo remoto de termo, GPS só em viagem, offline, segurança, silêncio de CMD e rollback.

## Efeitos e decisão de avanço
**Alterados somente** adaptador, testes e workflow isolado da PR de revisão, mais este registro. **Não** alterados: serviço real, instalações, leitura de cliente, conta do Windows, banco, impressão, SQL, GPS, rotas públicas, contratos oficiais ou produto visual. Nenhum merge/deploy.

**Próximo passo efetivo de maior valor:** fechar a via autorizada de leitura **do Reader efetivamente instalado** e obter uma revisão atual completa; em paralelo, preparar o vínculo de item/praça com o produtor R5-D3 já existente, sem criar novo motor. Se o canal não puder ser atestado, reportar o impedimento e não chamar pedidos históricos ou fixtures de operação atual.

**Prova:** `REAL_SOURCE_ADMISSION_LAB=PASS`; `GITHUB_CI=SUCCESS`; `ACTUAL_READER_AUTH=UNKNOWN`; `ONE_LIVE_ORDER=NOT_READ`; `PRACA_PHYSICAL_READY=UNKNOWN`; `HOME_LIVE=UNKNOWN`; `DEPLOY=NO`; `HUMAN_ACCEPTED=NO`.
