# Sacolas B1/B5/B8/B9 — portão de autoridade (HOLD)

Data da auditoria: 14/10/2026. Este documento descreve a **primeira entrega das comandas**, não um sistema novo.

## Evidência já verificada

- Dez eventos originais do almoço de 14/10 foram reexecutados com o candidato V2 V7.14, oito fontes pinadas e observações integrais em sandbox offline no Foxxy; 10/10 `BAG_SIZE_NOT_FACT`, outros bloqueios zero. Todos continuaram `ready=false`. Prova registrada na Issue #102. Não havia V6.8 nem saída de papel no replay.
- Composição humana exata B1×6, B5×1, B8×1, B9×2. Cada uma corresponde à sacola **M, quantidade 1**. Nenhuma regra de composição vizinha herda essa confirmação.
- Fonte de revisão `runtime/shadow/human-validations-cesar-20261014.review.json` fixada pelo Git blob `cd30d2039ea9228ff59c7581b0bc1c1f4cbaef98`. É registro da confirmação, **não atestação independente de autorização operacional**.
- Código `tools/comandas_bag_human_proposal_v1.cjs`, testado por `tools/verificar_comandas_bag_human_proposal_v1.cjs`; confere estrutura do snapshot, SHA-256 calculado conforme watcher V2, fingerprint do consumidor, identidade/quantidade linha a linha, oito hashes de linhagem e observações idênticas. Apenas produz **proposta de revisão**.

## Fronteira do portão

1. **SOURCE_MATCH**: pode dizer `SHADOW_BAG_MATCH_ATTESTATION_AND_V68_PENDING` somente com evento e decisão imutáveis, revisão exata, item correto, bloqueio único `BAG_SIZE_NOT_FACT` e regra humana pinada. Qualquer divergência = `HOLD`.
2. **TRUSTED_ATTESTATION**: continua ausente. Não aceitar campos de `human-order-overrides-v1.json`, assinatura sintética da V7.57 nem `human_ref` autoemitido como aprovação independente. Uma implementação futura deverá autenticar operador, chave/custódia ou canal autorizado, associação ao snapshot e revogação/anti-replay. Sem essa prova, não criar `FACT`.
3. **V2_CONSUMER**: permanece byte a byte V7.14 e bloqueado no passado. A proposta não altera `ready`, `blocking_reasons`, `fingerprint`, `packaging`, `kits` ou sequencial. Antes de promover uma nova variante é necessário contrato de decisão e teste de regressão comparando a versão pinada.
4. **V6.8**: exige `decision.ready=true` e fontes independentes da mesma revisão (delivery, produção, plano, identidade, observações), não simplesmente o envelope legado com evento+decisão. Nenhum `V6.8` foi satisfeito por esta proposta.
5. **EFEITO**: instalação, serviço Windows, Teknisa, spooler, impressora Epson, reimpressão e cutover continuam bloqueados até aprovação separada e prova de idempotência física. Uma prévia SVG, por mais correta, não prova papel.

## Próxima execução de maior valor

- Revalidar quem pode **autenticar efetivamente** confirmações operacionais e qual canal/custódia existe, reaproveitando antes os mecanismos criptográficos sintéticos V7.57 e contratos atuais; não provisionar um serviço externo nem pagar solução sem ganho provado.
- Testar essa atestação em sandbox com pelo menos um pedido original, observações da mesma revisão e testemunha independente; negativos obrigatórios: revisão trocada, quantidades/itens trocados, outros bloqueios, aprovação revogada e operador não autorizado.
- Integrar somente após teste robusto, executar V2→V6.8 com fontes reais e prévias de três vias, sem emitir papel. Piloto físico Epson e ativação exigirão autorização própria.

**Estado:** `CODE_READY_REVIEW_ONLY`, `TEST_PASS_SYNTHETIC`; `TRUSTED_ATTESTATION=UNKNOWN`; `READY_PROMOTED=NO`; `V68_REAL=NOT_PROVEN`; `PHYSICAL_PRINT=NOT_AUTHORIZED`. DRAFT / HOLD.
