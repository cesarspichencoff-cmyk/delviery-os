# O pronto vira fato — o instante do registro sobrevive à viagem e ao reinício (01/11/2026)

Branch local `claude/deliveryos-pronto-vira-fato-20261101`, base `66e9181b` (ponta publicada da V1,
**sem** o Toqan, cuja branch local segue intacta). Commits: `46a6d36d` (revisão de arquitetura
trazida), `9f7230ed` (reprodução vermelha), `eddba67a` (correção). Sem push, merge, deploy,
instalação, impressão, banco operacional ou ativação.

## 1. O defeito

`ready-orders.ts` grava `created_at` quando a expedição registra o pedido como pronto. Ao associar
o pedido à viagem, a linha sai da fila: em arquivo, pelo `removeByOrderRefs` da fachada; em
PostgreSQL, pelo trigger da migration 0008, na transação da entrega. Nada mais guardava o instante.
O trecho pronto → saída não podia ser reconstruído depois que a viagem nascia.

Dois fatos de contexto decidiram a forma da correção:

- o catálogo público de Entregas já tinha `delivery_ready`, com construtor, e **nenhum produtor**;
- a linha do tempo da viagem (`listTripEvents`) seleciona eventos por `trip_id` da viagem **ou** por
  `delivery_id` das entregas dela. Um fato gravado só com `order_ref` ficaria invisível.

## 2. A correção (produto: +151 −10 em três arquivos)

| Arquivo | Mudança |
|---|---|
| `src/entregas/pilot/pilot-facade.ts` | Ao montar viagem ou acrescentar entrega, lê o registro na fila **do servidor** e passa ao domínio só `order_ref`, `created_at` original e canal. Nada vem do corpo do comando. Recusa `READY_ALREADY_CONSUMED` quando o par exato pedido + instante já virou fato (fila velha depois de queda, ou outro terminal já usou o registro) e tira a linha velha da fila |
| `src/entregas/operational/application-service.ts` | Grava o evento público **existente** `delivery_ready` na **mesma escrita** da entrega: viagem, entrega, evento, outbox e (em PostgreSQL) o consumo da fila confirmam ou caem juntos. `occurred_at` = `created_at` original, byte a byte. Ligado à entrega (`object_id = delivery_id`). Chave idempotente `delivery_ready:<viagem>:<entrega>` |
| `src/entregas/pilot/trip-timeline.ts` | Rótulo "Pronto registrado pela expedição", autor operação |

Conteúdo do fato:

- `payload`: `trip_id`, `order_ref`, `channel`, `ready_kind: "registro_expedicao"`,
  `production_completed_at: null` e `registered_by: null`;
- sem `label`, que pode trazer endereço;
- origem `ops_console`, relógio `trusted` (hora do servidor no registro), sem `actor_id`;
- `source_mode` da outbox = o do piloto, sem padrão.

Regras:

- **Sem registro na fila, sem fato.**
- Instante inválido na fila recusa a viagem (`PRECONDITION_FAILED`) em vez de reformatar.
- O mesmo `order_ref` registrado de novo depois da saída é **outro ato**, com outro instante e
  outra entrega.

Fora do produto: suíte nova, executor de mutações, dois scripts npm e um passo no workflow de CI
(`deliveryos-product-ux.yml`), que só roda quando houver push autorizado. Nenhum guarda e nenhum
caminho congelado foi alterado.

## 3. Decisões e alternativas recusadas

| Alternativa | Por que não |
|---|---|
| Gravar o fato no registro, só com `order_ref` | Invisível na linha do tempo (seleção por `delivery_id`). Fora da transação da fila: em arquivo são dois arquivos, em PostgreSQL um cliente SQL separado. Queda entre as duas escritas = perda ou fato fantasma |
| Evento novo equivalente | Requisito do César e catálogo: `delivery_ready` já existe |
| Copiar `created_at` para um campo novo da entrega | Duas verdades para o mesmo instante; o evento é a fonte |
| Coluna de quem registrou em `entregas.ready_order` | Exige migration. A fila nunca guardou esse dado, então ele fica UNKNOWN (`registered_by: null`). Fica como decisão aberta, se o César quiser |
| Reconciliar a fila por pedido apenas | Inferência. A prova de consumo é o par exato pedido + instante original no log |

## 4. Provas no commit exato `eddba67a`

`test:entregas:ready-fact`: **19/19** depois da correção; **2/19** antes (passavam só os controles
F11 e P3). As outras 17 falhavam com "esperava 1 delivery_ready, achou 0" ou equivalente.

| ID | O que prova |
|---|---|
| F1 | Instante original = `occurred_at`, ligado a D1, visível na linha do tempo antes de "Viagem montada" e de "Saiu para entrega" |
| F2 | Registro ≠ produção; quem registrou fica null; ator da viagem não é atribuído |
| F3 | Reinício: mesmo `event_id`, mesmo instante, uma vez só |
| F4 | `AddDeliveryToTrip` também preserva |
| F5 | Pedido fora da fila não ganha fato |
| F6 | Instante enviado pelo navegador é ignorado |
| F7 | Falha injetada no commit: nada gravado, fila intacta; a nova tentativa usa o instante ORIGINAL |
| F8 | Queda entre commit e limpeza da fila: o fato fica; depois do reinício o mesmo registro é recusado (`READY_ALREADY_CONSUMED`) e a fila é reconciliada |
| F9 | Novo registro do mesmo pedido = outro fato |
| F10 | Endereço do rótulo não vaza (evento, outbox, linha do tempo); outbox `simulated`; modo ausente não vira `real` |
| F11 | Serviço sem fila não fabrica pronto |
| F12 | Instante corrompido: recusa visível, sem viagem e sem fato |
| F13 | Evento autenticado com recibo durável: um fato; reenvio idêntico é `REPLAY_APPLIED` sem duplicar |
| P1–P4 | PostgreSQL 16.15 descartável: mesma transação (fato + consumo da fila); reinício pela linha do tempo; falha no commit sem fato e com fila intacta; linha velha reconciliada |
| H1–H2 | **Processo real do piloto**: pronto por HTTP, viagem e saída. A rota `/api/trip/timeline` devolve o instante original. Depois o processo é derrubado e **outro processo** sobe sobre os mesmos arquivos: mesmo instante, uma vez só |

`test:entregas:ready-fact:mutacoes`: **17/17, cegas 0**. São 1 controle, 15 defeitos devolvidos e 1
restauração byte a byte. Cada defeito reprovou pela prova que guarda a propriedade:

- sem emissão, hora da gravação no lugar do `created_at`, fato só por `order_ref`, linha do tempo
  sem rótulo e chave idempotente por pedido → F1;
- `AddDeliveryToTrip` sem fato → F4;
- registro afirmado como produção e identidade inventada → F2;
- pedido fora da fila com fato fabricado → F5;
- instante do navegador → F6;
- instante corrompido aceito → F12;
- fila consumida antes do commit → F7;
- sem reconciliação → F8;
- rótulo no fato e modo ausente virando `real` → F10.

Regressão no mesmo commit: ver §7.

## 5. O que foi pedido como prova final

O instante de pronto continua disponível depois da criação da viagem e do reinício do piloto:

- **arquivo**: F1 e F3;
- **PostgreSQL**: P1 e P2;
- **processo real com reinício**: H1 e H2. A rota HTTP de linha do tempo devolve `at` igual ao
  `created_at` gravado na fila no registro, antes e depois de outro processo subir sobre os mesmos
  arquivos.

## 6. Obrigações e disposição

| Requisito | Disposição |
|---|---|
| 1. Instante original, distinto de produção concluída | `occurred_at` = `created_at` da fila; `ready_kind`, `production_completed_at: null` (F1, F2, F7) |
| 2. Evento público existente, sem equivalente novo | `delivery_ready` do catálogo 1.1.0; catálogo e envelope intocados (F10) |
| 3. Vínculo unidade + pedido + entrega/viagem, sem associação inventada | `object_id = delivery_id`, `payload.trip_id`/`order_ref`; outbox com `unit_id`; sem fila, sem fato (F1, F5, F9, F10) |
| 4. Duplicidade, reinício, falha de gravação, recuperação; sem perda silenciosa | F3, F7, F8, F12, F13, P3, P4, H2 |
| 5. Linha do tempo por `delivery_id`; `order_ref` sozinho não pode sumir | Seleção verificada em `listTripEvents`; fato nasce na entrega (F1, H1; mutação MR3) |
| 6. Identidade, origem, carimbos, idempotência, real × simulado | Sessão continua a autoridade; instante só do servidor (F6); origem e relógio explícitos; chave por viagem + entrega; `source_mode` do piloto (F10); quem registrou fica UNKNOWN, sem atribuição ao ator da viagem (F2) |
| 7. Reproduzir antes, corrigir a causa, regressão; sem mexer em guardas ou protegidos | Vermelho `9f7230ed` (2/19); correção `eddba67a`; regressão §7; governança e `SEM_FAIL_NOVO` verdes |
| 8. Menor alteração correta | 3 arquivos de produto (+151 −10); ajuste de rótulo incluído porque, sem ele, a linha do tempo mostraria o tipo técnico |

## 7. Regressão no commit `eddba67a`

Árvore limpa em `eddba67a`. Node 22.22, PostgreSQL 16.15 descartável local, Chromium 1243.

| Suíte | Resultado |
|---|---|
| `build` · `typecheck` | verdes |
| `test:entregas:ready-fact` (com PostgreSQL) | **19/19** `READY_FACT_GREEN` |
| `test:entregas` (cadeia inteira) | EXIT 0, **242 linhas OK**, igual à base |
| `real-trip-ui` · `rider-offline` · `rider-bridge` | **13/13 · 10/10 · 31/31** |
| `access-throttle` | verde |
| PostgreSQL: `ready-order` cluster · `pg-uow` cluster · cluster de dois pilotos · cutover de armazenamento | **7/7 · 8/8 · 6/6 · 7/7** |
| `test:platform:governanca` · `run-sem-fail-novo` | GREEN · OK (m1-bridge 40 PASS, C6 preservado) |
| Despacho canônico piloto → plataforma em PostgreSQL | **6/6** |
| `test:platform` | 1 falha **anterior**: `pilot-delegation-issuer.ts` importa Entregas por fora da fronteira autorizada. A saída é idêntica na base `66e9181b` e no HEAD (comparada linha a linha); o arquivo mudou pela última vez em `eabf8ff8`, antes desta entrega |

**Zero falha nova.** A primeira rodada das três suítes de navegador falhou por **ambiente**: o
Playwright procurou o Chromium 1228 e o contêiner tem o 1243. Rodadas de novo no mesmo commit, com
`PLAYWRIGHT_BROWSERS_PATH` apontando links para o 1243, passaram. O CI não rodou, porque não houve
push.

## 8. O que não está provado, e limites

- **Quem registrou o pronto**: resolvido em arquivo em `912352b7` (a sessão vira o `actor_id`). No
  PostgreSQL continua UNKNOWN até existir coluna; a necessidade está demonstrada em §10.2.
- ~~Dois pilotos no mesmo banco consumindo o mesmo registro no mesmo instante~~: **fechado em
  `912352b7`** pela chave por registro e pelo índice único (C3a, C3b, C1, H3; ver §10.1).
- Pedido retirado da viagem e recolocado **sem novo registro** não ganha fato novo. O instante fica
  na primeira entrega, porque não há associação inventada.
- A plataforma ainda não ingere `delivery_ready`: precisa de contrato em
  `docs/contracts/eventos.schema.json`. É o próximo passo, com decisão própria.
- Registro de pronto mede quando a expedição registrou, não quando o pedido ficou pronto. O atraso
  humano do registro é viés declarado.
- Nada rodou em aparelho físico nem em banco operacional. O CI não rodou, porque não houve push.
- A checagem de consumo lê os eventos da unidade (`listAll`), a mesma consulta da linha do tempo.
  O custo cresce com o histórico.

## 9. Reproduzir

```
npm run -s test:entregas:ready-fact
DELIVERYOS_PG_URL=postgres://... npm run -s test:entregas:ready-fact   # com PostgreSQL descartável
npm run -s test:entregas:ready-fact:mutacoes
```

## 10. Segunda etapa: corrida de dois operadores, autor do registro, integridade

O César autorizou o push **só desta branch** e aprovou a correção como candidata de desenvolvimento,
não para operação. Antes do push foram conferidos:

- o diff completo, sem credencial ou dado pessoal nas linhas adicionadas;
- os workflows: nenhum disparava para esta branch.

O gatilho do workflow de produto ganhou esta branch (`bafb1427`). Esse workflow tem
`contents: read`, nenhum segredo, nenhum deploy, PostgreSQL descartável no runner e artefato de
evidências por 14 dias. O workflow Android não foi ligado.

O primeiro push (remoto = `bafb1427`) rodou o CI de produto 41299704591: success, inclusive o
passo "Pronto vira fato".

Commits desta etapa, na mesma branch: `ade08c21` (vermelho), `912352b7` (correção), `465d5a45`
(mutações) e este registro.

### 10.1 A corrida, reproduzida e corrigida

Reproduzido em `ade08c21` sobre o código de `bafb1427`: **18/29**.

| Ambiente | Antes | Causa |
|---|---|---|
| Arquivo, mesmo processo, dois operadores ao mesmo tempo (C1) | as duas viagens nasceram com o mesmo pedido | a fachada serializa os comandos, mas tratava o pedido que já saiu da fila como avulso |
| Processo real, caixa e tablet por HTTP ao mesmo tempo (H3) | idem | idem |
| PostgreSQL, dois processos com o mesmo registro em mãos (C3a) | as duas transações confirmaram, dois fatos | a fila é lida fora da transação, e nada tornava o consumo exclusivo |
| PostgreSQL, segundo processo depois do commit do primeiro (C3b) | virou pedido avulso numa segunda viagem | igual ao arquivo |
| Reenvio de `CreateTrip` depois do reinício (F15) | a viagem foi **sobrescrita** no arquivo (estado e versão) e seus eventos duplicaram | `trips.save` com versão nula sobrescrevia; no PostgreSQL o `INSERT ... ON CONFLICT` já recusava |

Correção (`912352b7`), sem migration:

- **Chave idempotente por registro**: `delivery_ready:<unidade>:<pedido>:<instante original>`.
- **PostgreSQL**: o índice único de `idempotency_key` arbitra entre processos. A segunda transação
  espera a primeira e, sem linha inserida (`RETURNING` vazio), cai inteira, viagem e entrega
  inclusive.
- **Arquivo e memória**: a mesma chave é recusada no armazenamento (F16). Criar viagem com id
  existente não sobrescreve mais (paridade com PostgreSQL, F15).
- **Fachada**:
  - pedido fora da fila cujo registro já virou entrega em andamento é recusado
    (`READY_ALREADY_CONSUMED`);
  - o reenvio do **próprio** comando (mesma viagem e entrega) segue para o recibo ou o domínio
    decidirem (F13, F17);
  - a fila velha é reconciliada.
- **Recusa definitiva**: `READY_ALREADY_CONSUMED` nunca vira "resultado incerto, reenviar" (F18).

Depois da correção: **29/29**, com as mesmas provas.

### 10.2 Quem registrou o pronto

- O servidor amarra cada requisição à sessão autenticada (`withActor`). Essa sessão fica gravada na
  fila (`registered_by: {actor_id, role}`) e vira o `actor_id` do `delivery_ready`, que é o campo de
  autoria que todo evento do console já usa. Nunca é o operador que monta a viagem (F2, MR16).
- A identidade **não** vai para o evento público. O adaptador público não copia `actor_id` de
  entrega, e F2 confere que o operador não aparece na outbox (privacidade; Lei 4).
- Quem preparou continua desconhecido: `prepared_by: null`, `ready_kind: "registro_expedicao"`,
  `production_completed_at: null` (F2, MR7, MR17).
- **PostgreSQL**: a tabela `entregas.ready_order` (migration 0007) tem só `unit_id`, `order_ref`,
  `label`, `channel` e `created_at`, e `PgPilotReadyOrderStore.add` grava exatamente isso. Nenhum
  outro registro durável no banco liga o ato de registrar a uma sessão:
  - `domain_event` só nasce na entrega;
  - o log operacional é por processo e não é durável;
  - `label` é texto mostrado no console;
  - `platform.event_log` exigiria produtor novo sem contrato.

  Por isso, no PostgreSQL, o autor fica UNKNOWN (`actor_id` nulo, P5) até existir a coluna
  `registered_by_actor_id TEXT NULL` (migration aditiva). **A necessidade está demonstrada; a
  migration não foi criada**, porque não está autorizada.

### 10.3 Integridade do horário e do evento

| Situação | Provas |
|---|---|
| Falha de gravação | F7: commit cai, nada gravado, fila intacta, nova tentativa com o instante ORIGINAL. P3 (PostgreSQL) |
| Reenvio | F13: evento autenticado → `REPLAY_APPLIED`. F14: comando legado → `DUPLICATE_COMMAND`. F18: rival pelo caminho com recibo → recusa definitiva |
| Recuperação | F8: fila velha reconciliada. F17: queda depois do commit + reinício + reenvio idêntico → replay, um fato, fila limpa. P4 (PostgreSQL) |
| Reinício | F3. F15: reenvio depois do reinício recusado, viagem intacta. H2: processo real. P2 (PostgreSQL) |

### 10.4 Provas no código final `465d5a45`

- `test:entregas:ready-fact`: **29/29** (19 em arquivo, 7 em PostgreSQL, 3 com o processo real).
  Antes da correção: **18/29**.
- `test:entregas:ready-fact:mutacoes`: **25/25, cegas 0**, com PostgreSQL. São 1 controle, 23
  defeitos devolvidos e 1 restauração. Cada defeito reprovou pela prova que guarda a propriedade.
  MR20 (arbitragem do PostgreSQL) **exige** o banco: sem `DELIVERYOS_PG_URL` ela conta como não
  medida, nunca como aprovada.
- Regressão: no mesmo commit, com a árvore limpa:

| Suíte | Resultado |
|---|---|
| `build` · `typecheck` | verdes |
| `test:entregas` | **242 linhas OK**, igual à base |
| `real-trip-ui` · `rider-offline` · `rider-bridge` | **13/13 · 10/10 · 31/31** |
| `access-throttle` | verde |
| PostgreSQL: cluster `ready-order` · cluster `pg-uow` · dois pilotos · cutover · despacho canônico | **7/7 · 8/8 · 6/6 · 7/7 · 6/6** |
| Governança · `run-sem-fail-novo` | GREEN · OK (m1-bridge 40 PASS) |
| `test:platform` | só a falha anterior (§10.5) |

**Zero falha nova.** As suítes de navegador rodaram com `PLAYWRIGHT_BROWSERS_PATH` apontando links para o Chromium 1243 do contêiner.

### 10.5 `test:platform`: falha anterior, separada

A suíte acusa 1 falha: `src/platform/auth/pilot-delegation-issuer.ts` importa Entregas por fora da
fronteira autorizada. A saída foi comparada linha a linha e é idêntica na base `66e9181b` e nesta
branch; o arquivo mudou pela última vez em `eabf8ff8`. Não é regressão desta entrega. Ela também
**não** permite dizer que a plataforma esteja aprovada por inteiro: a suíte segue vermelha por esse
motivo.

### 10.6 Pendências

- **Autor no PostgreSQL**: precisa de coluna em `entregas.ready_order`, o que é decisão do César.
- **A plataforma não ingere `delivery_ready`.** O consumidor de Entregas da plataforma, que só existe
  em LAB, isola o evento como "tipo sem equivalência segura" e não grava fato. Ver §10.7.
- Nada rodou em aparelho físico nem em banco operacional. O workflow Android não foi ligado, porque
  esta entrega não toca Kotlin.
- A checagem de consumo da fachada lê os eventos da unidade, a mesma consulta da linha do tempo. O
  custo cresce com o histórico.
- O atraso humano do registro de pronto é viés declarado: o fato mede quando a expedição registrou,
  não quando o pedido ficou pronto.

### 10.7 Próxima integração mínima para o Copiloto consumir o fato

Hoje o caminho existente é: outbox pública do piloto → `CommittedOutboxEntregasEventFeed` →
`EntregasLiveConsumer` (LAB, provado no CI pelos passos 50 e 51) → `platform.event_log` → projeção
`lerRealidadeDeEntregas` → `copilotoEntregasLeitura`. Ele para no adaptador, cuja tabela segura só
aceita fatos de **viagem**. O menor passo que faz o fato chegar ao Copiloto, sem produtor novo e sem
inventar estado de viagem:

1. **Contrato próprio** do registro de pronto na plataforma: tipo e schema em
   `docs/contracts/eventos.schema.json`, com produtor = a outbox pública já atestada e consumidor
   declarado. Fato por entrega, que não muda o estado da viagem.
2. **Mapeamento** no adaptador de Entregas (`entregas-shadow-adapter.ts`) só com esse contrato,
   preservando `source_mode`, `trip_id`, `delivery_id` e o instante original.
3. **Projeção**: `lerRealidadeDeEntregas` passa a expor "prontos aguardando saída" (quantidade e
   idade do mais antigo) e o trecho pronto → saída por entrega, como FATO com modo. Tudo provado
   pelos mesmos LAB do CI (outbox → plataforma → leitura).
4. **Copiloto**: mostrar essa leitura toca `src/product/viewmodels/` e `src/product/ui/`, caminhos
   protegidos pelo envelope M1. Isso exige exceção específica do César e não entra sem ela.

Os passos 1 a 3 cabem numa branch isolada, com testes, sem tocar o Copiloto. O passo 4 é a decisão
de produto.
