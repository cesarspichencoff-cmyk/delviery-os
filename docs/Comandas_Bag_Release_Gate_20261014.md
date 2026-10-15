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

## Portão adicional — assinatura Ed25519 de laboratório (15/10)

Arquivos: tools/comandas_bag_attestation_v1.cjs e tools/verificar_comandas_bag_attestation_v1.cjs.

- **Entrada:** evento e decisão V2, ledger humano já conferido e declaração assinada ligando hash do pedido, snapshot, fingerprint da decisão, blob do ledger, caso, tamanhos, quantidade, operador, prazo e nonce.
- **Proteção adicional:** assinatura Ed25519, chave pública e hash da chave de um contexto separado, revogação do nonce/snapshot, tempo estrito e rejeição de divergência.
- **Teste:** 106 afirmações sintéticas PASS em Foxxy via WSL2/bwrap sem acesso ao disco C: ou rede externa. Chaves efêmeras exclusivamente de teste em memória, nenhuma chave operacional criada.
- **Mesmo com assinatura verificada:** status SIGNED_SHADOW_REVIEW_MATCH_NOT_OPERATIONAL; custody_proven=false; operator_authenticated=false; operational_authority=false; ready_override=false; v68_authorized=false; print_authorized=false.
- **Não confundir:** assinatura sob contexto simulado comprova somente o funcionamento criptográfico. Uma chave pública fornecida no mesmo envelope, JSON autodeclarado ou aprovação escrita pelo próprio assistente não comprova autoridade humana independente.
- **Diferença corrigida em 15/10:** comentário/revisão comum no GitHub NÃO serve, sozinho, como atestação de ação humana independente: o conector consegue publicar ações sob o mesmo autor da conta de César. A API não prova o canal UI humano; revisões da própria PR de autoria do usuário também não resolvem automaticamente essa custódia. Não tratar comentário, commit, reação ou review por esse token como autorização operacional.
- O consumidor V2 V7.14 continua inalterado, e o teste novo roda pelo mesmo CI offline.

**Próximo portão:** validar custódia/identidade de aprovação independente, evitar retroagir autorização a pedidos anteriores; só depois executar uma variante V2 de shadow e o contrato independente V6.8. Sem gastos, corte de serviço, merge, spooler ou impressão.

## Contra-rota mínima: política humana versionada + autorização de efeitos separada (15/10)

**Diferença em relação à rota anterior:** assinatura de laboratório e aprovação via comentário GitHub não removem o bloqueio de origem da autorização. Continuar expandindo esse mecanismo seria mais complexidade sem redução de risco real.

1. **Regra de produto (conteúdo aprovado):** conservar B1–B15/C1/C4/D1 e as quantidades confirmadas no ledger `human-validations-cesar-20261014.review.json`. A seleção já é exata e testada por `human_review_v1.cjs`, sem generalização de SKU/quantidade. A eventual regra estática deve ser versionada e revisada por César **como mudança de política**; não reutilizar override dinâmico de pedido anterior.
2. **Caminho até V2:** construir/testar uma variante apenas offline que aplique regras estáticas exatas, preserve hash e observações do evento e retenha outros bloqueios. A referência humana do ledger não autoriza automaticamente `ready=true` ou `FACT` operacional. Uma decisão liberada exige política efetivamente aprovada, testes de regressão e contrato de liberação.
3. **Bloqueio independente das notas no V6.8:** `projectVerifiedReaderPairV68` exige prova separada para `DSOBSCOMANDA` antes de tickets. Em `stableReaderShadowPairV68.ts`, `WATCHER_V2_ORDER_NOTE_REQUIRES_OPERATIONAL_RELEVANCE_PROOF` é incondicional quando há nota geral; o helper `inspectOrderNoteDispositionClaimV77` não concede autorização. Não inferir das **12 observações** dos dez pedidos reais quantas são gerais/de item: a contagem por escopo ainda é UNKNOWN.
4. **Próxima leitura quando CAIXA_MOOCA voltar:** contabilizar `scope_hint=order` versus `item` dos dez snapshots (somente números e hashes, nenhum texto); conferir por revisão as fontes independentes delivery/produção/plano/produtos. Para cada nota geral, exigir revisão de relevância por César **sem descartar conteúdo**. Nenhum retorno `ready=true` do V2 contorna esse requisito.
5. **Efeito final separado:** mesmo com a política e prévia V2→V6.8 aprovadas, o piloto Epson, controle de duplicação, serviço e cutover ficam sujeitos a autorização expressa separada e a evidência em papel/rollback.

**PR #107:** manter DRAFT/HOLD. Não abrir nova frente de blockchain/assinaturas/chaves, nem instalar serviço, nem repetir pesquisas genéricas. Próximo delta precisa remover um bloqueio verificável de V2 ou V6.8.
