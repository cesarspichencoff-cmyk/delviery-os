# Contrato temporal da atenção — Operação Viva

> **R5-A.** Define como a Operação Viva elege, mantém e retira um modo **ao longo do tempo**.
> Não conecta motor, não conecta Shadow, não ativa runtime, não emite recomendação real.
> Autoridade de papéis: `CONTRATO_CONSCIENCIA_COPILOTO.md` (C1 e C3, encerrados em 2026-08-03).
> Implementação: `src/product/atencao/politica-temporal.ts` · Guarda: `npm run test:platform:r5a`.

---

## 0. As duas decisões que este contrato executa

**C1 — Ambiente informa, não orienta.**

```text
Ambiente → o que observar e compreender
Foco     → o que fazer agora
```

Ambiente pode apresentar situação, evidências, tendência, consequência provável, área e subárea,
incerteza, fonte ausente, o que observar e a **condição objetiva de entrada em Foco**. Não carrega
orientação operacional, recomendação prescritiva nem CTA. Toda orientação principal pertence ao Foco.

**C3 — a Operação Viva é a dona final da atenção.** Ela é a única responsável por Calmo, Ambiente,
Foco, eleição temporal, exclusividade do slot, permanência, retirada, cooldown e transição entre
modos. O motor produz causa, evidências e ação candidata. O contrato de tradução produz recomendação
tipada. O Shadow valida. O Copiloto apresenta dentro do Foco. **A interface não decide o modo.**

---

## 1. Semântica comprovada dos quatro parâmetros — lida, não presumida

Fonte: `src/perfil-delivery/motor.js`, linhas 42–46 (declaração) e 273–279 (gerente de atenção).

**Unidade: minutos.** Comprovado em `motor.js:200` — *"fotografa o **minuto** t"* — e pelo uso
`o.r > t-20` para "chegou nos últimos 20 minutos". `t` é um instante absoluto na linha do tempo da
sessão, em minutos.

| Parâmetro | Valor | O que é |
|---|---|---|
| `DEBOUNCE` | **3 min** | tempo mínimo que a **mesma** causa precisa permanecer no topo antes de poder virar Foco |
| `COOLDOWN` | **45 min** | tempo mínimo entre uma causa ser marcada e **essa mesma causa** poder voltar |
| `MAXFOCUS` | **8 min** | teto de duração de um Foco; ao atingir, ele é retirado |
| `STALE` | **120 min** | **NÃO é frescor de fonte** — ver §1.5 |

### 1.1 `DEBOUNCE` — ponto de início e condição de reinício

```js
if (top && top.sev>=2) { if (!sess.pending || sess.pending.key!==top.key) sess.pending={key:top.key, since:t}; }
else sess.pending=null;
const sustained = (sess.pending && (t-sess.pending.since)>=FLOORS.DEBOUNCE) ? top : null;
```

- **Início:** `since = t` no instante em que a chave do topo **muda**, ou em que passa a existir topo.
- **Condição:** `t - since >= DEBOUNCE`. Comparação **`>=`**, não `>`.
- **Reinício:** qualquer troca da chave do topo zera o relógio. Ausência de topo, ou topo com
  `sev < 2`, **apaga** o pendente inteiro — não pausa, apaga.
- **Durante um Foco ativo, o pendente continua correndo.** Quando o Foco termina, um candidato já
  sustentado pode ser eleito no mesmo instante.

### 1.2 `MAXFOCUS` — o teto, e o que ele dispara

```js
sess.active={key:…, sit:…, until:t+FLOORS.MAXFOCUS};
…
if (t>=sess.active.until){ sess.firedAt[sess.active.key]=t; sess.active=null; }
```

- `until` é fixado **na eleição** e não é renovado enquanto a causa permanece.
- **`t >= until`** encerra. A retirada por teto **grava `firedAt`** — ou seja, **inicia o cooldown**.

### 1.3 `COOLDOWN` — por causa, e com uma assimetria que não é acidente

```js
const elig = sess.firedAt[sustained.key]==null || (t-sess.firedAt[sustained.key])>FLOORS.COOLDOWN;
```

- **Por chave de causa**, nunca global. Outra causa não é penalizada.
- Comparação **`>`** estrita — diferente do `>=` do debounce. Reproduzido como está.
- `firedAt` é gravado em **dois** momentos: na **eleição** e na **retirada por teto**.

**A assimetria comprovada:** quando a causa **desaparece** do conjunto de situações,
`if (!cur) sess.active=null;` retira o Foco **sem gravar `firedAt`**. Retirada por desaparecimento
**não inicia cooldown**; retirada por teto inicia. Como `firedAt` já foi gravado na eleição, o
cooldown de uma causa conta **a partir da eleição** — e é reancorado se ela chegar ao teto.

### 1.4 Troca de causa: **não existe preempção**

```js
if (!sess.active && sustained) { … }
```

A eleição só acontece quando **não há** Foco ativo. Uma causa diferente, ainda que mais severa, **não
rouba o slot** — ela espera o Foco corrente acabar por desaparecimento ou por teto. Isso é
exclusividade temporal de verdade, e é a razão pela qual `sess.active.sit=cur` apenas **atualiza** a
situação da mesma chave, sem trocar de causa.

**Nenhuma exceção de precedência foi inventada.** As fontes não têm nenhuma, e a missão proíbe
criar. Se um dia o César quiser preempção por severidade material, é decisão de produto, com
medição — não um `if`.

### 1.5 `STALE` — o achado que desfaz uma suposição comum

`STALE:120` **não** mede frescor de fonte. Ele é **teto de plausibilidade da espera observada de um
pedido** (`motor.js:212` e `:218`):

```js
const wmin = t - o.p;
if (wmin > FLOORS.STALE) { suspeitos++; continue; }   // espera implausível → dado suspeito, nunca foco
```

O comentário canônico do próprio arquivo: *"no dado real, NENHUMA espera legítima passou de 104 min
(expedição p99=57 máx=104 · produção p99=71 máx=103). Acima de STALE o dado é suspeito: não entra em
contagem, não vira foco, não é nomeado."*

**Consequência para este contrato:** existem **duas** coisas diferentes e elas não podem ser fundidas.

| | O que é | Onde vive |
|---|---|---|
| **Espera implausível** | `> 120 min` de espera observada de um pedido → dado suspeito, excluído | `motor.js`, antes de virar candidato |
| **Fonte obsoleta** | a fonte que sustenta a causa parou de responder | **entrada declarada** desta política |

Esta política **não inventa limiar de frescor de fonte**. Nenhum existe no cânone. A obsolescência
chega como **estado observado** (`saudavel · parcial · stale · indisponivel`, de `sinais.ts:76`) mais
a **idade da leitura**, e a política decide a **consequência** — nunca o diagnóstico.

---

## 2. Onde a política mora, e por que não no view model

`TemporalAttentionPolicy` vive em `src/product/atencao/politica-temporal.ts`, como **domínio puro**.

Ela **não** mora em `home-vm.ts`, em `home.js`, no navegador, num componente visual nem num
singleton global. O motivo é o defeito que R5-A existe para fechar: enquanto a eleição foi uma
fotografia instantânea (`home-vm.ts:607`), ela **não tinha onde guardar o tempo** — e um estado
temporal escondido dentro de um view model morre a cada leitura, não sobrevive a um reinício e não
pode ser reconstruído por eventos.

Propriedades exigidas e cumpridas:

- **pura** — uma função, sem `Date.now()`, sem `Math.random()`, sem I/O;
- **relógio injetável** — o instante entra como campo `agora_min` da entrada;
- **entrada e saída explícitas** — `EntradaDaEleicao` → `ResultadoDaEleicao`;
- **serializável** — `EstadoTemporal` é JSON puro, sem classe, sem `Map`, sem `Date`;
- **replayable** — a mesma sequência produz o mesmo estado final;
- **idempotente** — o mesmo instante reaplicado não altera nada;
- **reconstruível por eventos** — o estado de saída de uma leitura é a entrada da próxima.

**O view model consome o resultado. Ele não possui a política.**

---

## 3. Identidade estável da causa

A identidade **nunca** deriva de texto apresentado a uma pessoa. Ela é composta de:

```text
codigo do sinal | ambiente | subarea | pedido (somente com order_id real) | fonte
```

Campos ausentes viram `-`. Trocar `resumo`, `orientacao` ou `alvo_rotulo` **não** muda a identidade e
**não** reinicia o debounce. Trocar ambiente, subárea ou pedido **muda** a identidade, e a transição
fica auditável em `motivo`.

**`pedido_id` só entra quando é um identificador real observado.** Nenhuma identidade de pedido é
fabricada — **D29** continua valendo: sem `order_id` propagado, não existe recomendação de pedido.

---

## 4. Estados e transições

| Estado | Público? | O que é |
|---|---|---|
| `calmo` | sim | nada acima do piso de ambiente |
| `candidato_ambiente` | **não** | há candidato acima do piso de ambiente, ainda na mesma leitura |
| `ambiente` | sim | situação e observação, **sem orientação** (C1) |
| `candidato_foco` | **não** | causa acima do piso de foco, acumulando debounce |
| `foco` | sim | zero ou um, causa estável, orientação pertencente à causa eleita |
| `cooldown` | **não** | por causa; impede o retorno imediato da mesma |
| `degradado` | sim | fonte obsoleta; **nunca** vira Calmo, **nunca** vira verde |
| `retirada` | **não** | transição registrada com motivo auditável |

**Motivos de transição auditáveis:** `debounce_cumprido` · `debounce_em_curso` ·
`debounce_reiniciado_por_troca_de_causa` · `pendente_apagado` · `causa_desapareceu` ·
`teto_de_foco_atingido` · `cooldown_em_vigor` · `cooldown_vencido` · `fonte_obsoleta` ·
`carimbo_repetido` · `carimbo_retrocedido` · `sem_candidato`.

### Regras que o gate prova

- **Calmo** não tem orientação · não é produzido quando a fonte necessária está obsoleta · um pico
  curto não cria Foco · sinal informativo não cria pressão.
- **Ambiente** nunca carrega orientação, e só evolui para Foco pelo critério temporal **e**
  operacional (C1).
- **Foco** é zero ou um · não troca de causa por oscilação de uma leitura · não passa do teto.
- **Cooldown** é por causa. **Sem exceção de preempção** — §1.4.
- **Obsolescência** preserva a última verdade conhecida, declara a idade da leitura, e a retirada por
  obsolescência tem motivo auditável.

---

## 5. Pisos de severidade — divergência registrada, NÃO corrigida em silêncio

O motor e o produto discordam sobre **quando** algo é candidato, e as duas escalas de severidade não
são a mesma coisa:

| | Ambiente | Foco |
|---|---|---|
| `motor.js:284` | qualquer situação (`sits.length>0`) | `sev >= 2` sustentado |
| `home-vm.ts:403,608` | `severidade >= 2` | `severidade >= 3` |

Esta política **parametriza** os dois pisos e **usa por padrão os do produto**, porque corrigir a
divergência mudaria o modo visível de cenas aprovadas — e o congelamento visual desta missão proíbe.
A escolha do piso é **PB2**, que já está registrado como rebaixado e pendente de calibração no
piloto. Não foi resolvido aqui, e não foi escondido.

---

## 6. O que este contrato NÃO faz

- Não conecta `decisao.js` nem `shadow.ts` — **D43 de pé**, R5-B/C/D não iniciados.
- Não cria flag, runtime, fila nem banco.
- Não emite recomendação real.
- Não decide preempção por severidade material — não existe nas fontes.
- Não fixa limiar de frescor de fonte — não existe no cânone; a obsolescência é observada, não
  inferida.
- Não resolve **D29** nem fabrica `order_id`.
- Não altera nada visual.
