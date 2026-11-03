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
  - eventos cíclicos ou acima do limite não chegam à validação recursiva; entrada não serializável recusa;
  - num lote, o primeiro evento inválido/conflitante impede avanço do cursor além dele;
  - ao reiniciar somente com cursor, não apresenta uma Trip parcial como completa; para reconstituir o histórico, exige replay desde o início (ou, futuramente, estado durável atestado).
- `src/entregas/contracts/consumers/run-replay-integrity-tests.ts`: 20 cenários executáveis escritos: reenvio, colisão, unidade/modo, privacidade, payload gigante/cíclico, imutabilidade, reinício e lote interrompido.

**Limite atual de evidência:** as alterações e os 20 testes estão persistidos e foram inspecionados estaticamente. A tentativa de ampliar o workflow de Actions foi recusada pela ferramenta; **não foi aplicada**. Sem execução efetiva `tsx` ou `tsc` para esse novo código, não declarar `TEST_PASS` nem 10/10. O workflow antigo de laboratório, se verde, não testa automaticamente este módulo TypeScript.

## Próximo gate controlado
1. Obter execução independente do `npx tsc --noEmit` e `npx tsx src/entregas/contracts/consumers/run-replay-integrity-tests.ts` com as dependências travadas do repositório; corrigir falhas no mesmo HEAD.
2. Comparar com suíte já existente de `run-gate-close-tests.ts` e `run-durable-event-feed-tests.ts`; provar ausência de regressões e uso de contrato público imutado.
3. Preparar snapshot/checkpoint durável do consumidor **sem ativá-lo**. Exercitar queda de rede, conflito entre aparelhos, cursor truncado, replay e referências de Trip sem identidade forte em laboratório.
4. Validar os controles reais de Android, HTTPS/autenticação por ator, consentimento GPS, retomada sem duplicação e apresentação física no Itaim, com operador e efeito controlado.
5. Só depois considerar piloto do Copiloto em leitura e liberação; não transformar eventos simulados em operação sem proveniência.

**Efeito operacional desta alteração:** nenhum. Sem merge, deploy, instalação, GPS real, bancos/serviços do caixa, impressão ou reativação de tarefas antigas.
