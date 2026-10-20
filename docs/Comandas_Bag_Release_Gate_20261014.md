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

## Ferramenta para o portão seguinte: origem das observações (15/10)

- `tools/comandas_ten_v68_note_scope_audit_v1.cjs` é auditoria LOCAL read-only, não um novo leitor nem um classificador de texto. Parâmetros de CLI: `node tools/comandas_ten_v68_note_scope_audit_v1.cjs <manifesto-privado-original> <diretorio-eventos-originais> <diretorio-decisoes-v1-originais>`.
- O manifesto privado original deve conter os dez pares com SHA-256 de cada evento/decisão; nunca inserir esses dados operacionais no repositório, na Issue ou nos logs públicos. Antes de executar no host de origem, provar instalação autorizada apenas em pasta isolada e ausência de efeitos no serviço.
- O gate confere 20 arquivos imutáveis, 10 snapshots exatos, autorreferência de hash do watcher e `join_proven` das notas. Emite exclusivamente CONTAGENS de `DSOBSCOMANDA` (ordem geral), `DSOBSDESCIT`/`DSOBSPEDDIGCMD` (item delivery) e `TXPRODCOMVEN` (item produção), mais número de pedidos por tipo; não imprime texto, nome, número do pedido ou hash.
- Resultado `REVIEW_REQUIRED_FOR_GENERAL_NOTES` indica pendência de relevância operacional, NÃO aprovação para excluir observações. Resultado `NO_GENERAL_NOTES_V68_STILL_UNPROVEN` também NÃO libera V6.8 sem prova independente da mesma revisão.
- Testes sintéticos e adversariais: `tools/verificar_comandas_ten_v68_note_scope_audit_v1.cjs`. A prova sobre os dez pedidos originais fica PENDENTE enquanto CAIXA_MOOCA estiver inacessível, sem presumir que 12 observações sejam todas gerais.
- Não executar reprocessamento com efeitos, não remover nota para passar no gate, não criar aprovação sintética do operador e não considerar esta contagem como tickets finais.

## Checkpoint V8.47 — metadados reais de 14/10, auditados somente em leitura em 20/10

**Fonte observada:** `CAIXA_MOOCA`, arquivos de `state/reader-events-v1` e `state/reader-shadow-decisions-v1`. O dispositivo esteve conectado durante a auditoria; isso não garante conectividade futura. Foram usados somente `list_directory` e processos Node de leitura local, sem modificar arquivos e sem executar o consumidor, serviço, SQL ou spooler. Nenhum texto de observação, nome de cliente, identificador de pedido ou hash individual foi exportado. O critério temporal **foi a data de modificação do arquivo no Windows (14/10/2026)**, e todos os eventos incluídos também tinham `DTHRABERMESA` daquela data.

**Provas limitadas por metadados e leitura de JSON:**
- Arquivo completo: 5.952 nomes de evento com decisão de mesmo nome-base, mais um nome não canônico na pasta de decisões. Não é prova de que cada decisão contém o mesmo conteúdo da respectiva origem.
- Recorte de 14/10: **391 pares de arquivos**, mas apenas **223 chaves de pedido distintas** (55 com uma revisão; 168 com duas). Nos 391 pares, chave nativa, vínculo básico da revisão e nomes de arquivos coincidiram; não se executou a auditoria criptográfica integral de dez pares imutáveis.
- Observações: **390 revisões com nota geral**, correspondentes a **222 pedidos distintos**; **129 revisões com nota de item**. Havia **165 pares `DSOBSPEDDIGCMD`/`TXPRODCOMVEN` com texto literalmente igual no mesmo evento**, zero divergência neste recorte; isso **não é** fonte independente para V6.8. Nenhum texto foi exibido.
- Decisão de origem: **24 revisões, 14 pedidos distintos** com `BAG_SIZE_NOT_FACT` como único bloqueador. Havia também 17 revisões `ready=true` referentes a nove pedidos; `ready` legado não é autorização V6.8 nem impressão.

**Difference Check das quatro composições B1/B5/B8/B9:** fazendo comparação local exata de códigos e quantidades dos 14 pedidos com bloqueio exclusivo, sem alterar regra nem calcular sacola, **nove pedidos** encaixaram no matcher estrito já documentado: **B1×6, B5×1, B8×1, B9×1**. Entre os cinco não encaixados, **um** tinha `TEMAKI DE BARRIGA DE SALMAO` (`9.60.00.010.00`) + `HOSSOMAKI DE SALMAO` (`9.55.00.000.00`). O matcher anterior restringe a família TEMAKI ao código `9.60.00.000.00` (`TEMAKI DE SALMAO`). **Hipótese, não autorização:** essa composição pode corresponder ao segundo B9 mencionado na confirmação humana (que registra genericamente `TEMAKI + HOSSOMAKI_OU_URAMAKI`). Não ampliar B9 automaticamente nem afirmar que esse é um dos dez originais até identificar o manifesto original imutável e confirmar o escopo humano. Os outros quatro casos fora das quatro regras continuam não classificados **nesse recorte específico**, sem conclusão sobre regras B2–B15.

**Resultado operacional:** o acesso à pasta de origem e a auditoria agregada são **WORLD_OBSERVED_READONLY**; a prova de **dez pares originais exatos**, o texto/relevância das notas gerais, o vínculo independente Delivery/Produção, a sacola liberada e as três vias físicas continuam **UNKNOWN/HOLD**. O CI da PR valida scripts sintéticos, não os dez pedidos reais. Não houve `merge`, `deploy`, escrita no CAIXA, autorização de impressora, reimpressão ou mudança de turno. **Próximo ganho material:** localizar o manifesto privado original que identifica as dez revisões, executar a auditoria existente sem exportar observações e decidir a variante B9 com autoridade humana apenas se o caso exato estiver naquele manifesto; não criar uma nova arquitetura de aprovação.

### Complemento V8.47 — reconstrução dos hashes internos no host, sem exportação

No mesmo recorte dos 391 pares de 14/10, uma verificação posterior **reconstruiu os SHA-256 dos 391 snapshots de evento a partir dos campos canônicos do watcher V2**, incluindo as observações no formato exato; **391/391 coincidiram** com `snapshot_hash`. De maneira independente no código de auditoria, foram reconstruídos os fingerprints internos da decisão V1 pelos campos do contrato: **391/391 coincidiram**; 0 campos faltantes, 0 divergências `order_key` e 0 divergências do eco de `service_resolution`. Saída restrita a contagens; sem imprimir notas, nomes, pedido ou digest. Somente leitura local, sem rodar consumidor, SQL, serviço nem spooler.

**Limite:** hashes e fingerprints recalculados do próprio par provam *consistência criptográfica interna dos arquivos observados*, **não autenticidade externa, cadeia de custódia independente, nem os hashes de arquivo de um manifesto privado original de dez pares**. Não promova `V68_REAL`, sacolas, notas gerais ou impressão por causa desses resultados. A localização/validação do manifesto original e das projeções independentes permanece pendente.
