# Delivery OS — continuidade independente: integridade dos eventos próprios
**Data:** 2026-11-03 (BRT)  
**Escopo:** ITAIM; Copiloto central e Entregas como módulo operacional.  
**Status:** CÓDIGO EM REVISÃO / HOLD OPERACIONAL. Não é instalação, deploy ou prova de uso em campo.

## Decisão de produto
A V1 prossegue pela cadeia própria de fatos `Entregas → eventos públicos → Copiloto`, com histórico de Trip, offline/reenvio e identidade explícita por unidade e modo de origem. Nenhuma conta, API comercial, licença, provedor externo ou coletor novo foi ativado. A rota não introduz infraestrutura adicional nem reabre fontes externas suspensas.

Manter a autoridade de `docs/product/DELIVERYOS_CANONICAL_SOURCE_INDEX.md`: a Home/Copiloto é o produto central; Entregas é um módulo. `SimulatedCopilotoConsumer` permanece *simulado* e não autoriza consumo ao vivo.

## Descoberta transversal (somente mecanismos; nenhum código de terceiros incorporado)
1. Android offline-first: fonte local observável é o dado primário da interface; Room + sincronização durável do WorkManager são mecanismos existentes que devemos reforçar, não substituir. Fonte: https://developer.android.com/topic/architecture/data-layer/offline-first
2. Sistemas distribuídos: um pedido/evento reenviado pode ter sido processado antes de uma falha na resposta; é necessário receptor idempotente, distinção entre repetição legítima e colisão de identidade. Fonte: https://martinfowler.com/articles/patterns-of-distributed-systems/idempotent-receiver.html
3. Sincronização: WorkManager deve usar trabalho único para evitar duplicidade; duração/conectividade restringem a cadência. Fonte: https://developer.android.com/develop/background-work/background-tasks/persistent/how-to/manage-work
4. SQLite WAL: atomicidade e concorrência local são úteis, mas WAL não é compartilhamento entre máquinas por arquivo de rede. Não migrar o banco nem criar outra camada enquanto a implementação atual não demonstrar uma lacuna. Fonte: https://www.sqlite.org/wal.html
5. Projeto aberto RouteSync foi observado como *exemplo de arquitetura* Room + WorkManager para entregadores; projeto de disciplina, não tecnologia validada ou dependência adotada. Fonte: https://github.com/JoaoRey/RouteSync

**Difference Check:** o projeto já contém Room, WorkManager, outbox, eventos públicos, idempotência e isolamento. Portanto a próxima unidade de trabalho NÃO é adicionar Kafka/NATS, replicação, mapas, scanning, serviço, biblioteca externa ou uma segunda camada de histórico; é corrigir a integridade do consumidor existente.

## Alterações nesta branch (revisáveis)
- `src/entregas/contracts/consumers/SimulatedCopilotoConsumer.ts`:
  - torna o evento aplicado um snapshot canônico isolado da referência do emissor, sem guardar bytes brutos inválidos;
  - mesmo `idempotency_key` com conteúdo diferente: quarentena em vez de descartar silenciosamente; `event_id` duplicado com outra chave: quarentena;
  - eventos cíclicos ou acima do limite não chegam à validação recursiva; objetos não-JSON, instâncias especiais e entradas não serializáveis recusam;
  - num lote, o primeiro evento inválido/conflitante impede avanço do cursor além dele;
  - ao reiniciar somente com cursor, esconde tanto eventos aplicados parciais quanto a projeção da Trip; para reconstituir o histórico, exige replay desde o início (ou, futuramente, estado durável atestado).
- `src/entregas/contracts/consumers/run-replay-integrity-tests.ts`: 22 cenários executáveis escritos: reenvio, colisão, unidade/modo, privacidade, payload gigante/cíclico, imutabilidade, reinício e lote interrompido.

**Checkpoint de execução local real (03/11, bancada isolada Foxxy):** o texto histórico anterior sobre testes não executados foi supersedido pelos resultados abaixo. O workflow GitHub Actions NÃO foi expandido, porque a tentativa anterior foi bloqueada; não atribuir estas provas a CI.

- **Commit-base testado:** `5f756ec752458f3be74add875c7e9c33bdaa26d9`, worktree `C:\\Users\\italo\\comandas-v2-foxxy-isolated-20261103\\deliveryos-pr137-qa-20261103-1906` no Foxxy, destacado e separado do Windows comercial. A branch de revisão avançou paralelamente com arquivos independentes; reconciliar HEAD/diff antes de promoção.
- **Nova suíte de Replay do Copiloto:** `OWN_COPILOT_REPLAY_CONTRACT_PASS 22/22`, processo Node encerrado normalmente, evento fictício apenas.
- **Regressão Gate Close Copiloto ↔ Entregas:** `15 gate-close tests OK`, sem falhas após completar a genealogia Git exigida pelo manifesto de contratos. A primeira tentativa falhou por checkout Git raso/commit ancestral ausente; após `git fetch --unshallow --filter=blob:none` (sem alterar código), `merge-base --is-ancestor` retornou 0 e todos os 15 testes passaram.
- **Feed durável nativo:** `ENTREGAS_DURABLE_FEED: 9/9 PASS`, incluindo arquivo de commit, reabertura, cursor ausente e estado simulado.
- **Novo ensaio integrado:** `OWN_COPILOT_DURABLE_RECOVERY_PASS 11/11`. Lê uma outbox de eventos sintéticos com armazenamento descartável; comprova invisibilidade antes do commit, reconstrução integral após replay, rejeição de cursor desconhecido, atualização por commit tardio e nenhuma duplicação do histórico de viagem. A pasta de dados de teste é destruída ao final.
- **TypeScript estrito:** `tsc --noEmit --strict --target ES2021 --module commonjs --moduleResolution node --esModuleInterop --skipLibCheck` executado para os dois arquivos de teste e suas dependências, usando TypeScript já presente no Foxxy; exit code 0. Não equivale ao typecheck de **todo** o monorepo.
- **Publicação da nova suíte integrada:** `src/entregas/contracts/consumers/run-owned-durable-recovery-tests.ts` no commit `76e5311e3ccc0ebb44f302d9aa32a8435e84db97`. Conteúdo publicado foi comparado byte-equivalente com o arquivo ensaiado (normalização de fim de linha).

**Veredito de prova desta etapa:** 22 + 15 + 9 + 11 = **57 cenários executados e aprovados em Windows Foxxy isolado**; compilação estrita focal aprovada. `CODE_READY=PARTIAL`; `TEST_PASS_LOCAL_FOXXY=YES`; `TEST_PASS_CI_FOR_NEW_TS=NOT_ATTESTED`; `DEPLOYED=NO`; `WORLD_PROVEN=NO`; `HUMAN_ACCEPTED=NO`. O Windows do caixa, API comercial, GPS, impressora e pedidos reais não foram usados.

## Próximo gate controlado
1. Obter execução independente do `npx tsc --noEmit` e `npx tsx src/entregas/contracts/consumers/run-replay-integrity-tests.ts` com as dependências travadas do repositório; corrigir falhas no mesmo HEAD.
2. Comparar com suíte já existente de `run-gate-close-tests.ts` e `run-durable-event-feed-tests.ts`; provar ausência de regressões e uso de contrato público imutado.
3. Preparar snapshot/checkpoint durável do consumidor **sem ativá-lo**. Exercitar queda de rede, conflito entre aparelhos, cursor truncado, replay e referências de Trip sem identidade forte em laboratório.
4. Validar os controles reais de Android, HTTPS/autenticação por ator, consentimento GPS, retomada sem duplicação e apresentação física no Itaim, com operador e efeito controlado.
5. Só depois considerar piloto do Copiloto em leitura e liberação; não transformar eventos simulados em operação sem proveniência.

**Efeito operacional desta alteração:** nenhum. Sem merge, deploy, instalação, GPS real, bancos/serviços do caixa, impressão ou reativação de tarefas antigas.


## Checkpoint adicional — duas filas locais e falhas de gravação (03/11/2026)

**SHA testado integralmente:** `8a4336d5588a26ac7087a8070730a603d6dde751` da branch `feat/gestor-shadow-observer-20261103`; worktree isolado Foxxy `C:\\Users\\italo\\comandas-v2-foxxy-isolated-20261103\\deliveryos-offline-qa-20261103-1906` (checkout detached, sem alterar o caixa).

**Mudança de risco fechada no código, em laboratório:** `src/entregas/offline/queue.ts` agora trata uma fila ilegível, schema desconhecido e registros de outro `device_id` como HOLD somente de leitura, sem permitir sobrescrever o original. Bloqueia gravação por instância obsoleta que detectou uma imagem externa diferente. Reenvios equivalentes são idempotentes, mas identidade repetida com dados de negócio divergentes falha `OFFLINE_IDEMPOTENCY_COLLISION`. ACK positivo tardio não sobrepõe conflito ou dead letter; falha de transporte tardia não reabre item sincronizado. Exposição via `storageHealth()` é apenas API de código — a interface ainda precisa mostrar HOLD. Enqueue/consultas/lotes retornam cópias, impedindo alteração por referência. Se a escrita falhar, vier parcial ou não puder ser lida de volta, o estado em memória é restaurado ao último snapshot confirmado e fica em HOLD: nunca chamar uma intenção não persistida de evento salvo.

**Prova por suíte:** 
- `run-offline-tests.ts`: **29/29**, incluindo novas falhas de disco, escrita parcial, dispositivo divergente, alteração externa, colisões e ACKs fora de ordem;
- `run-two-device-convergence-tests.ts`: **14/14**, dois storages fictícios distintos, ACK perdido, reenvio, reinício, reconexão parcial, um servidor **simulado em memória**, convergência de Trip, quarentena de divergência e persistência de conflito;
- `run-outbox-persistence-tests.ts`: **6/6**;
- `run-durable-event-feed-tests.ts`: **9/9**;
- `run-replay-integrity-tests.ts`: **22/22**;
- `run-owned-durable-recovery-tests.ts`: **11/11**;
- `run-gate-close-tests.ts`: **15/15**.
**TOTAL = 106/106 testes executados e aprovados no mesmo commit**; execução Windows Foxxy, com transpile TypeScript para CommonJS em memória usando TypeScript disponível na máquina. `tsc --noEmit --strict --target ES2021` focal sobre os 4 principais arquivos de teste e dependências passou com exit code 0. Estas provas não equivalem ao typecheck de todo o repositório, CI completa ou teste em aparelho.

**Limitação essencial:** a comparação da imagem lida antes da escrita é **otimista, não é compare-and-swap atômico**; não resolve corrida simultânea entre duas abas/processos que gravem a mesma chave. Uma implementação operacional precisa de escritor único ou transação/controle concorrente real por armazenamento. Os dois dispositivos no ensaio são instâncias fictícias de `OfflineQueue` com armazenamentos independentes; o receptor é `SimulatedCopilotoConsumer`, não API de backend liberada nem sincronização física. O Android Room e a autenticação HTTPS real não foram exercitados. Não usar os resultados para prometer sincronização entre dois celulares de produção.

**Gates seguintes, sem ordem comercial externa:** conectar `storageHealth()` à sinalização de HOLD da interface do motoboy (sem ativação); validar armazenamento transacional ou escritor único por contexto; provar reenvio em backend próprio com identidade/autorização por ator e dispositivo; executar testes físicos autorizados de perda de rede, revogação GPS, logout/relogin e janela do caixa. PR permanece DRAFT/HOLD; nenhuma tarefa Windows interferente, serviço real, impressora, API de terceiro, GPS físico, deploy ou merge foi ativado.
