---
lifecycle:
  artefato: docs/execution/BLOCKERS.md
  status: ACTIVE
  authority_scope: infra_blockers
  superseded_by: null
  atualizado_em: "2026-10-02"
  state_basis: 5e5e0f7
  question_refs: ["Q-001","Q-002","Q-003","Q-004","Q-005","Q-006","Q-007","Q-008","Q-009","Q-010","Q-011"]
---

# Bloqueadores e trabalho não integrado

> **2026-08-07 — as decisões humanas saíram daqui.** Este arquivo continua ACTIVE e é a autoridade de
> **bloqueio de infraestrutura e ambiente**: Android, PostgreSQL, Docker, nuvem, aparelho físico,
> trabalho não integrado e defeitos reproduzidos. As perguntas que só o César responde passaram a
> viver em `docs/execution/PERGUNTAS.jsonl`, com ID estável, relógio e `default_behavior`.
> O texto histórico abaixo **não foi alterado nem removido** — recebeu apenas o marcador de migração.
> Fonte única garantida por escopo: só um artefato ACTIVE pode ter `authority_scope: human_questions`,
> e este não é ele. Não reabrir uma pergunta aqui; responder na fila.

| Registro histórico | Migrado para | Estado |
|---|---|---|
| PB9/C1 | **Q-001** | aberta |
| PB9/C2 | **Q-002** | aberta |
| PB9/C3 | **Q-003** | **respondida em 2026-09-30** |
| PB9/C7 | **Q-004** | aberta |
| PB9/C8 | **Q-005** | aberta |
| PB11 | **Q-006** | aberta · `PROCEED_REVERSIBLY` autorizado por D59 |
| PB13 | **Q-007** | aberta |
| PB14 | **Q-008** | aberta |
| PB15 | **Q-009** | aberta |
| PB16 | **Q-010** | aberta |
| PB18 | **Q-011** | **respondida em 2026-08-07** |

> Não migrados, com motivo: PB1, PB4, PB7, PB8 e PB17 estão **resolvidos**; PB2, PB3, PB5 e PB6 foram
> **rebaixados em 2026-08-01** e não bloqueiam; PB10 está parcialmente resolvido e PB12 deixou de ser
> bloqueio por D57. Nenhum deles é pergunta aberta hoje, e inventar entrada para eles seria fabricar
> fila.

> **LEIA PRIMEIRO — 2026-08-01.** Este arquivo passou a ter DUAS naturezas de bloqueio, separadas de
> propósito. A seção **BLOQUEIOS DE PRODUTO E DECISÕES HUMANAS** foi criada porque o produto do
> DeliveryOS ficou parado de julho a agosto de 2026 por perguntas que só o César responde — e
> nenhuma delas aparecia aqui, porque este arquivo só registrava infraestrutura. Uma pergunta de
> produto sem resposta é um bloqueio tão real quanto um banco que não sobe.
>
> Índice canônico do produto: `docs/product/DELIVERYOS_CANONICAL_SOURCE_INDEX.md`.

---

# BLOQUEIOS DE PRODUTO E DECISÕES HUMANAS

## ✅ ENCERRADOS em 2026-08-01 — não reabrir

- **PB1 — Quentes × Cozinha.** RESOLVIDO. `enrolados_quentes` = **Sushi Quentes** (subárea de Sushi);
  `cozinha_quentes` = **Cozinha**. Confirmado item a item contra o seed. Ver D45 e índice §3.5.
- **PB4 — "Só quente" é acionável?** RESOLVIDO. É **sinal de roteamento**: o pedido não passa pelo
  Sushi e pode ser montado na bancada do caixa. Ver D47.
- **PB7 — Mapa praça → ambiente (Sushi).** RESOLVIDO. Sushi é **ambiente geral com subáreas
  visíveis** (Combinados, Duplas, Enrolados, Sushi Quentes). Ver D46.

## ⬇ REBAIXADOS em 2026-08-01 — não bloqueiam a recuperação inicial

- **PB2 — limiar amarelo/vermelho.** Usar a **calibração real já existente** (`FLOORS`, baselines
  medidos) como ponto de partida e validar no piloto. O César não precisa inventar números antes de
  ver o comportamento.
- **PB3 — regra das duas sacolas.** Só afirmar **com motivo sustentado**. A heurística ampla
  (47–61%) **não é verdade operacional** e não pode ser exibida sozinha.
- **PB5 — Caixa.** Apresentar como **`sem medição automática`** quando não houver fonte.
  **Nunca verde por ausência de dado.**
- **PB6 — Conferência.** Preservar **risco por pedido**; carga da área permanece `sem medição`
  enquanto não houver fonte.
- **PB8 — histórico Odhen/Teknisa.** **RESOLVIDO POR AUTORIDADE DE EVENTO em 2026-08-04 (D79).**
  Deixou de ser bloqueio de ACESSO e virou bloqueio de **EMISSÃO**: para `trabalho_praca_observado`,
  nenhum acesso resolve, porque **a comanda do Odhen é única, sem separação por praça** — a praça
  seria inferida do item, nunca declarada. Decisão por evento em
  `docs/product/QUALIFICACAO_PRODUTORES_VIVOS.md`. A próxima decisão é da operação, não da
  engenharia.

## 🔴 ABERTOS — decisões de produto que ainda travam runtime

- **PB9/C2** — quem fica com o nome "Operação Viva": o núcleo cognitivo ou a projeção de viagens.
- **PB9/C3** — qual motor é dono da atenção. **Os dois não se conectam até I1–I10 do contrato
  estarem verdes** (`docs/product/CONTRATO_CONSCIENCIA_COPILOTO.md` §6).
- **PB9/C1** — Ambiente pode carregar orientação de ação? O César pediu "dicas práticas" nos
  secundários; `Modelo` §3 e `Mapa_Ambientes` §11 proíbem bloco de ação em Ambiente.
  **Conflito real, não resolvível por hierarquia de fontes.**
- **PB9/C7** — CRM, Evolução, Treinamento, RH e Gestão são módulos do DeliveryOS?
- **PB9/C8** — notificação fora da tela é permitida?
- **PB11** — o Figma não acompanhou a expressão canônica da home. **RECLASSIFICADO em 2026-08-03 pelo César:** bloqueia **apenas o fechamento documental e a paridade nativa com o Figma**. **Não** bloqueia a continuidade técnica do DeliveryOS e **não** bloqueia R5. Ver **D59**.
- **PB13** — a cota do plano Figma cortou leitura **e** escrita no meio da sincronização (2026-08-03). Detalhe no fim deste arquivo.
- **PB14** — **Sushi Quentes: ambiente canônico ou subárea?** A realidade física (bancada separada, no
  salão, com produção e gargalo próprios) diverge de D45/D46. O Lab V4 o representa como unidade
  operacional **experimental**; `areas.ts` segue intocado e a migração **não ocorreu**. Impacto medido
  em `docs/product/PROPOSTA_EVOLUCAO_SUSHI_QUENTES.md` — inclusive que migrar exige **reancorar os sete
  gates de congelamento**. **Só o César decide** (índice canônico §6, "mudança no significado de um
  ambiente"). Junto vai a decisão sobre **S12**, que hoje não nasce para pedido só de Sushi Quentes.
- **PB15** — **a rota do Caixa não é alcançável por medição.** A regra
  `ONE_ORDER_ONE_CONSOLIDATION_ENVIRONMENT` exige `capacidade_do_caixa` **comprovada** antes de abrir a
  sacola, e nenhuma fonte mede a fila da Caixa (mesma raiz de PB5). Fora de fixture, o Caixa nunca é
  recomendado. **Não é defeito** — é a regra se recusando a funcionar sem lastro. Destrava com fonte de
  capacidade da Caixa, que é decisão de operação, não de engenharia.
- ~~**PB17** — a correção do achado 5.1 não foi reverificada por avaliador independente.~~
  **RESOLVIDO em 2026-08-07.** A primeira retomada falhou por limite de API sem produzir resultado, e
  a missão foi fechada com a reserva nomeada — sem inferir veredito e sem criar avaliador novo. Na
  segunda retomada, **o mesmo avaliador** concluiu sobre HEAD `9845e15` e emitiu **`APPROVED`**, com
  evidência própria em quatro camadas: leitura do código da correção, mutação `MD9` reaplicando o
  defeito e sendo acusada, API nas 18 cenas, e tela com CSS computado. Achado 5.1 **RESOLVIDO**,
  **nenhuma regressão**, **nenhum achado novo**. Literal em
  `docs/auditoria/evidencias-0a/avaliacao-independente-bruta-rodada2.md`.
- **PB18** — **a expressão visual da V4 foi REJEITADA pelo César** (declaração dele, 2026-08-05).
  O substrato funcional é o que está fechado; a direção visual volta para missão própria. Nenhum
  redesenho foi feito nesta missão, por instrução expressa.
- **PB16** — **o Lab V4 aguarda revisão humana do César.** Ele está `BROWSER_VALIDATED` e
  `INDEPENDENTLY_EVALUATED`; o estado máximo permitido nesta missão é **`AWAITING_CESAR_REVIEW`**.
  `HUMAN_APPROVED` e `RELEASED` **não** podem ser registrados antes de o César abrir e avaliar
  pessoalmente. Abrir com `npm run ui:lab` → http://127.0.0.1:5291/lab/operacao-viva-v4/

## ⬇ RECLASSIFICADOS

- **PB12 — OriginKit.** Deixou de ser bloqueio em 2026-08-03: `OriginKit external review deferred —
  non-blocking` (**D57**). A evidência de indisponibilidade fica preservada abaixo, inteira. O que
  caiu foi a consequência: o OriginKit é referência externa **opcional** de qualidade, não é
  autoridade visual, não é dependência, não prevalece sobre V2/V3.3 e não trava Figma, paridade nem
  fechamento visual. A revisão vira refinamento futuro, nunca reconstrução obrigatória.

---

### Registro histórico dos bloqueios de produto (mantido para rastreabilidade)


> **Categoria separada de infraestrutura, Android, PostgreSQL, Docker, nuvem e aparelho físico.**
> Nada aqui se resolve com código. Tudo aqui bloqueia a recuperação do produto operacional.
> Classificação completa das 32 perguntas antigas: índice canônico §5.

## PB1 — "Quentes" × "Cozinha": colisão de nome não resolvida

- **Bloqueia:** os 6 ambientes inteiros (`Mapa_Ambientes_V1.md`).
- **Evidência:** o motor exibe `DISPLAY.cozinha_quentes = "Quentes"`, mas o César usa "Quentes" para
  hot roll/tempura e "Cozinha" para os pratos da cozinha. Implementar hoje mostraria a área errada.
- **Pergunta:** "Quentes" para você é hot roll e tempura, ou os pratos da cozinha? E "Cozinha"?
- **Estado:** perguntado (auditoria de recuperação §20 Q2) · **sem resposta**.

## PB2 — Limiar de amarelo e vermelho

- **Bloqueia:** todos os limiares dos 6 ambientes.
- **Pergunta:** a diferença entre "acompanhar" e "agir agora" é em pedidos esperando ou em minutos?
- **Estado:** perguntado (§20 Q6) · **sem resposta**.

## PB3 — "Duas sacolas": heurística × regra real

- **Bloqueia:** o sinal S14 e as Atenções Leves no Calmo.
- **Evidência:** o motor usa `segundaSacola = combo ou ≥8 itens`, que atinge **47–61%** dos pedidos —
  comum demais para ser sinal. `Logica_Embalagens` §11 tem 6 causas reais, nunca validadas.
- **Estado:** perguntado (§20 Q3) · **sem resposta**.

## PB4 — "Só quente" é acionável ou informativo?

- **Bloqueia:** o sinal S12.
- **Evidência:** dado real e disponível (14–23% dos pedidos); a **ação** é indefinida.
- **Pergunta:** "só quente" muda o que a equipe faz (sacola separada, prioridade), ou é só uma
  característica?
- **Estado:** **nunca perguntado**.

## PB5 — Caixa tem sinal digital?

- **Bloqueia:** o ambiente Caixa existir ou entrar como "sem medição".
- **Evidência:** `Mapa_Ambientes` §7 — o motor não modela comanda nem organização inicial. Mostrar
  Verde seria inventar operação (viola Lei 5 e Lei 12).
- **Estado:** perguntado (§20 Q5) · **sem resposta**.

## PB6 — Conferência: estação ou risco por pedido?

- **Bloqueia:** o ambiente Conferência.
- **Evidência:** o motor mede risco por pedido, não fila da bancada.
- **Estado:** **nunca perguntado**.

## PB7 — Mapa praça → ambiente

- **Bloqueia:** o fechamento do mapa dos 6 ambientes.
- **Pergunta:** Sushi = Combinados + Duplas + Enrolados frios?
- **Estado:** **nunca perguntado**.

## PB8 — O pedido some do Odhen/Teknisa: fica gravado?

- **Bloqueia:** a arquitetura de captura da fonte viva da loja.
- **Evidência:** `Auditoria_Fonte_Viva_Loja_V1.md` §8.1. Se não fica gravado, a captura **no instante
  da impressão** é obrigatória, não opcional.
- **Estado:** **nunca perguntado**.

## PB9 — Conflitos de produto sem dono (não são perguntas soltas)

Registrados no índice canônico §7. Os que travam implementação:

- **C2** — quem é "Operação Viva": o núcleo cognitivo ou a projeção de viagens?
- **C3** — qual motor é dono da atenção: `decisao.js` ou `shadow.ts`? **Ligar os dois sem decidir
  recria o defeito de 30,8% corrigido em `37ca1c9`.**
- **C1** — Ambiente pode carregar orientação de ação? (César quer; `Modelo` §3 proíbe.)
- **C7** — CRM, Evolução, Treinamento, RH e Gestão são módulos do DeliveryOS? (Não existem em fonte
  original; foram criados na Unidade 6.)
- **C8** — notificação fora da tela é permitida? (Jornadas 15/16 nunca foram desenhadas.)

## PB10 — Fontes canônicas nunca examinadas · **PARCIALMENTE RESOLVIDO em 2026-08-03**

- `docs/design/canonical/deliveryos-visual-v2/*.zip` — **cânone visual soberano**. ✅ **EXAMINADO** na recuperação da expressão visual: o conteúdo extraído foi lido inteiro (Organismo Operacional V3.3, Pacote Visual V2, Contrato Visual dos Estados Técnicos) e é a autoridade da home. O ZIP original segue imutável.
- Worktree `deliveryos-copiloto-v33-implementation` — implementação validada do Copiloto, fora deste
  repositório.

---

# BLOQUEIOS DE INFRAESTRUTURA E AMBIENTE

> A partir daqui, o conteúdo histórico deste arquivo, preservado integralmente.

---

> Estado em **2026-07-27**, checkpoint do Macro-Prompt 2/3 por limite de crédito.
> O Macro-Prompt 2 **NÃO está concluído**. Este arquivo existe para a retomada
> não precisar redescobrir nada.

---

## A. Bloqueadores externos (dependem do César, não de código)

Nenhum deles impede o trabalho local continuar. Todos estão preparados até um
único passo manual.

### A1 — Aparelho Android real para o field gate

- **Ação necessária:** conectar um aparelho autorizado por USB com depuração
  ligada, ou autorizar a instalação do APK de piloto.
- **Motivo:** os 20 testes físicos da seção 16 do briefing (background, tela
  bloqueada, perda de rede, replay, reinício, GPS impreciso, revogação) só
  valem em hardware. Emulador é evidência de emulador.
- **Risco de cobrança:** nenhum.
- **Alternativa gratuita:** os testes unitários Kotlin **rodam nesta máquina**
  (JDK Temurin 17 + SDK presentes, comprovado no Macro-Prompt 1). Eles cobrem
  lógica, não comportamento de campo.
  > **Leitura em 2026-09-25:** "nesta máquina" é a máquina do Macro-Prompt 1, não o sandbox de
  > nuvem. Aqui o SDK não instala (a rede nega `dl.google.com`; ver "Android — o app não compila
  > neste ambiente"). O A1 continua ABERTO: o comportamento físico do Android é UNKNOWN até o teste
  > no aparelho.
  > **Roteiro em 2026-09-25:** `docs/etapa-4-8/FIELD-GATE-ANDROID.md` — pré-requisitos, 22 passos e
  > 6 cenários, todos `NOT_RUN` até haver aparelho.
- **Preciso de:** o aparelho, e a chave de assinatura se for instalar o piloto.

### A2 — PostgreSQL hospedado

- **Ação necessária:** criar a instância e me passar a URL.
- **Motivo:** provar a ponte contra o banco que vai para o campo.
- **Risco de cobrança:** **sim**, depende do plano.
- **Alternativa gratuita:** o container de `deploy/compose.platform.yaml`, ou o
  cluster efêmero local já em uso.
- **Armadilha registrada:** plano gratuito que **pausa** por inatividade é
  inaceitável — a primeira entrega do dia esperaria o banco acordar.
- **Verificar antes de migrar:** `npm run verificar:banco`.

### A3 — Destino externo de backup · A4 — Docker

Inalterados desde o Macro-Prompt 1. Ver `STATE.json`, campo `nao_comprovado`.

---

## B. Trabalho NÃO integrado — deliberadamente fora do commit

### B1 — Port do Conference Brain · `309/314`, **não integrado**

**Arquivos presentes no working tree, NÃO versionados:**
`src/conference-brain/` (34 arquivos) · `tests/conference-brain/` (6) ·
`tools/conference-brain/` · `docs/conference-brain/`

**Origem:** `deliveryos-copiloto-secure-bind-v1` @ `aec9027` — que é o worktree
**mais avançado**, e não o `recheck-multidimensional-v2` que o briefing supunha.
Prova: `git merge-base e5e8240 aec9027` = `a010865`; tudo que o v2 acrescentou
depois são só arquivos de teste.

**Por que não entrou no commit:** 5 dos 314 testes falham. Não é defeito do
port — os 5 verificam módulos **vizinhos** que mandei deliberadamente não
copiar:

```
celulas operacionais seguem intactas
adaptador V3.3 e o vocabulario das areas seguem intactos
Capacidade Viva continua em sombra, sem decisao automatica
shadow config mantem o hash canonico
motor de 8 pracas nao foi tocado por este sprint
```

Todos falham por `Cannot find module .../src/live/interface/celulas-operacionais`.

**A descoberta real:** a suíte do Conference Brain **não é auto-contida**. Ela
tem 5 guardas de compatibilidade que alcançam `src/live/` e
`src/capacidade-viva/`. A expectativa de `314/314` estava errada desde o
enunciado — não havia como um port do conference-brain sozinho satisfazê-la.

**Decisão pendente, para a retomada — não decidi porque exigiria abrir frente nova:**

| Opção | Custo | Consequência |
|---|---|---|
| portar também `src/live/` e `src/capacidade-viva/` | maior | 314/314, mas traz dois módulos que a ponte não usa |
| aceitar 309/314 | menor | os 5 guardas viram inaplicáveis e precisam de marcação explícita, nunca de remoção silenciosa |

**Não remova os 5 testes para "ficar verde".** Eles existem para impedir que um
sprint quebre o motor de 8 praças; apagá-los é apagar a proteção, não o
problema.

**Comando exato para retomar:**
```bash
node --test "tests/conference-brain/"*.test.js
```

**Gate de auditoria independente ainda NÃO executado** (prova que o port não
perdeu as correções dos Sprints 2.3/2.4):
```bash
DELIVERYOS_AUDIT_TARGET_ROOT="$PWD" node --test tests/auditoria/conference-sprint23-lightning.test.js tests/auditoria/conference-sprint24-conflict-smoke.test.js
```
Esperado: 12/12. Os arquivos precisam ser copiados de
`deliveryos-recheck-multidimensional-v2/tests/auditoria/`.

### B2 — Figma Product System · **não iniciado no disco**

`docs/figma/` está vazio. O agente estava trabalhando quando o checkpoint foi
pedido; nada foi escrito no repositório.

**O que já está comprovado sobre o Figma (não reinvestigar):**

- fileKey `IMWH8ZKMF5ra3QJYiR6vGa`, editorType `design`;
- **escrita PERMITIDA** — testado criando e removendo um retângulo. O
  `whoami` reporta seat `View` no plano Starter, e **isso não impede escrever**.
  A suposição derrubada pelo teste empírico;
- **as três páginas existem**: `00 — Overview & Architecture` (`0:1`, tem a
  capa), `01 — Design System` (`2:2`, **vazia**), `02 — Product Flows &
  Screens` (`2:3`, **vazia**);
- `get_metadata` sem `nodeId` listou **uma** página só. A API do plugin é a
  autoridade, não aquela ferramenta;
- zero variáveis, zero estilos de texto, zero estilos de cor.

---

## C. Defeitos REPRODUZIDOS e ainda não corrigidos

> **Leitura em 2026-09-25:** o título desta seção é de 2026-07-27. O **C1 está SUPERADO** — ver o
> marcador de sucessão logo abaixo. C2, C3, C4 e C5 **não** foram reavaliados por essa sucessão.

### C1 — P0 · O Android não consegue sincronizar nada

> **SUCESSÃO — 2026-09-25 · este C1 é HISTÓRICO. Não é bloqueador atual.**
>
> | dimensão | estado atual |
> |---|---|
> | `BOOTSTRAP/SYNC CONTRACT` | **PROVEN** — sessão, token e sincronização provados com aparelho LÓGICO contra os binários reais e PostgreSQL (`test:platform:cadeia`, 35/35) |
> | `ANDROID PHYSICAL FIELD BEHAVIOR` | **UNKNOWN / BLOCKED UNTIL DEVICE TEST** — nenhum aparelho físico executou a cadeia; o app nem compila neste ambiente (ver "Android — o app não compila neste ambiente", mais abaixo, e A1) |
>
> Linha do tempo:
>
> 1. **2026-07-27** (`1271f2d`) — registrado aqui: ninguém escrevia o token, nada sincronizava.
> 2. **2026-07-27** (`bfc3063`) — declarado "CORRIGIDO" pela Unidade 1 (`a5fe45d`, `4456f2e`; ver
>    "Atualização — Unidade 1", abaixo). O Kotlin passou a PEDIR o token em
>    `POST /api/device/session`. **Era insuficiente:** nenhum servidor o emitia. Em `0b8803c`, o
>    runtime crítico respondia 404 e o piloto 200 sem `device_token` — reproduzido pela Cadeia Real.
> 3. **2026-09-24** — **resolvido pela Cadeia Real**: `b5b7f0c`, `be73e1c`, `1de5b28`, `5effdbe`.
>    Certificada em 2026-09-25: `3993ab4`, `e51c34d`, `54ebb0a`, `d2fca5e`. Ver
>    `docs/etapa-4-8/CADEIA-REAL.md` e, neste arquivo, "Cadeia real — o aparelho não conseguia o
>    primeiro token · FECHADO em 2026-09-24".
>
> O texto abaixo é o registro original, mantido sem edição.

**Reproduzido por leitura direta do código, não por suposição:**

```
android/.../data/EntregasDatabase.kt:207   KEY_SESSION_TOKEN declarada
android/.../sync/SyncWorker.kt:47          única LEITURA da chave
android/.../sync/EntregasApi.kt:85         authenticateDevice() definida
grep -rn "authenticateDevice" android/app/src/   →  só a definição, zero chamadas
```

Ninguém escreve `KEY_SESSION_TOKEN`. `tokenProvider()` devolve `null`, o header
`Authorization` não vai, e o servidor responde 401 em `/api/gps/batch`,
`/api/events/batch`, `/api/policies` e `/api/term/acknowledge`.

**O que agrava:** 401 cai em `ApiResult.Rejected` (4xx), e `Rejected` **não
retenta** (`SyncWorker.kt:112-119`). Os pontos ficam `failed` para sempre. Um
motoboy em campo veria o app funcionando — GPS capturando, notificação na tela —
e **nada chegaria**, em silêncio, permanentemente.

**Por que não corrigi agora:** a autenticação do servidor de piloto é login
humano; o aparelho nunca obtém token. Consertar exige decidir o modelo de
autenticação de dispositivo — que eu resolvi no lugar certo, no runtime crítico
(`src/platform/ingest/device-ingest.ts` já exige `device_id_autenticado` e
consulta revogação). Falta ligar a rota e fazer o Kotlin obter o token.

### C2 — P1 · O portão de captura é avaliado uma vez só

`TripLocationService.kt:148` avalia `GateSnapshot.evaluate(...)` em `beginTrip`
e **nunca reavalia**. Se o termo for revogado, a flag desligada pelo servidor ou
o serviço de localização desativado **durante** a viagem, a captura continua.
Só a permissão do SO é rechecada, e apenas quando a cadência muda.

> **SUCESSÃO — FECHADO NO CÓDIGO/AVD em 2026-10-01.** O loop nativo de 15 s
> reavalia `GateSnapshot` antes de depender de rede e derruba o serviço se
> permissão, localização, flag local ou termo/aceite deixarem de autorizar.
> Quando há rede, `/api/device/capture-state` também exige flag vigente,
> termo publicável e aceite do mesmo motoboy no mesmo aparelho. Provas:
> capture-control **17/17**, HTTP real **6/6**, Android **41/41**,
> native+consent **79/79**, instrumentados AVD **10/10**. O cenário físico de
> revogar permissão/desligar localização no celular real continua `NOT_RUN`.
> Ver `field-gate/2026-10-01-q018-gate-reevaluation.md`.

### C3 — P1 · Corrida na `sequenceLocal`

`TripLocationService.kt:247-279` lança **um coroutine por ponto** em
`Dispatchers.IO`; `maxSequence()+1` (`EntregasDatabase.kt:125`) não é atômico.
Um `LocationResult` em lote pode dar a mesma `sequence_local` a dois pontos —
corrompendo exatamente a ordenação que o servidor usa.

> **SUCESSÃO — FECHADO em 2026-09-30.** A persistência foi serializada por
> `persistMutex` e a reserva da sequência + insert passaram a ocorrer na mesma
> transação Room (`insertGpsSequenced`). A bancada do Foxxy provou sequência
> contínua, restart e o APK final fechou com `connectedDebugAndroidTest`
> **10/10 PASS**. Ver `Q018-RIDER-CAPTURA.md` §§14–15 e
> `field-gate/2026-09-30-foxxy-emulador.md`.

### C4 — P1 · GPS canônico do despacho — código fechado; ativação real pendente

> **SUCESSÃO — CODE_READY + TEST_PASS em 2026-10-01.** Não foi criado segundo
> armazenamento. O crítico expõe leitura de localização/rota sobre
> `platform.event_log` usando a porta `READ ONLY`; o piloto acessa por uma
> assertion HMAC curta, vinculada à unidade, ator, papel, viagem e escopo.
> Cada unidade tem segredo próprio e o segredo dos aparelhos NÃO é reutilizado.
>
> Quando `ENTREGAS_PLATFORM_URL` está configurada, o piloto usa
> `platform.event_log` para `/api/trip/location` e `/api/trip/route`;
> **não existe fallback silencioso para `pointsByTrip`**. Nesse modo,
> `/api/gps/batch` legado vira tombstone 503 retentável para preservar a fila
> de APK antigo. Sem segredo de leitura, a tela recebe 503 explícito.
>
> Provas: assertion/rota **6/6**, integração HTTP piloto↔plataforma **5/5**,
> capture-control HTTP **6/6**, deploy-audit piloto **39/39**, platform-deploy
> **30/30**, governança **14/14**.
>
> **SUCESSÃO — 2026-10-02 · POSTGRESQL REAL DO CAMINHO HTTP FECHADO.**
> A nova prova subiu runtime crítico real + piloto real sobre PostgreSQL 18,
> ingeriu dois pontos via aparelho lógico e leu os mesmos fatos por
> `/api/trip/location` e `/api/trip/route`: **6/6 PASS**. Motoboy recebeu
> metadata sem coordenadas; ingest legado continuou tombstone 503; segredo
> interno divergente foi recusado sem fallback para RAM. O banco efêmero foi
> removido ao final.
>
> O que continua aberto agora é estritamente operacional: gerar/configurar
> segredos reais de leitura por unidade e executar deploy no ambiente alvo.
> A imagem final e a composição Docker completa já foram provadas separadamente;
> credenciais/deploy continuam **NOT_RUN / NÃO AUTORIZADOS**.

### C5 — P2 · Resíduos conhecidos — reavaliado em 2026-10-01

- **SUCESSÃO:** `tools/live/interface/servir_d4a.js`,
  `servir_investigacao_volume.js` e `browser-adapter.js` **não estão no Git
  atual**. A qualificação canônica dos produtores registra que pertenciam ao
  port histórico do Conference Brain que não foi aceito; Playwright/scraping
  não é a entrada viva do DeliveryOS atual. Portanto bind `0.0.0.0` e
  “7/9 dimensões unknown” são **legado não portado, não bloqueador atual**.
  `test:platform:r5d2-producer-qualification` passou **38/38** nesta
  reavaliação;
- `outbox_event` do Room continua **RESERVADO/DORMANT**: não existe produtor
  Android em código de produção. Isso significa que **comandos offline nativos
  não estão implementados** e não devem ser declarados prontos. Remover a
  tabela agora exigiria migração do schema Room sem ganho para o fluxo atual;
  criar um produtor artificial só para “fechar” o item também seria incorreto.
  A rider-mobile atual envia comandos diretamente ao piloto e o readiness já
  declara comandos offline como capacidade limitada;
- **SUCESSÃO 2026-10-01:** a retenção local foi ligada de forma **fail-preserve**. O aparelho só calcula corte quando `/api/policies` traz retenção do termo publicável, o hash é o termo vigente e existe aceite desse mesmo hash pelo mesmo motoboy no mesmo aparelho. Só pontos `sent` vencidos são removíveis e a viagem ativa é sempre preservada. Sem política/aceite válido, nada é apagado. O prazo real continua **DECISÃO HUMANA ABERTA** no checklist; nenhum default 30 foi promovido;
- **SUCESSÃO 2026-10-01:** o Kotlin **não descarta mais** o receipt do GPS.
  `SyncWorker` interpreta contagens/rejeições com `decideGpsReceipt`, marca
  aceitos como `sent`, rejeitados como `rejected` e falha/retry em receipt
  inconsistente. O que continua não existindo é uma **entidade separada de
  receipt durável**; isso só deve virar requisito se houver uma necessidade de
  auditoria que o estado Room + event log idempotente não cubram.

**Fronteira atual de C5:** não há defeito ativo do caminho GPS identificado
nesta lista. A única superfície restante é uma capacidade futura explícita:
**comandos offline nativos = NOT_IMPLEMENTED**, sem impacto no GPS offline já
provado.

---

## D. Próximo comando exato na retomada

> **Histórico (2026-07-27).** A frente descrita aqui — a rota de ingestão no crítico — foi fechada
> depois. A retomada atual está no CLAUDE.md, §13.

```bash
npm run test:platform:bridge && npm run test:platform:skills && npx tsc --noEmit
```

Se os três estiverem verdes, o checkpoint está íntegro e a próxima frente é
ligar a rota de ingestão no `src/platform/bin/critical.ts` — o adapter, a
validação e o recibo já existem e estão testados; falta o `PgDeviceRegistry`
sobre `identity.device` e o wiring HTTP.

---

## Atualização — Unidade 1 concluída (2026-07-27)

> **Sucessão (2026-09-25):** o "CORRIGIDO" da linha seguinte era insuficiente — o aparelho pedia o
> token, mas nenhum servidor o emitia. O C1 só fechou com a Cadeia Real; ver o marcador em C1.

**C1 (P0 do Android) está CORRIGIDO.** Ver commits `a5fe45d` e `4456f2e`.
A reprodução revelou que era pior do que o registrado: com 401, `doWork`
retornava `Result.success()` — o WorkManager dava a sincronização por concluída.

### Bloqueador novo, menor

**B3 — token sem cifragem por Keystore.**

> **SUCESSÃO — FECHADO NO CÓDIGO/AVD em 2026-10-01.** Token de sessão e
> segredo próprio do aparelho agora são cifrados em repouso com
> `AndroidKeyStore` + `AES/GCM/NoPadding`, chave não exportável e AAD distinto
> por finalidade. O SQLite guarda `enc:v1:...`, não o valor em claro.
>
> Credenciais legadas em claro são migradas no primeiro uso sem trocar a
> identidade do aparelho. Se a chave local sumir, o token substituível é
> descartado para forçar bootstrap; o segredo do aparelho **não é regenerado
> silenciosamente** e as filas GPS permanecem intactas. A criação da chave é
> sincronizada para o primeiro uso concorrente não rotacionar o alias.
>
> Provas no AVD Android 14: Android estrutural **43/43**, unitários
> `BUILD SUCCESSFUL`, instrumentados **18/18** com SQLite + Keystore reais;
> gate JVM independente também `BUILD SUCCESSFUL`. `android:allowBackup=false`
> e exclusão de banco nas regras de extração continuam ativos.
>
> Limite: isto protege **credenciais em repouso** contra extração do SQLite.
> Não protege um aparelho já comprometido enquanto o processo está executando
> e não substitui o gate em aparelho físico, que continua `NOT_RUN`.

### Registro histórico — C2, C3, C4, C5 eram abertos

Estado atual por sucessão: **C2** e **C3** estão fechados no código/AVD;
**C4** está CODE_READY + TEST_PASS, com ativação/PostgreSQL real ainda pendentes;
**C5** foi parcialmente reduzido (retenção e receipt corrigidos), mas continuam
abertos os resíduos que ainda aparecem na seção C5 atual.

## Atualização — Unidade 2 (2026-07-27)

**B4 — dois tipos de evento aceitos sem consumidor.** `source_event_received` e
`order_state_changed` estão em `EVENT_TYPES`, então `checkEvent()` os aceita.
Gravados hoje, iriam para a outbox, não encontrariam handler, e terminariam em
dead-letter depois de gastar as tentativas.

Não receberam schema de propósito: contrato para evento que ninguém produz nem
consome é acordo entre partes que não existem. Formalizar quando o Store Agent
ou a ponte de pedidos tiverem produtor real.

## Atualizacao - Unidade 3D (2026-07-27)

**B4 resolvido no caminho de ingestao.** Os dois tipos sem consumidor
(`source_event_received`, `order_state_changed`) agora sao recusados ANTES de
gravar, com a classe `nao_roteavel`. Eles nao entram mais na outbox e nao
queimam tentativas ate dead-letter.

Continuam aceitos por `checkEvent` de proposito: o catalogo registra que eles
existem. A recusa e no roteamento, que e onde a decisao pertence.

### Nao exercitado nesta unidade

A rota nao foi chamada por HTTP real. A decisao mora em modulo separado e e
testada em processo (D25); o servidor em si foi exercitado no Macro-Prompt 1,
com `/health` e `/ready` contra PostgreSQL real. O trecho de leitura de corpo
em `critical.ts` nao tem cobertura direta.

## Atualizacao - Unidade 4A forense (2026-07-27)

**B1 reclassificado.** O port do Conference Brain continua NAO ACEITO, mas a
causa dos 5 testes falhos foi reproduzida e e outra: sao GUARDAS DE
NAO-REGRESSAO sobre modulos vizinhos, e nao dependencia ausente do nucleo.

O numero correto do nucleo e **309/309**. `314/314` nunca foi alcancavel
portando so o Conference Brain, porque cinco daqueles testes so passam num
repositorio que tambem tenha `src/live/interface/` e `src/capacidade-viva/`.

Gate de auditoria independente executado: **12/12**.

Ver `docs/execution/CONFERENCE_BRAIN_FORENSE.md`.

### Nao provado nesta analise

Tres itens aparecem corrigidos no codigo e **nao tem gate independente**:
agendamento desativado, acoes/indicadores antigos, e recuperacao apos
corrupcao. Classificados como PARECE CORRIGIDO, NAO PROVADO.

Os 21 documentos de `docs/conference-brain/` nao foram auditados linha a linha.

## Atualizacao — Unidade 6 (2026-08-01)

**B2 (Figma) RESOLVIDO.** `docs/figma/` existe com 13 documentos, e as tres paginas do arquivo
`IMWH8ZKMF5ra3QJYiR6vGa` estao preenchidas. Correcao de registro: o Figma **nao estava vazio**
quando esta unidade comecou — `01.1`, `01.2` e 49 variaveis ja existiam, e o registro anterior
dizia o contrario. Ver E154 e `docs/figma/FIGMA_IMPLEMENTATION_PLAN.md`.

### Bloqueadores novos, todos de LEITURA (nenhum impede o trabalho local seguir)

**B5 — nao existe rota de leitura do estado do aparelho.** O Android publica por
`POST /api/gps/batch`; nao ha endpoint que devolva credencial, GPS, ultima sincronizacao, fila
offline ou revogacao. A tela de Entregas declara os cinco como `integracao_pendente` em vez de
desenhar zero. **O que destravaria:** uma rota de leitura sobre `identity.device` e sobre o estado
de sincronizacao — decisao de produto, porque expor saude de aparelho por unidade toca vigilancia.

**B6 — nao existe historico em superficie nenhuma.** A projecao devolve o estado atual e a ponte
devolve a avaliacao atual. Reconstruir historico exigiria varrer o event log (Operacao Viva) ou ler
o status ja gravado no store (Copiloto), e nao ha rota para nenhum dos dois.

**B7 — nao ha autenticacao no Product System, e por isso nao ha acao.** A retirada de recomendacao
e funcao pura. Sem identidade de quem retira, oferecer o botao seria fingir um controle. **O que
destravaria:** decidir o modelo de sessao humana desta superficie.

**B8 — multi-unidade e de apresentacao.** O seletor funciona e preserva contexto, mas so ha uma
unidade de demonstracao. Trocar de unidade nao muda fonte de dados porque nao ha segunda fonte.

### Divergencias Figma ↔ codigo ainda abertas

`wash/*`, grid, foco e motion existem no codigo e nao como variavel no Figma (alfa e breakpoint nao
sao expressaveis como variavel no plano atual). Sem prototipo interativo — por decisao. Sem Code
Connect. `inspetor`, `tabela` e `skeleton` existem no codigo e nao no Figma. Ver
`docs/figma/FIGMA_CODE_PARITY_MATRIX.md` §4.

### C2, C3, C4, C5 seguem abertos

Reavaliacao do portao durante a viagem · corrida na `sequenceLocal` · GPS do piloto em RAM ·
residuos de bind `0.0.0.0` e extrator de dimensoes. A Unidade 6 nao os tocou.

---

## PB9 — A home foi construida sobre a linguagem visual ERRADA

**Categoria:** bloqueio de produto · **Aberto em** 2026-08-02 · **Severidade:** alta

**O fato.** A home operacional de R2 foi construida sobre o Design System da
Unidade 6 (paleta clara "Campo Vivo", cartoes em grade) usando `app-v1` como
referencia de comportamento. `docs/design/VISUAL_REFERENCE_HIERARCHY.md` diz, em
letra propria, que `app-v1` e **Nivel 5 — `historical_reference_only`, NAO pode
definir direcao visual**, e que a autoridade e:

```
Nivel 1  Sprint Visual DeliveryOS V2        prevalece sempre
Nivel 2  Organismo Operacional V3.3         implementacao validada
Nivel 5  app-v1 e demos iniciais            NAO define direcao
```

O V3.3 existe no repositorio, inteiro:
`docs/design/canonical/deliveryos-visual-v2/extracted/DeliveryOS Organismo Operacional.dc.html`
— superficie escura (verde profundo `#08130D`, verde vivo `#8CC63F`, creme,
ambar, neutro tracejado, cinza-ardosia), areas que CRESCEM em degraus, ligacoes
que aparecem so quando a dependencia esta ativa, pressao que se espalha pelo
caminho do pedido, fluxo mobile geral -> area -> atencao -> voltar, voz,
fechamento de turno, e dez estados tecnicos que "falam em cinza, nunca viram
pressao".

**A causa raiz e a MESMA da auditoria de realinhamento.** `CLAUDE.md` §11 e o
indice canonico do produto nao referenciam `docs/design/`. Quem retoma encontra o
estado tecnico e o Design System da Unidade 6, e **nao encontra a hierarquia
visual**. Foi assim que a Unidade 6 desenhou, e foi assim que R2 desenhou de novo.
A propria missao deste bloco listou como fonte "o prototipo original executado por
`tools/servir_v1.js`" e "o Design System atual" — nunca `docs/design/`.

**O que NAO esta errado.** A camada de comportamento: view models, contrato de
areas, motor de sinais, travas de ausencia, procedencia e os tres gates. Nada
disso depende da paleta. O que precisa ser refeito e a EXPRESSAO.

**O que destrava.** Ler `docs/design/CANONICAL_VISUAL_MANIFEST.json` e a
hierarquia ANTES de qualquer trabalho visual, e reconstruir a expressao da home
sobre o Nivel 1/2. `src/product/ui/surfaces/home.css` e
`src/product/ui/surfaces/home.js` sao os arquivos a refazer; `home-vm.ts`,
`sinais.ts` e `areas.ts` sobrevivem.

**Correcao de processo exigida:** `CLAUDE.md` §11 e o indice canonico precisam
incluir `docs/design/VISUAL_REFERENCE_HIERARCHY.md` na ordem obrigatoria de
leitura. Sem isso, a proxima sessao repete pela terceira vez.

### PB9-visual — SITUACAO EM 2026-08-02

**Causa de processo: FECHADA.** `CLAUDE.md` §11 ganhou o item 4, e o indice
canonico ganhou a §2.1 com a ordem visual vinculante (D52). A ordem e executavel:
`npm run test:platform:visual-order` — 6 testes, e a mutacao que apaga a
hierarquia do item 4 derruba a guarda (ver L33).

**Expressao visual: REFEITA sobre o Nivel 1/2** em `home.css` e `home.js`, com
`ligacoes` acrescentadas a `home-vm.ts` (D53). `sinais.ts` e `areas.ts` nao
mudaram de regra. O bloqueio deixa de valer para a home; ele **continua valendo
para toda superficie ainda desenhada sobre o Design System da Unidade 6** —
Entregas, Operacao Viva, Conference Brain, Copiloto e modulo futuro nao foram
tocadas nesta missao e seguem em linguagem de Nivel 4.

### PB11 — O Figma nao acompanhou a expressao canonica

**Categoria:** bloqueio de produto · **Aberto em** 2026-08-03 · **Severidade:** media

**O fato.** A expressao da home foi refeita sobre o Nivel 1/2 e revisada no
navegador, mas o arquivo `DeliveryOS — Product System` (`IMWH8ZKMF5ra3QJYiR6vGa`)
continua mostrando a linguagem do Design System da Unidade 6. Codigo e desenho
divergiram, e a matriz Figma-codigo nao foi atualizada.

**Por que ficou assim, e nao e esquecimento.** A missao ordena, em letra propria,
que o Figma so comece **depois** da revisao visual do frontend, e proibe abrir
superficie nova depois de 60% do contexto. A revisao — que achou dois defeitos
reais — consumiu o orcamento. Parar aqui foi cumprir a regra, nao ignora-la.

**O que destrava.** Uma sessao nova, com a expressao ja aprovada localmente:
pagina 00 orientada ao valor operacional, pagina 02 com Calmo, Ambiente, Foco,
aproximacao, falha tecnica, parcial e sem integracao — desktop e mobile.
Preservar `01 — Design System`. Registrar node IDs e conferir por screenshot.

**O que NAO destrava.** Recomecar o desenho da home. A expressao esta aprovada
localmente e coberta por 18 testes; o Figma precisa alcanca-la, nao substitui-la.

**RECLASSIFICADO em 2026-08-03, por decisao do Cesar (D59).** PB11 bloqueia
**apenas duas coisas**: o fechamento documental do ciclo visual e a paridade
NATIVA com o Figma. Ele **nao** bloqueia a continuidade tecnica do DeliveryOS e
**nao** bloqueia R5.

O que sustenta a reclassificacao: a autoridade visual nunca foi o Figma. Ela e o
Sprint Visual V2 e o Organismo Operacional V3.3, e a expressao vigente ja esta
implementada, aprovada e coberta por 27 testes de organismo mais 44 de home. O
Figma e o espelho documental dessa expressao — util, exigido, e nao soberano.

**O que permanece em vigor enquanto PB11 estiver aberto:**
- PB13 registrado, com a medicao da cota intacta;
- os 18 `PENDENTE-PB13` na matriz, e **nenhum node ID inventado**;
- o **frontend aprovado** como referencia visual EXECUTAVEL (`npm run ui:product`);
- Sprint Visual V2 e Organismo V3.3 como autoridades visuais;
- `MOTION_SYSTEM.md`, `MOTION_TOKENS.json` e as duas matrizes como documentacao canonica;
- **proibicao de qualquer alteracao visual durante R5** — frontend, Figma, sinais,
  areas e identidade visual ficam congelados.

**Decisao registrada do Cesar:** nao havera upgrade de plano e os 18 cenarios nao
serao redesenhados a mao. O Figma fica pendente.

### PB12 — O OriginKit nao pode ser inspecionado deste ambiente

**Categoria:** bloqueio de ambiente · **Aberto em** 2026-08-03 · **Severidade:** media

**O fato, medido.** `https://www.originkit.dev/` **abre**: a navegacao completa e o
titulo da pagina chega ao agente (`Originkit — Free Animated component library
for modern websites`, `Click Effects — ... · Originkit`, `Background Components ·
Originkit`). Mas **toda leitura de conteudo falha**:

| Caminho tentado | Resultado |
|---|---|
| `screenshot` (3 tabs, 6 tentativas) | `Policy check temporarily unavailable; retry.` |
| `get_page_text` | idem |
| `read_page` | idem |
| `javascript_tool` | idem |
| `WebFetch` na raiz e em `/intro` | **HTTP 403 Forbidden** |

O mesmo navegador le `http://localhost:5290` normalmente na mesma sessao — o
bloqueio e da origem externa, nao do navegador.

**Consequencia declarada, e ela e a instrucao da propria missao.** A etapa de
motion **NAO pode ser declarada completa**. Nada do OriginKit foi analisado nesta
sessao, e **nada foi reconstruido de memoria** — reconstruir seria inventar a
fonte, que e exatamente o que a missao proibe.

**O que NAO fica bloqueado por isso.** O `MOTION_SYSTEM.md` deste repositorio ja
existe, ja e canonico e ja governa o movimento (autoridade 6 da ordem desta
missao). O trabalho de movimento desta sessao deriva dele, do Organismo V3.3 e
das decisoes visuais do Cesar — nao do OriginKit. A coluna OriginKit da matriz
fica marcada **NAO INSPECIONADO**, nunca preenchida por suposicao.

**O que destrava.** Uma sessao em que o servico de verificacao do navegador
esteja no ar, ou o conteudo do OriginKit trazido por outro caminho autorizado
pelo Cesar. Nao ha nada a corrigir no repositorio.

**RECLASSIFICADO em 2026-08-03 — `OriginKit external review deferred — non-blocking` (D57).**
A medição acima continua válida e não foi apagada. O que muda é o peso: o OriginKit é **referência
externa opcional de qualidade**. Não é autoridade visual · não é dependência · não prevalece sobre
V2/V3.3 · não bloqueia Figma · não bloqueia paridade · não bloqueia o fechamento visual. A etapa de
movimento **não** fica presa a ele — ela deriva de `MOTION_SYSTEM.md`, do V3.3 e das decisões do
César, e agora está medida com a preferência real de reduced motion. Continua proibido declarar que
o OriginKit foi analisado, reconstruir componentes de memória ou inventar a matriz de referência.

### PB13 — A cota do plano Figma cortou leitura e escrita no meio da sincronização

**Categoria:** bloqueio de ambiente · **Aberto em** 2026-08-03 · **Severidade:** alta
(é o que segura PB11)

**O fato, medido.** As três páginas do arquivo `IMWH8ZKMF5ra3QJYiR6vGa` foram inspecionadas com
sucesso no início da missão — inventário completo em `docs/figma/FIGMA_ORGANISMO_PARITY_MATRIX.md`
§5. Na quarta chamada, o servidor passou a responder:

| Chamada | Resultado |
|---|---|
| `use_figma` (ler fontes disponíveis e a estrutura da capa) | `You've reached the Figma MCP tool call limit on the Starter plan` |
| `get_metadata` (`0:1`) | idem |
| `get_metadata` (`2:2`), minutos depois | idem — **não é limite de rajada** |
| `whoami` | responde: `Cesar Spichencoff`, seat **View**, tier **starter** |

A mensagem aponta para a página de upgrade (`upgrade=mcp_rate_limit_paywall`), então é cota de
plano, não indisponibilidade momentânea.

**Consequência declarada.** Nenhum frame do organismo foi criado, nenhuma página foi reescrita,
nenhum screenshot de Figma foi tirado. **Nenhum node ID foi inventado** — a matriz traz o token
`PENDENTE-PB13` nas 18 linhas obrigatórias, e a guarda `npm run test:platform:figma-parity` aceita
**apenas** um ID real (`\d+:\d+`) ou esse token exato. Um Figma sincronizado pela metade mente sobre
qual é a expressão vigente; uma matriz com ID inventado mente pior, porque parece verificável.

**O que NÃO fica bloqueado por isso.** A matriz canônica, o gate de paridade, as seis mutações
dirigidas, a validação real de reduced motion e a reclassificação do OriginKit — tudo feito e
provado nesta sessão. Falta o desenho.

**O que destrava.** Cota renovada, plano com mais chamadas de MCP, ou o desenho feito na interface
do Figma pelo César com os node IDs trazidos de volta para a coluna da matriz. Não há nada a
corrigir no repositório.

## PB19 — Defeitos de implantação da composição oficial · **FECHADO em 2026-09-22**

Três defeitos **pré-existentes** encontrados pelo C3 e reproduzidos de novo no PB19. Nenhum é da
Intelligence Spine; todos são da composição. Detalhe e prova em
`docs/etapa-4-8/PB19-DEPLOY-REALITY.md`.

- **D1 — TLS contra rede privada.** `deploy/compose.platform.yaml` aponta o banco por
  `deliveryos-postgres` com `DELIVERYOS_DATABASE_SSL=false`; `isLocalUrl` só aceita
  `localhost`/`127.0.0.1`/`::1`, e a configuração recusa banco remoto sem TLS. Medido: os três
  serviços que herdam `x-ambiente` sairiam `78` e a composição nunca sobe.
- **D2 — segredo de aparelho ausente na composição.** `DELIVERYOS_DEVICE_TOKEN_SECRET` não
  aparece em lugar nenhum do compose, e o crítico falha fechado sem ele.
- **D3 — asset obrigatório fora da imagem.** Duas causas independentes com o mesmo sintoma
  (`/ready` 200 + GPS 503). **D3b** (`docs/contracts/eventos.schema.json` fora da imagem, lido de
  `process.cwd()`) é a que acontece com o `Dockerfile` como estava, e foi **FECHADA**: asset no
  `dist` por `tools/copiar_contratos.js`, resolução relativa ao módulo, e falha fechada no boot.
  **D3a** (schema/banco parcial) também foi **FECHADA**: o carimbo escrito em `dist/` guarda o
  SHA-256 do fecho de imports dos três binários mais os assets, e o gate recalcula e compara —
  artefato velho deixa de poder passar por novo.

**Os quatro estão fechados**, cada um com mutação que restaura o defeito e exige que a guarda
acuse pela assinatura certa: `test:platform:pb19:mutacoes`, **14/14, zero cegas**. A composição
oficial subiu de verdade, com os arquivos reais e sem variante que contorne.

### Bloqueio declarado, não contornado

O estágio de **runtime** de `deploy/Dockerfile.platform` instala `dumb-init` por `apt`, e a
política de rede deste sandbox recusa **todos** os repositórios Debian — `HTTP 403` medido em
`deb.debian.org`, `security.debian.org`, `ftp.debian.org`, `cloudfront.debian.net`,
`debian.map.fastlydns.net`, `mirrors.edge.kernel.org` e `archive.debian.org`. Por isso a prova da
Fase 5 rodou com um override **declarado**, que para no estágio `build` — onde a aplicação é
produzida. Ficam por provar, e **não estão escondidos**: `dumb-init` como PID 1 (encaminhamento de
SIGTERM), `USER node`, `npm prune --omit=dev` e o tamanho final da imagem. Os quatro dizem
respeito a empacotamento, não ao comportamento que o PB19 fecha.

> **SUCESSÃO — 2026-10-01 · CAMADA LINUX DO SIGTERM PROVADA.**
> O desconhecido foi reduzido sem fingir Docker: em WSL2/Node Linux, SIGTERM real chegou ao
> processo, o helper canônico de shutdown drenou e fechou antes de sair 0; o controle com timeout
> saiu 1 e não executou `close`. Um binário real, `entregas-source-ingest`, em modo desligado
> (sem abrir banco), também recebeu SIGTERM e saiu 0. Gate: `LINUX_SIGTERM 3/3 PASS`.
>
> **SUCESSÃO — 2026-10-01 · DUMB-INIT BOOKWORM COMO PID1 PROVADO FORA DA IMAGEM.**
> O pacote Debian Bookworm `dumb-init 1.2.5-2` foi baixado sem instalação, conferido contra o
> SHA-256 oficial `a8eae71e…60afd` e executado em namespace Linux com `NSpid=1`.
> Ele supervisionou o `entregas-source-ingest` real desligado; SIGTERM enviado ao PID externo
> do `dumb-init` foi encaminhado ao filho e o launcher encerrou com exit 0
> (`DUMB_INIT_PID1_SIGTERM_PASS`). Controle negativo com SHA alterado foi recusado com exit 4.
>
> Portanto **Linux -> dumb-init PID1 -> Node handler** está PROVEN fora de Docker.
>
> **SUCESSÃO — 2026-10-02 · PRUNE E EXECUÇÃO NÃO-ROOT PROVADOS FORA DA IMAGEM.**
> Em cópia temporária do `node_modules`, `npm prune --omit=dev` real reduziu
> 56.193.119 -> 436.961 bytes, removeu TypeScript/Playwright e preservou
> `pg@8.13.1` funcional. O `dist/` do build oficial rodou como UID 65534
> (`nobody`) e encerrou com SIGTERM exit 0; app copiado mediu 3.971.689 bytes.
> A tentativa de `npm ci --offline` em diretório vazio falhou por pacote ausente
> no cache, portanto não foi promovida como prova de build limpo.
>
> **SUCESSÃO — 2026-10-02 · IMAGEM RUNTIME FINAL PROVADA EM DOCKER REAL.**
> GitHub Actions run **36968177991** construiu `deploy/Dockerfile.platform`
> sem override, em `ubuntu-latest`, sobre o produto `9a2b99c` (a branch de
> prova diferia apenas pelo workflow). O gate verificou `USER node`,
> `ENTRYPOINT ["dumb-init","--"]`, ownership `node:node`, `pg@8.13.1`
> presente, TypeScript/Playwright ausentes, build-stamp exato, imagem de
> **231.158.743 bytes** e `/app` de **4.294.489 bytes**.
>
> O binário real `entregas-source-ingest.js` foi executado dentro da imagem;
> `/proc/1/cmdline` mostrou `dumb-init -- node ...` e `docker stop -t 5`
> encerrou com exit **0**. A execução verde terminou com todos os passos
> SUCCESS. O primeiro run `36967981792` foi descartado como prova porque o
> gate esperava incorretamente que um serviço persistente terminasse sozinho.
>
> Portanto a **imagem final deixa de ser NOT_RUN**.
>
> **SUCESSÃO — 2026-10-02 · COMPOSIÇÃO OFICIAL FINAL PROVADA EM DOCKER REAL.**
> GitHub Actions run **36969232567** executou a composição oficial sobre o
> produto equivalente ao HEAD principal: a diferença entre o commit testado
> `b317a8a` e `5e5e0f7` era somente o workflow temporário.
> `tools/papeis_compose_real.sh` terminou **45 medidas verdes**:
> crítico healthy, migration/papéis exit 0, assíncrono running; conexões reais
> como `deliveryos_critical`/`deliveryos_async`; sessão+GPS aceitos;
> pré-vínculo preservado; outbox drenada; replay completo após restart;
> sabotagens recusadas por privilégio; senha administrativa ausente dos
> runtimes/processo/logs; reaplicação idempotente dos papéis.
>
> Depois do cleanup, `test:platform:deploy` passou **30/30**, governança ficou
> GREEN e `git diff --check` passou. O marcador final foi
> `PLATFORM_COMPOSE_FINAL_PROOF_GREEN`.
>
> Assim, **`docker compose up` também deixa de ser NOT_RUN**. O que continua
> aberto é efeito operacional: deploy, credenciais reais, migrations/cutover
> no banco operacional, aparelho físico e backup off-host.

### D4 — **FECHADO em 2026-09-22** (`docs/etapa-4-8/D4-EVIDENCIA.md`)

`labs/operacao-viva-v4/testes/run-lab-v4-browser.ts` apaga o diretório de evidências na linha
**177** e só tenta subir o navegador na **182**. Apaga antes da operação que pode falhar: se o
navegador não sobe, os 13 arquivos versionados já foram e nada os regenera. Reproduzido **3 de 3**
nesta sessão; restaurado por `git checkout --` todas as vezes, com `git diff --stat HEAD` vazio
depois de cada uma.

Com o navegador no ar — destravado **fora do repositório**, por symlink em `/opt/pw-browsers/`,
porque o ambiente traz o build `1194` e o Playwright 1.61.1 pede o `1228` — o gate vai a
**PASS** e os arquivos voltam. Foi por isso que o defeito só aparecia enquanto o gate estava
bloqueado.

Ficou sem correção durante o PB19, por estar fora do escopo daquela missão, e foi **fechado em
missão própria** — na classe, não só na ordem das linhas.

O que mudou: rodar teste e publicar evidência viraram superfícies separadas. O gate normal grava
num temporário e o descarta, e **recusa** ser apontado para o diretório versionado por comparação
de caminho real (symlink e `..` não contornam). `npm run evidence:lab:v4:refresh` é o único
caminho que substitui o conjunto, com estágio adjacente e gitignorado, gate inteiro verde,
conferência nome a nome e troca por dois `rename` — inteiro ou nada. Guardas:
`test:lab:v4:evidencias` (11/11, dentro da cadeia `test:lab`) e
`test:lab:v4:evidencias:mutacoes` (6/6, zero controles cegos).

**A decisão do César sobre as 12 capturas:** continuam versionadas como evidência visual
histórica, e continuam **preservadas**. Nenhum build de Chromium foi eleito referência canônica:
o manifesto de procedência declara `browser_provenance: UNKNOWN_FOR_EXISTING_BASELINE`, porque
nada registra qual navegador as gerou. A regeneração deliberada mede a procedência de verdade,
inclusive o executável que **de fato rodou** — e este ambiente mostrou por que isso importa:
`chromium.executablePath()` devolve um arquivo que não existe, já que `launch()` em headless usa
outro caminho.

**Registrado porque não pode se perder:** a primeira versão da suíte de controle **destruiu os 12
PNGs que existia para proteger**. Dois casos rodavam o refresh contra o repositório, um tinha uma
corrida entre `listen()` assíncrono e `spawnSync`, o bloqueio nunca existiu e o refresh publicou.
Restaurado por `git checkout --`, conferido byte a byte. A correção não foi consertar aquele
caso: todo exercício do refresh passou a rodar numa raiz espelho, onde o patrimônio nunca é o
alvo.

### Bloqueio de precondição — **FECHADO em 2026-10-01**

`test:platform:m1b-perceptual` dependia de um servidor M1 na porta `5292` e, quando ele não
existia, morria em `ECONNREFUSED` com stack trace cru. A precondição agora é sondada antes de
abrir o Chromium: indisponibilidade de rede/timeout é declarada **PULADA em voz alta** e termina
com `M1B_PERCEPTUAL_GATE_SKIPPED`; servidor presente com HTTP inválido continua vermelho.

A distinção ganhou gate próprio: `test:platform:m1b-precondition` **3/3 PASS** (conexão recusada,
HTTP 404 e endpoint válido). E a medição perceptiva deixou de ficar só no papel: o Product System
foi servido localmente em `127.0.0.1:5292` via `PRODUCT_UI_PORT=5292`, a procedência
`home.css servido == worktree` fechou e as cinco mutações perceptivas passaram **5/5**, restaurando
os arquivos ao hash de origem após cada ataque. Com o listener removido, o mesmo comando declarou
PULADO e saiu 0 sem stack trace. Isso corrige a legibilidade da precondição sem transformar
`NOT_RUN` em verde silencioso.

**D5 — FECHADO pela Q-016 em 2026-09-23.** `platform.event_log` não tinha coluna `source_mode`, e o
modo só viajava no envelope e na outbox. A migration 0003 o tornou durável, sem default e
obrigatório para fato novo; o histórico anterior fica `NULL` = UNKNOWN. Ver
`docs/etapa-4-8/Q016-REPLAY.md`.

### Q-017 — o modo de todo fato vem de um padrão implícito · **FECHADO em 2026-09-23**

`src/platform/bin/critical.ts` faz `process.env.DELIVERYOS_SOURCE_MODE ?? "real"`, contra o próprio
comentário ("Sem padrão silencioso") e contra a interface da rota ("Nunca tem padrão implícito").
Nenhum arquivo de `deploy/` declara a variável. Na composição oficial, todo fato é carimbado
`real` por padrão — e desde a Q-016 esse carimbo é **durável** e alimenta o replay. Medido no banco
de teste: os GPS gravados pelo binário crítico nos gates do PB19 estão `real` sem que nada os tenha
declarado. Não corrigido: exige mudar o caminho crítico e a composição. Aberta como `Q-017`,
`default_behavior: PAUSE` — o comportamento atual segue até decisão do César.

**Fechado pela decisão do César (2026-09-23): ausente não é real.** O crítico recusa o boot (78)
sem modo declarado, antes de conexão e migration; o compose exige a variável só no crítico. A
pegada do defeito, medida no banco compartilhado deste sandbox antes da regressão final: **11 GPS
sintéticos do controle positivo do PB19 gravados `real`**. Depois da correção o mesmo controle
grava `simulated`. Ver `docs/etapa-4-8/Q017-SOURCE-MODE.md`.

### Achado da Q-017 — o append-only do event log não cobre `TRUNCATE` · **FECHADO em 2026-09-23**

A trava da 0001 é `BEFORE UPDATE OR DELETE … FOR EACH ROW`; `TRUNCATE` não dispara gatilho de
linha. Provado em banco isolado: `UPDATE` e `DELETE` recusados, `TRUNCATE` passa calado e leva
tudo. As 11 linhas acima sumiram assim, no meio da regressão: `run-backup-restore-tests.ts`
faz `TRUNCATE platform.event_log` para simular perda. A L3 promete mais do que o banco garante.
**Não corrigido**: o event log está no Preservation Set, fechar o buraco é DDL nova e o teste de
backup depende dele — decisão do César.

**Fechado pela decisão do César (2026-09-23), como correção de invariante existente.** Migration
0004: `BEFORE TRUNCATE ... FOR EACH STATEMENT` com a mesma função da 0001. O teste de backup
deixou de depender do buraco e de tocar no banco compartilhado: cria a própria fonte e o próprio
destino, e só apaga os dois. Provado executando, também depois de `pg_dump`/`pg_restore`. Ver
`docs/etapa-4-8/APPEND-ONLY.md`.

**Limite que fica, declarado:** a trava recusa escrita de qualquer papel, mas quem é dono da
tabela ou superusuário ainda consegue desligá-la (`DISABLE TRIGGER`, `session_replication_role`).
Na composição oficial, o runtime conecta como `POSTGRES_USER`, que a imagem do PostgreSQL cria
como superusuário. Separar o papel do runtime do dono do schema é IAM: hoje não bloqueia nada, e
não foi aberto como pergunta.

**Limite fechado na certificação da Cadeia Real (2026-09-25).** A composição oficial deixou de
conectar os runtimes como `POSTGRES_USER`. O job `deliveryos-papeis` aplica
`deploy/sql/papeis_minimos.sql` como dono depois da migration, e o crítico e o assíncrono conectam
como `deliveryos_critical` e `deliveryos_async`: não superusuário, donos de nada, sem a senha
administrativa no ambiente. Medido em containers reais (`tools/papeis_compose_real.sh`, 44/44), com
a credencial do PRÓPRIO runtime: `DISABLE TRIGGER` e `DROP TRIGGER` dão `must be owner`;
`session_replication_role`, `DELETE` e `TRUNCATE` dão 42501. Dono e superusuário continuam capazes
de desligar a trava — agora só o lado administrativo.

### Cadeia real — o aparelho não conseguia o primeiro token · **FECHADO em 2026-09-24**

O Android chamava `POST /api/device/session` esperando `device_token`. O runtime crítico respondia
404 (medido com o binário de `0b8803c`); o servidor do piloto respondia 200 sem token
(`handleDeviceSession` só devolve `device_id`/`rider_id`). O `SyncWorker` classificava os dois como
"falhou temporariamente" e ficava em laço: nenhum ponto de campo subia, nunca. Fechado no runtime
crítico por vínculo de segredo do aparelho (migration 0005, `auth/device-session.ts`,
`runtime/rota-sessao.ts`). Ver `docs/etapa-4-8/CADEIA-REAL.md`.

**Sucessão — 2026-10-01.** A segunda porta de sessão no piloto foi retirada. `handleDeviceSession`
não existe mais; `/api/device/session` no piloto é somente uma tombstone `503 retryable`
(`device_session_moved_to_platform`) para que APK antigo preserve a fila local. Ela não autentica,
não devolve `rider_id` e não emite token. A única autoridade de sessão do aparelho é a plataforma.

**Sucessão — 2026-10-01:** os dois limites acima foram fechados no código.
A janela de primeiro contato deixou de existir no runtime: a autorização humana exige
`device_id + device_proof_sha256`, pré-vincula `secret_hash` e o bootstrap recusa cadastro
sem hash com 401 `segredo_nao_vinculado`. O papel crítico perdeu UPDATE sobre
`secret_hash/secret_bound_at`. O `jti` também deixou de derivar só de aparelho+segundo e usa
entropia aleatória por emissão.

**Sucessão de prova — 2026-10-01:** PostgreSQL real desta mudança agora está **PROVADO** em cluster
PostgreSQL 18 efêmero, isolado e destruído ao final: Cadeia Real **36/36 GREEN**. C2/C3 provaram
pré-vínculo antes do bootstrap e preservação de `secret_bound_at`; D1b provou a leitura canônica
por viagem/modo; P1 exigiu `current_user=session_user` dos papéis mínimos e P4/P5 provaram
negação real das sabotagens. A execução terminou sem banco ou role `cadeia_*` remanescente.
**Aparelho físico permanece NOT_RUN** e esta prova não autoriza deploy nem troca de ambiente.

### Android — o app não compila neste ambiente · **BLOCKED (externo), medido em 2026-09-25**

JDK 17 instalado (OpenJDK 17.0.20.1, repositório Ubuntu), e o wrapper Gradle 8.9 funciona. O build
do app para no primeiro passo: o AGP 8.5.2 vem de `dl.google.com/dl/android/maven2` (é o atalho
`google()`; `maven.google.com` responde 301 para lá), e a política de rede deste ambiente nega
`dl.google.com:443` — o gateway responde 403 ao CONNECT. O Android SDK 34 e os build-tools vêm de
`dl.google.com/android/repository`, também negado; `dl-ssl.google.com` e `redirector.gvt1.com` também
caem. `testDebugUnitTest`, `assembleDebug` e instrumentados: BLOCKED. Desbloqueio: liberar
`dl.google.com` na rede do ambiente, ou uma máquina com SDK — a missão do aparelho físico.

**Pré-existente, achado no caminho:** `android/gate-verification` não compila desde `4456f2e`
(2026-07-27): `EntregasApi.kt` usa `DeviceSession.semSegredo`, e `DeviceSession.kt` importa o Room,
fora do build JVM. Falha idêntica em `0b8803c`. Ninguém viu porque ele nunca rodou: pedia JDK 17,
que não existia aqui. Conserto (levar `semSegredo` a um arquivo Kotlin puro) fica para onde o app
compila. Com um stub fora do repositório, o `EntregasApi.kt` atual compila e o `CaptureGateTest`
passa 12/12 — o diff do Fable nesse arquivo não tem erro de tipo.

**Revalidado em 2026-09-25, 08:09 UTC** (missão do relógio), sem alterar código Android:
`dl.google.com`, `dl-ssl.google.com` e `redirector.gvt1.com` continuam recusados (o gateway responde
403 ao CONNECT); `maven.google.com` responde 301 para `dl.google.com`; `services.gradle.org` e
`repo.maven.apache.org` respondem 200. Continua **BLOCKED (externo)**. O handoff exato — comandos,
pré-requisitos e a bateria física — está em `docs/etapa-4-8/FIELD-GATE-ANDROID.md`.

### Relógio do aparelho — `occurred_at` adiantado entra carimbado `trusted` · **FECHADO em 2026-09-25** (aberto no mesmo dia)

> **SUCESSÃO — 2026-09-25 · CORRIGIDO. O texto abaixo é o registro de abertura, sem edição.**
>
> Política do César: **CAPTURADO ≠ HORÁRIO CONFIÁVEL.** O ponto é aceito e preservado (coordenada,
> `occurred_at` como veio, `recorded_at` do servidor); o relógio adiantado perde a autoridade
> temporal. O crítico julga o relógio contra a hora do servidor e grava `clock_trust` explícito:
> `suspect` além de 120 s adiantado, com o vocabulário e a tolerância que Entregas já tinha, e regra
> assimétrica — atrasado é ponto capturado sem rede, não relógio errado. O frescor usa a hora do
> servidor quando o relógio não tem autoridade, e ao vivo e replay chegam ao mesmo frescor. Das duas
> perguntas do fim: o ponto é **aceito marcado**; o padrão da coluna **fica**, e o consumidor confere
> o carimbo contra `recorded_at`.
>
> Provas: `test:platform:relogio` (13/13, binários de `dist/` e PostgreSQL) e
> `test:platform:relogio:mutacoes` (13/13: 1 controle e 12 mutações, zero cegas). Limites que ficam:
> `docs/etapa-4-8/RELOGIO.md`, §6.

Reproduzido com o binário crítico de `dist/` e PostgreSQL real, dois aparelhos na mesma unidade: A
com t−30 s, **t+24 h**, t−5 s; B (controle) com t−30 s, t−5 s. O que se mediu:

- o crítico aceita o ponto adiantado: 200 `aceito`;
- **todo** fato fica `clock_trust='trusted'`, inclusive o de +86400 s: é o default da coluna (0001), e
  o writer da plataforma nunca a preenche. O event log é append-only: o carimbo não se corrige depois;
- a projeção e a porta de leitura tomam o MAIOR `occurred_at` como última posição. A fica preso no
  ponto adiantado: `unknown` agora, com os pontos reais mais novos escondidos; B, `fresh`;
- daqui a 24 h, sem nenhum ponto novo, A leria `fresh` — frescor falso de aparelho parado — e B,
  `stale`. É o "saudável por ausência" com atraso;
- o replay dá o mesmo estado em qualquer ordem: a distorção sobrevive a reinício.

**Não corrigido**, por instrução do César: não bloqueia o teste de campo (telefone com data e hora
automáticas não gera ponto mais de 60 s à frente) e a correção toca o carimbo do event log.
Direção provável, a do piloto, que já calcula `clockTrust()` com tolerância: o crítico avalia o
relógio e grava `clock_trust` explícito, e ponto não confiável não vira `ultima_posicao_em`. Decidir
antes: recusar o ponto ou aceitá-lo marcado; e se o default `'trusted'` da coluna deve deixar de
existir. **O teste de campo confere data e hora automáticas no aparelho.**

### Android — nenhuma tela liga a captura nativa · **FECHADO NO CÓDIGO em 2026-09-25** (`Q-018` respondida) — Kotlin NÃO compilado, aparelho NOT_RUN

> **SUCESSÃO — 2026-09-25 · CORRIGIDO NO CÓDIGO. O texto abaixo é o registro de abertura, sem edição.**
>
> Decisão do César (`Q-018`): a rider-mobile liga a captura pela ponte `EntregasNative`; o Kotlin
> segue dono de permissão, GPS, serviço, persistência e sincronização; nenhuma UI nativa nova. A
> página carrega agora a tela do termo e o status de GPS que já existiam, e liga a captura só com
> flag, termo publicável, aceite do servidor para este motoboy e este aparelho, permissão, e a
> viagem dele em `em_rota`/`retornando` (`docs/etapa-4-8/Q018-RIDER-CAPTURA.md`). Provado com o
> piloto real, Chromium e uma ponte falsa com o portão do Kotlin (`test:entregas:rider-bridge`).
> **Não provado:** o Kotlin alterado (políticas pela ponte, `device_id` nas capacidades, aceite de
> outro aparelho recusado) não compilou aqui — `dl.google.com` negado — e nada rodou em aparelho.
> Com a página fechada, o fim da viagem só chega ao serviço quando ela reabre (limite registrado
> abaixo). O termo publicável continua sendo do César (`CHECKLIST_ATIVACAO.md` §A).

Achado na bancada do emulador (`docs/etapa-4-8/BANCADA-EMULADOR.md` §4). O app tem a captura nativa
pronta — `TripLocationService` → Room → `SyncWorker` → `/api/gps/batch` —, mas o serviço é
`android:exported="false"` e só é ligado por `MainActivity.startTripCapture`, alcançado só pela ponte
JavaScript `EntregasNative`. Nenhuma página chama essa ponte: o `rider-mobile/index.html` carrega só
`rider.js`, que manda comandos ao piloto e nunca a toca; `consent-screen.js` e `gps-status.js` têm
suítes verdes (36 e 79 testes) e nenhuma página os carrega. `git log -S EntregasNative` acha só
`4a4fefa` (2026-07-25); nenhum JS, HTML ou TS jamais chamou `startTripCapture`.

Consequência: o app não produz ponto de GPS por mecanismo legítimo. A Cadeia Real foi provada com
aparelho LÓGICO, que grava no Room sem passar por tela — por isso a lacuna não apareceu. Trava o
passo 5 da bateria física e tudo o que depende de ponto capturado.

**Não corrigido:** as duas saídas são decisão do César — a página do piloto (`src/entregas/**`,
Preservation Set) ou uma tela nativa nova. Junto vem o termo publicável
(`docs/entregas/pilot/CHECKLIST_ATIVACAO.md` §A), que também não foi inventado.

### Android — com a página fechada, o fim da viagem não chega ao serviço nativo · **ABERTO, registrado em 2026-09-25** (limite da `Q-018`)

Quem desliga a captura é a página: ela relê a viagem a cada 15 s enquanto há captura, e desliga
quando a viagem deixa `em_rota`/`retornando` (L6). Se o console encerra a viagem com o app em
segundo plano, o desligamento depende de o WebView seguir rodando timers — o Chromium os espaça em
página oculta; não medido. Se o sistema matou o processo e recriou o serviço
(`START_REDELIVER_INTENT` recupera a viagem do Room), nada desliga até o app ser aberto: aí a
página reconcilia e desliga (cenário E3 de `test:entregas:rider-bridge`). **Não corrigido:** o
serviço nativo não tem hoje sinal próprio de fim de viagem, e dar-lhe um é desenho novo. Medir no
Foxxy primeiro (`docs/etapa-4-8/FIELD-GATE-ANDROID.md` §4).

### Piloto — `SyncWorker` fala com o piloto sem credencial · **REGISTRADO, contornado pela D88** (2026-09-25)

`/api/policies` e `/api/term/acknowledge` exigem sessão humana e o `SyncWorker` não tem nenhuma:
401 nos dois, desde sempre (o comentário do próprio worker diz "integração pendente no piloto").
Contornado pela página, que repassa as políticas e o aceite (D88). O aceite gravado no Room fica
`pending` para sempre — inofensivo: o servidor já o tem e o registro é idempotente pelo id.

### Entregas — `run-persistence-recreate-tests` com data fixa vencida · **FECHADO em 2026-09-26** (registrado em 2026-09-25)

> **SUCESSÃO — 2026-09-26 · CORRIGIDO por decisão do César (`8e6be1b`). O texto abaixo é o registro
> de abertura, sem edição.** Reproduzido antes com o próprio harness: a suíte reprovava hoje e
> passava com a data civil deslocada para 2026-07-26. Agora todo carimbo deriva de um "agora" lido uma
> vez (AT2 continua 30 s depois de AT1); dois controles novos provam que a janela segue valendo (mais
> de 30 dias no passado e mais de 24 h no futuro: `impossible_timestamp`). O gate
> `test:entregas:persistence-recreate:relogio` roda a suíte com a data civil deslocada
> (`tools/relogio_deslocado.cjs`) em 2025-08-22, 2026-07-26, hoje, 2026-11-10 e 2036-09-23, e prova
> que enxerga a classe: a data fixa devolvida reprova hoje e passa só na própria data (12/12). A
> cadeia `test:entregas` voltou a rodar inteira, `deploy-audit` incluído.

A suíte posta pontos com `occurred_at` fixo em `2026-07-26T10:00:00Z` (`AT1`, `AT2`), e
`validateSample` recusa ponto mais velho que 30 dias (`impossible_timestamp`). Desde ~2026-08-25 os
testes 4 e 10 falham, e a cadeia `test:entregas` para ali: o `deploy-audit`, último da cadeia, deixa
de rodar por ela. Reproduzido idêntico em `a9b7e1b`, antes da Q-018. Não é defeito do produto — a
regra dos 30 dias está certa; a prova é que envelheceu. **Correção proposta, não aplicada** (fora do
escopo da Q-018): carimbos relativos ao relógio do teste (`agora − N s`), como
`run-device-api-tests.ts` já faz. Enquanto isso, o `deploy-audit` roda à parte (36/36 na regressão da
Q-018).


### Android — o `confirm()` da saída é cancelado em silêncio pelo WebView · **FECHADO NO CÓDIGO em 2026-09-26** (`9966ab5`) — Kotlin NÃO compilado, aparelho NOT_RUN

A rider-mobile confirma a saída e a entrega por `confirm()` (`rider.js:275` e `:304`, desde
`7ff4d50`, 2026-07-20). A `MainActivity` nunca registrou `WebChromeClient`, e sem ele o WebView do
Android cancela o diálogo e a página recebe `false` (Chromium,
`android_webview/glue/java/src/com/android/webview/chromium/WebViewContentsClientAdapter.java`,
`handleJsConfirm`: `mWebChromeClient == null` → `receiver.cancel()`). No aparelho, "Confirmar saída"
não faria nada: a viagem não iria a `em_rota`, a captura nunca ligaria, e a entrega também não
confirmaria. Achado conferindo o roteiro do Foxxy contra o código. O ensaio da nuvem (37/37) e o
`rider-bridge` (27/27) aceitavam todo diálogo no Chromium e o mascaravam (L57).

**Reproduzido antes**, no modelo fiel ao WebView (o diálogo tratado como a `MainActivity` o trata):
`BANCADA_Q018_RED` na saída — "saída NÃO confirmada … nenhuma captura, nenhum fato" — e a trava
estrutural nova vermelha. **Corrigido** com o `WebChromeClient` padrão (D92): ensaio 39/39,
`rider-bridge` 27/27, android project 40/40. Sem a linha, ensaio, `rider-bridge` e trava ficam
vermelhos; com um cliente próprio, o modelo diz "desconhecido" e o ensaio reprova em vez de supor.
**Não provado:** o Kotlin não compilou aqui (`dl.google.com` negado) e nada rodou em aparelho — o Q6
do Foxxy é quem prova (`docs/etapa-4-8/BANCADA-EMULADOR.md` §3.12).
---

## Entregas × Copiloto — live multi-instância / produção ainda bloqueado · ABERTO em 2026-09-30

O feed durável **single-instance** deixou de ser UNKNOWN: `CommittedOutboxEntregasEventFeed` + `FileUnitOfWork` provaram commit, restart, cursor e leitura da outbox pública persistida (**9/9 PASS**).

O consumer live-capable continua com flag OFF, kill switch fail-closed, checkpoint atômico, replay idempotente e prova com PostgreSQL real. **Nada disso autoriza ligação live.**

Bloqueios restantes:

- `FileUnitOfWork` é single-instance e não é banco/lock multi-instância;
- o papel `deliveryos_async` tem apenas `SELECT` no `platform.event_log`; ligar o bridge nele exigiria ampliar autoridade já certificada e está **proibido** sem redesenho;
- o wiring live precisa de um processo/identidade mínima própria (ou fronteira autenticada equivalente) que possa inserir somente `event_log` + `outbox` sem ganhar poderes de aparelho, migration ou domínio;
- o consumer não está conectado ao `async-runtime.ts`;
- a flag `entregas.copiloto_live_connection` continua `false`;
- não existe autorização humana para ativação live nem deploy.

Para remover este bloqueio por etapas:

1. definir e provar a identidade mínima do processo de source-ingest, sem ampliar `deliveryos_async`;
2. provar wiring local/piloto com feed de arquivo + kill switch ainda OFF por padrão;
3. para produção multi-instância, substituir a persistência local por adapter transacional/cluster-safe;
4. somente depois solicitar autorização humana separada para ativação live.

Estado atual: **feed durável single-instance = CODE_READY + TEST_PASS; produção multi-instância = NOT_IMPLEMENTED; ativação = NÃO AUTORIZADA.**

> **SUCESSÃO — 2026-09-30 · ETAPAS 1 E 2 FECHADAS.**
>
> A identidade mínima própria foi implementada e provada sem ampliar `deliveryos_async`:
> `deliveryos_source_ingest` consegue somente a escrita transacional necessária em
> `platform.event_log` + `platform.outbox`; leitura geral, mutação, DDL, aparelho, job,
> auditoria e migration são recusados por privilégio. PostgreSQL real: **4/4 PASS**.
>
> O wiring local/piloto com feed durável de arquivo e kill switch também foi provado em
> PostgreSQL real: **6/6 PASS**. Kill switch ausente/STOP = zero escrita; RUN consome o
> `store.json`; restart não duplica; eventos acumulados durante STOP entram somente após RUN.
> Crash/replay do consumer no banco: **3/3 PASS**.
>
> **Restam somente:** (a) substituir a persistência/feed single-instance por uma fronteira
> transacional/cluster-safe para produção multi-instância; (b) autorização humana separada
> para qualquer ativação live/deploy. `consumer_live`/UI/produção continuam desligados.

> **SUCESSÃO — 2026-09-30 · FRONTEIRA CLUSTER-SAFE DE PERSISTÊNCIA PROVADA.**
>
> `PgEntregasUnitOfWork` + migration 0006 reutilizam o schema normalizado `entregas.*`, sem
> criar `state_store` paralelo. PostgreSQL 17 real em GitHub Actions: **8/8 PASS** — commit
> atômico domínio/eventos/outbox, concorrência entre duas instâncias com um único vencedor,
> retry do perdedor, rollback tardio, cursor/restart, isolamento de unidade e append-only.
> Regressões foundation/integration/durable-feed/gate-close/governança também verdes.
>
> **O bloqueio multi-instância AINDA NÃO está fechado no produto**, porque `PilotApplicationFacade`
> continua hardcoded em `FileUnitOfWork/store.json` e o snapshot lê o arquivo diretamente.
> O próximo passo é remover esse acoplamento e injetar a porta `UnitOfWork`/factory; depois tratar
> `ready_orders.json`. Só então o piloto pode ser provado multi-instância ponta a ponta.

> **SUCESSÃO — 2026-09-30 · FACADE DESACOPLADA DO STORE.**
>
> `PilotApplicationFacade` agora aceita `UnitOfWork` externo; snapshot lê exclusivamente as
> portas `list()` e ignora `store.json` quando o backend não é arquivo. Modo arquivo/recreate/
> backup/sessão continuaram verdes e PgUOW 8/8 permaneceu verde.
>
> **Dependência local restante:** `ready_orders.json` ainda é estado operacional escrito pela
> facade. Antes de wiring PostgreSQL real no servidor, essa fila precisa virar repositório
> compartilhado/cluster-safe; depois disso ainda falta adaptar backup/restore do servidor ao
> tipo de backend.

> **SUCESSÃO — 2026-09-30 · FILA DE PRONTOS CLUSTER-SAFE FECHADA.**
>
> A dependência obrigatória em `ready_orders.json` deixou de existir. `PilotApplicationFacade`
> usa agora a porta `PilotReadyOrderStore`; File, Memory e PostgreSQL implementam a mesma
> fronteira. A migration 0007 cria `entregas.ready_order` com unicidade por
> `(unit_id, order_ref)`.
>
> O consumo da fila ao entrar numa viagem foi movido para uma invariante do próprio PostgreSQL:
> migration 0008, trigger `AFTER INSERT` em `entregas.delivery`. Prova autorizada em branch
> Neon São Paulo efêmera e não operacional: commit deixou `trip=1 / delivery=1 / ready=0`;
> erro deliberado após a inserção forçou rollback com `trip=0 / delivery=0 / ready=1`;
> o mesmo `order_ref` em duas unidades removeu somente a unidade da Trip.
>
> **Isto NÃO fecha a ativação multi-instância do produto.** O servidor continua default em
> backend arquivo e declara `multi_instance=false`; ainda falta o wiring opt-in do servidor
> para `PgEntregasUnitOfWork` + `PgPilotReadyOrderStore`, incluindo configuração e identidade
> SQL adequadas. `consumer_live`, UI live e produção continuam desligados; nenhum deploy nem
> migration operacional ocorreu.

> **SUCESSÃO — 2026-10-01 · WIRING POSTGRESQL MULTI-INSTÂNCIA DO PILOTO PROVADO.**
>
> O servidor do piloto ganhou backend de persistência opt-in: `ENTREGAS_STORAGE_BACKEND=file`
> permanece o default; `postgres` só abre a porta depois de validar URL, TLS, migrations 0006/0007/0008,
> unidade ativa e o papel exato `deliveryos_entregas_pilot`. O papel não é superuser/owner/createrole/
> createdb e não recebe event_log da plataforma, aparelho, jobs, auditoria ou mutação de migrations.
>
> Prova com **dois processos HTTP reais** e PostgreSQL 17: `PILOT_POSTGRES_SERVER_CLUSTER 6/6 PASS`.
> As duas instâncias compartilharam fila e viagens; duplicata concorrente teve um vencedor; estado criado
> em A apareceu em B; concorrência na mesma Trip não perdeu update e retry convergiu para version=3,
> 3 deliveries e fila vazia. PgUOW 8/8, ready-orders 7/7, storage 3/3, recreate 17/17, session 18/18,
> deploy-audit 36/36 e governança GREEN no mesmo commit provado.
>
> **O bloqueio técnico de código multi-instância está fechado. O efeito em produção NÃO está autorizado.**
> Permanecem separados: emitir/configurar a credencial real do papel, aplicar migrations 0006–0008 no
> banco operacional, selecionar `ENTREGAS_STORAGE_BACKEND=postgres` no ambiente de implantação e provar
> o comportamento no ambiente implantado. `consumer_live`/UI live continuam desligados e não houve deploy.

> **SUCESSÃO — 2026-10-01 · CUTOVER FILE → POSTGRESQL PROVADO.**
>
> O risco de ligar o backend PostgreSQL e aparecer um piloto vazio deixou de ser uma lacuna de código.
> Existe importador one-shot transacional de `store.json + ready_orders.json`, com `plan` read-only,
> destino obrigatoriamente vazio, preservação explícita de versões e ordem, detecção de colisões globais,
> recusa de ready-order já materializado como delivery e verificação dentro da própria transação antes do COMMIT.
>
> PostgreSQL 17 real: `PILOT_STORAGE_CUTOVER 7/7 PASS`. Uma falha deliberada tardia na outbox ocorreu
> depois de várias inserções e deixou o destino **inteiramente zerado**, provando rollback do conjunto.
> A continuidade foi provada: Trip importada em version=2 foi atualizada normalmente pelo PgUOW para version=3.
>
> A CLI operacional também é fail-closed: `plan` não escreve; `apply` exige `--source-stopped=YES` e o
> fingerprint exato produzido pelo plan, relendo a fonte imediatamente antes da escrita. O utilitário entra no
> `dist`; nenhum apply foi executado em banco operacional.
>
> **Próximo bloqueio de implantação:** backup/restore. O sidecar atual que arquiva `/dados` só protege o backend
> arquivo. Em modo PostgreSQL ele seria um falso sinal de segurança e não pode ser considerado backup da verdade
> operacional. Antes de qualquer cutover real, precisamos de backup PostgreSQL com restore realmente provado.

> **SUCESSÃO — 2026-10-01 · BACKUP/RESTORE POSTGRESQL LOCAL PROVADO.**
>
> O falso backup de `/dados` quando o backend é PostgreSQL foi removido. O sidecar
> `deliveryos-backup` agora acompanha a verdade escolhida: `file` arquiva o volume; `postgres`
> executa `pg_dump --format=custom`. Backend inválido ou URL PostgreSQL ausente falham alto.
>
> Restore PostgreSQL fica fora do fluxo normal, atrás do profile `maintenance`. Exige confirmação
> literal, snapshot explícito, URL alvo diferente da operacional e banco alvo vazio; restaura com
> `pg_restore --no-owner --no-privileges --exit-on-error`.
>
> Prova no GitHub Actions run **36815229348**, PostgreSQL 16: backup/restore específico do piloto
> **6/6 PASS**, backup geral **19/19**, cutover **7/7**, cluster **6/6**, deploy-audit **39/39**,
> render do Compose GREEN, expansão real dentro do container GREEN, governança GREEN e
> `git diff --check` PASS. O restore preservou fingerprint, versões e triggers; PgUOW continuou
> normalmente de version 2 para 3 após o restore.
>
> **Ainda não é proteção contra perda da máquina.** O volume `entregas_backups` continua local ao
> mesmo host. Antes de cutover operacional, falta definir/provar cópia off-host (ou mecanismo de
> backup externo equivalente), além dos efeitos já separados: migrations 0006–0008 no banco
> operacional, credencial real do papel, cutover e troca de ambiente. Nenhum desses efeitos foi
> executado; consumer/UI live continuam desligados.
>
> **SUCESSÃO — 2026-10-01 · INTEGRIDADE DO PACOTE TRANSPORTÁVEL FECHADA LOCALMENTE.**
>
> A escolha do destino off-host continua aberta, mas a integridade deixou de depender do fornecedor.
> Backups novos dos dois backends saem em par `snapshot + .sha256`, com basename portátil; retenção
> remove o par junto. Restore PostgreSQL recusa sidecar ausente/divergente antes de tocar o alvo,
> inclusive sidecar válido que aponte **outro snapshot**; o restore file passou a verificar seu
> sidecar, preservando leitura dos sidecars legados de 64 hex. A CLI
> `verify:entregas:backup` verifica qualquer cópia do par em stream.
>
> Provas locais: backup-integrity **7/7**, pilot-gate **10/10**, deploy-audit **39/39**; CLI real
> válido=exit 0, adulterado=exit 1, sem argumento=exit 2; GNU `sha256sum` no WSL aceitou o intacto e
> recusou o adulterado. **Isso não é off-host:** Docker/Compose e PostgreSQL real desta sucessão não
> rodaram, nenhum destino externo foi escolhido e SHA-256 não autentica contra alguém que substitua
> snapshot e sidecar juntos.
>
> **SUCESSÃO — 2026-10-01 · TRANSPORTE NEUTRO PREPARADO, OFF-HOST AINDA ABERTO.**
>
> `export:entregas:backup` copia o pacote já verificado para um diretório
> existente/montado, relê o destino, grava manifesto, não sobrescreve bundle e
> não contém rotina de delete. A saída força `off_host_proven=false` e mede
> `same_filesystem_device` apenas como diagnóstico. Provas locais:
> backup-export **7/7** e CLI real exit 0 no mesmo filesystem com
> `off_host_proven=false`; sem destino, exit 2.
>
> Isso reduz a dependência do fornecedor, mas **não preenche o checklist**:
> ainda falta César escolher/autorizar o destino externo, configurar a
> credencial mínima, produzir uma cópia realmente fora do host e restaurá-la
> em ensaio.
>
> **SUCESSÃO — 2026-10-02 · CONTRATO S3/AUTENTICAÇÃO PROVADO EM MINIO ISOLADO.**
>
> O transporte S3-compatible deixou de ser UNKNOWN técnico: GitHub Actions run
> `37031435078` compilou MinIO/mc de tags pinadas, subiu servidor real isolado,
> criou writer `PutObject` e reader `GetObject` separados e fechou o round-trip
> `snapshot + sidecar + manifesto`. O live gate passou **7/7**, inclusive
> `BAD_SIGNATURE_REJECTED=true`; a auditoria encontrou exatamente **3 objetos**,
> e integridade/export/governança ficaram verdes.
>
> **Isso ainda não é backup off-host PROVEN.** O MinIO viveu no runner efêmero
> da própria prova. Nenhum provedor externo, conta, bucket, credencial, retenção
> de 14 dias ou upload operacional foi autorizado/criado. O checklist continua
> aberto até cópia realmente fora do host + restore ensaiado no destino escolhido.



### SUCESSÃO — Android / fim remoto sem WebView — **FECHADO NO AVD em 2026-10-01**

Supersede o blocker histórico “com a página fechada, o fim da viagem não chega
ao serviço nativo”. O novo loop de controle do `TripLocationService` foi
observado em runtime no Foxxy/AVD Android 14: viagem inicialmente `em_rota`,
serviço em foreground e sem Activity do TATÁ resumida; após
`CloseTripManually`, o piloto devolveu `capture=false` e o Android limpou
`active_trip_id` em 13,286 s. Em seguida não havia
`TripLocationService`, processo do app nem notificação ativa do ID 4201.

Prova: `docs/etapa-4-8/field-gate/2026-10-01-q018-remote-stop-runtime.md`.
A bateria em aparelho físico real permanece `NOT_RUN` e continua sendo um
blocker separado de certificação de campo.

> **SUCESSÃO — 2026-10-03 · BACKUP OFF-HOST REAL NO BACKBLAZE B2 PROVADO, LEAST-PRIVILEGE DO WRITER AINDA ABERTO.**
>
> O destino externo deixou de ser NOT_RUN. Ensaio isolado no Backblaze B2, região `us-east-005`,
> bucket privado `deliveryos-offhost-proof-20261003-84c7`, prefixo `deliveryos-backups/`, Object Lock
> ativo e retenção padrão `COMPLIANCE / 14 days`. O live gate S3 passou **7/7** com upload/readback
> reais, writer incapaz de ler, reader incapaz de escrever e assinatura derivada de segredo incorreto recusada.
>
> A prova foi além do round-trip sintético: um PostgreSQL 18.4 descartável gerou `pg_dump --format=custom`;
> o dump foi enviado ao B2, baixado novamente e restaurado com `pg_restore` em banco realmente vazio.
> `PILOT_POSTGRES_BACKUP_RESTORE: 7/7 PASS`: fingerprint, contagens, eventos, outbox, triggers e versões
> foram preservados; a PgUOW continuou de version 2 para 3 após o restore.
>
> **Fronteira que permanece aberta:** a chave temporária criada pelo preset `Write Only` da UI do B2
> possui `writeFiles`, não possui `readFiles`, mas também recebeu `deleteFiles`. Object Lock em Compliance
> impede apagar os objetos retidos e a chave expira em 24 h, porém isso é mitigação do ensaio, não prova
> do requisito canônico de uploader sem delete. Portanto cópia off-host + restore = **PROVEN**, enquanto
> `writer writeFiles-only / sem deleteFiles` = **NOT_PROVEN**. Produção, cutover, migrations operacionais
> e deploy permaneceram intocados.

> **SUCESSÃO — 2026-10-03 · BACKUP OFF-HOST REAL NO BACKBLAZE B2 PROVADO, LEAST-PRIVILEGE DO WRITER AINDA ABERTO.**
>
> O destino externo deixou de ser NOT_RUN. Ensaio isolado no Backblaze B2, região `us-east-005`, bucket privado `deliveryos-offhost-proof-20261003-84c7`, prefixo `deliveryos-backups/`, Object Lock ativo e retenção padrão `COMPLIANCE / 14 days`. O live gate S3 passou **7/7** com upload/readback reais, writer incapaz de ler, reader incapaz de escrever e assinatura derivada de segredo incorreto recusada.
>
> A prova foi além do round-trip sintético: PostgreSQL descartável gerou `pg_dump --format=custom`; o dump foi enviado ao B2, baixado novamente e restaurado com `pg_restore` em banco realmente vazio. `PILOT_POSTGRES_BACKUP_RESTORE: 7/7 PASS`: fingerprint, contagens, eventos, outbox, triggers e versões foram preservados; a PgUOW continuou de version 2 para 3 após o restore.
>
> **Fronteira aberta:** a chave temporária criada pelo preset `Write Only` da UI do B2 possui `writeFiles`, não possui `readFiles`, mas também recebeu `deleteFiles`. Object Lock em Compliance impede apagar os objetos retidos e a chave expira em 24 h; isso é mitigação do ensaio, não prova do requisito canônico de uploader sem delete. Cópia off-host + restore = **PROVEN**; `writer writeFiles-only / sem deleteFiles` = **NOT_PROVEN**. Produção, cutover, migrations operacionais e deploy permaneceram intocados.
