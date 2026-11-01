# Pronto: estado atual e trajetória, duas leituras independentes (01/11/2026)

Branch **local** `claude/deliveryos-pronto-leituras-20261101`, criada sobre `de5bed3e` (ponta publicada
de `claude/deliveryos-pronto-vira-fato-20261101`). Sem push, merge, deploy, instalação ou mudança na
operação. Ficam fora desta etapa: Copiloto protegido, Home, migração de autoria no PostgreSQL e Toqan.

## 1. A correção de conceito

O `delivery_ready` é gravado **quando o pedido entra na viagem**. Ele preserva, para trás, o instante
original do registro de pronto. Por isso reconstrói a trajetória, mas sozinho **não enxerga** o pedido
que continua na fila. Daí duas leituras, que não se misturam.

| Leitura | Pergunta | Evidência |
|---|---|---|
| **Estado atual** | O que está esperando agora? | **Na fila**: a própria fila (`entregas.ready_order`), lida sem o rótulo; a fila não guarda modo, então o grupo é `nao_declarado` e nunca vira real. **Aguardando saída**: `delivery_ready` cuja viagem não tem `trip_started` e cuja entrega não tem `delivery_removed` |
| **Trajetória** | O que aconteceu com cada pedido? | Só fatos duráveis e vínculos provados (mesma viagem, mesma entrega). `registrado_em` = `occurred_at` do `delivery_ready` (relógio do servidor, no registro); `associado_em` = `public_recorded_at` (relógio do servidor, na transação da associação); `saiu_em` = `trip_started.occurred_at` (relógio de quem confirmou) |

Regras:

- **Sem dupla contagem.** Uma linha velha da fila que tem o mesmo registro (pedido + instante original)
  de um fato sai da fila e é contada em `fila_velha`.
- **Ausência não é zero.** Fonte indisponível sai como `indisponivel`, com total `null`. Fila lida e
  vazia é zero **observado**. Retirado da viagem sem registro novo vira `retirados_sem_novo_registro`:
  paradeiro desconhecido, sem sumir.
- **Ordem entre associação e saída.** Quem decide são os carimbos do **servidor**; o relógio do
  aparelho só fornece o valor.
  - Viagem que saiu antes de a entrega entrar nela: `associado_depois_da_saida`, sem saída inventada.
  - Retirada antes da saída: `retirado_antes_da_saida`, sem herdar a saída da viagem.
  - Intervalo negativo: vira `inconsistente`, com motivo, e o número não é publicado.
- **Modo e chegada.** Real e simulado nunca se somam. Fato sem modo fica fora e é contado.
  Fato de outra unidade não entra. A ordem de chegada não muda o resultado: o cálculo é sobre conjuntos.

## 2. O que mudou

Produto: +138/−8 nos arquivos existentes e dois módulos novos (533 + 33 linhas).

| Arquivo | Mudança |
|---|---|
| `docs/contracts/eventos.schema.json` | Contratos de `delivery_ready` e `delivery_removed`, cada um com produtor (o adaptador da outbox pública) e consumidores (a leitura e o consumidor assíncrono). Chave idempotente por registro. Retenção de 3 meses, pela decisão de 01/11 (eventos por 90 dias). Payload com campos obrigatórios |
| `src/platform/contracts/event-catalog.ts` | Os dois tipos entram no catálogo (13 tipos) |
| `src/platform/ingest/entregas-shadow-adapter.ts` | Tabela própria para fatos **da entrega**. Payload por lista explícita: `delivery_id`, `order_ref`, `public_recorded_at`, `ready_kind`, `channel`. Nunca rótulo, endereço, motivo livre ou autor. Sem `delivery_id` ou `order_ref`, o fato não entra. Um sinal `delivery_ready` solto, sem a semântica de registro, continua "sem equivalência segura" (é o contrato dos testes de laboratório do CI) |
| `src/platform/runtime/handler-trajetoria-pronto.ts` (novo) | Consumidor assíncrono que reconhece as duas mensagens sem guardar estado nem projetar viagem. Recusa tipo errado |
| `src/platform/bin/async-runtime.ts` | Liga esse consumidor ao lado do da Operação Viva. Sem ele, as mensagens iriam para dead-letter |
| `src/platform/leitura/prontos-de-entregas.ts` (novo) | As duas leituras puras e o leitor PostgreSQL somente-leitura (`REPEATABLE READ, READ ONLY`, com savepoints). Fila indisponível não derruba a leitura dos fatos |
| `src/platform/ingest/ingest-service.ts` | Só o comentário: 13 tipos declarados, 11 com consumidor |

**A viagem não muda.** A Operação Viva continua consumindo só `TIPOS_DA_OPERACAO_VIVA` (9 tipos), e os
dois tipos novos não estão nela. Provas: V1 (projeção idêntica), W3 (viagem com estado e eventos só dela)
e a evidência do fluxo (§4).

Guardas atualizadas **de propósito** porque o contrato mudou (contagens fixas):

- `run-event-contract-tests.ts`: de 9 para 11 tipos com contrato;
- `run-bridge-tests.ts`: de 11 para 13 tipos no catálogo, com os dois conferidos na lista.

Nenhum caminho congelado do M1 foi tocado (medido com a regra do próprio guarda; 15 pathspecs).

## 3. Provas

`test:platform:pronto-leituras` (`src/platform/run-pronto-leituras-tests.ts`):

- vermelho em `dc99255a`, antes de qualquer contrato: **4/24**. Passavam só as guardas que já valiam
  e precisam continuar valendo: A3 (sem vínculo não entra), A4 (mapeamento de viagem igual), V1 e W3
  (viagem intocada);
- **a suíte final (26 provas) contra o código de produto de `de5bed3e`: 4/26**, numa árvore separada
  com só o produto revertido; passam as mesmas quatro guardas;
- depois da correção: **26/26**, com o fluxo em PostgreSQL 16.15 isolado.

| Grupo | O que prova |
|---|---|
| R1–R3 | A diferença (3 esperando, 1 `delivery_ready`); sem dupla contagem; ausência ≠ zero |
| R4–R7 | Trajetória completa; retirado antes da saída; acrescentado depois da saída; acrescentado antes (o trecho começa na associação **dele**) |
| R8–R12 | Fora de ordem; idempotência e conflito; modo; unidade; relógio |
| A1–A5, K1 | Entrada na plataforma com vínculo, modo, chave e só os campos permitidos; retirada sem motivo nem autor; recusa sem vínculo; sinal solto sem equivalência; contrato e portão |
| V1, H1, H2 | Viagem intocada; consumidor que reconhece e recusa tipo errado; o runtime de verdade liga o consumidor |
| W1–W5 | Fluxo isolado: piloto → fila → viagem com acréscimo e retirada → saída → outbox → consumidor → `platform.event_log` → leituras; viagem intocada; consumidor sem dead-letter; segunda leitura ociosa, sem duplicar |

`test:platform:pronto-leituras:mutacoes`: **20/20, cegas 0**, com PostgreSQL. São 1 controle, 18
defeitos devolvidos e 1 restauração. Cada defeito reprovou pela prova que guarda a propriedade:

- linha velha conta de novo → R2;
- fila ou fatos indisponíveis viram zero → R3;
- fila sem modo vira real → R1;
- retirada herda a saída → R5;
- acréscimo herda a saída → R6;
- trecho começa no registro → R4;
- relógio negativo publicado → R12;
- ordem de chegada muda a leitura → R8;
- fato sem modo entra → R10;
- outra loja entra → R11;
- payload público inteiro → A1;
- fato sem vínculo entra → A5;
- sinal solto vira fato → A5;
- Operação Viva consome o fato → V1;
- runtime desliga o consumidor → H2;
- consumidor permissivo → H1;
- contrato sem `delivery_id` → K1.

### Regressão no commit `69c2e7d9`

| Suíte | Resultado |
|---|---|
| `build` · `typecheck` · `build:platform` | verdes (`dist/` com o contrato novo, conferido byte a byte) |
| `ready-fact` (PostgreSQL) · `test:entregas` | 29/29 · 242 linhas OK |
| Contrato · adaptador · consumidor (memória e PostgreSQL) · ingestão de fonte · ligação do piloto (PostgreSQL) · procedência | 23 · 9/9 · 12/12 · 3/3 · 9/9 · 6/6 · 32/32 |
| Q003 e2e · ligação do runtime · topologia · ponte · espinha · conference · Q016 · append-only · higiene · PB19 | verdes (ponte 45 OK) |
| Governança · `run-sem-fail-novo` | GREEN · OK |
| `cadeia` (binários reais + PostgreSQL) | 31 ok; P1–P5 falham porque o roteiro de papéis exige senhas por ambiente que só o CI fornece. **Iguais na base `de5bed3e`** |
| `q017` | 17 ok; O2 falha. **A base também falha** O2, e mais seis casos, neste ambiente |
| `test:platform` | Só a falha anterior (`pilot-delegation-issuer.ts`). Saída idêntica à base `66e9181b` |

A regressão achou **uma falha nova**, causada de propósito pela mudança: a contagem fixa do catálogo na
ponte (11). Ela foi atualizada para 13. Nenhuma outra falha nova.

Os testes de laboratório do CI (passos 50 e 51) só rodam no runner do GitHub e não rodaram aqui. A
expectativa crítica deles (o sinal `delivery_ready` solto recusado como "sem equivalência segura") está
reproduzida no A5.

## 4. Evidência do fluxo completo (banco isolado, dados sintéticos, modo simulated)

1. Prontos registrados: A, D, F, B e C.
2. Viagem T1 montada com A e D; F acrescentado 1,1 s depois; D retirado; T1 saiu.
3. O consumidor ingeriu 6 fatos e isolou 3 (`delivery_added`, que por desenho não tem equivalência).

Resultado:

- **Em `platform.event_log`**: 3 `delivery_ready` (A, D e F), 1 `delivery_removed` (D), mais
  `trip_created` e `trip_started`, todos `simulated`. O payload do `delivery_ready` tem só `channel`,
  `delivery_id`, `entregas_contract_version`, `order_ref`, `public_recorded_at`, `ready_kind` e
  `source_event_type`.
- **T1 na Operação Viva**: `em_rota`, com **2** eventos (só os da viagem).
- **Estado atual**:
  - na fila: **2** (B e C), `nao_declarado`;
  - aguardando saída: simulated **0**;
  - retirados sem registro novo: simulated **1** (D);
  - `fila_velha`: 0.
- **Trajetória**:
  - A saiu (registro → associação 0 s, associação → saída 3 s, registro → saída 3 s);
  - F saiu (1 s, 2 s, 3 s): o trecho associação → saída de F é menor, porque F entrou depois;
  - D ficou `retirado_antes_da_saida`, sem saída.

## 5. O que não está provado, e pendências

> **Remissão (01/11, etapa seguinte):** o primeiro item abaixo foi tratado em
> `FILA_OBSERVADA_2026-11-01.md`. A saída mínima do piloto entrega a fila do modo arquivo, e a leitura só
> aceita fila de origem declarada. A mesma etapa achou e fechou um zero falso que este texto não via: sem
> origem declarada, a tabela vazia era lida como fila vazia observada. O texto original segue abaixo, como
> registro.

- **A fila do modo arquivo não é visível para a plataforma.** O piloto de campo roda em arquivo, e
  nesse caso a parte "na fila" sai como indisponível na plataforma (honesto, nunca zero). Só no
  PostgreSQL compartilhado a fila é lida.
- **A fila não tem modo.** Ela é mostrada como `nao_declarado`. Separar real e simulado na fila exige
  dado que ela não guarda.
- **O consumidor da outbox pública na plataforma (`EntregasLiveConsumer`) continua só em laboratório**,
  não ligado ao runtime. Esta etapa não o liga.
- **Retenção divergente.** Os dois tipos novos usam 3 meses, pela decisão de 01/11; os tipos de viagem
  anteriores usam 24 meses (divergência anterior, registrada).
- Mostrar estas leituras no Copiloto toca caminhos protegidos e exige exceção do César.
- Nada rodou em aparelho físico, banco de operação ou CI: não houve push.

## 6. Próximo passo

Com autorização de push desta branch, o CI de produto roda os testes de laboratório reais (passos 50 e 51)
sobre o contrato novo. Depois, a decisão de produto: exceção para o Copiloto ler `lerProntosDeEntregas`
(caminhos protegidos), e como a fila do piloto em arquivo pode chegar à plataforma sem produtor sem
contrato.
