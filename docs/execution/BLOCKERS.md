---
lifecycle:
  artefato: docs/execution/BLOCKERS.md
  status: ACTIVE
  authority_scope: infra_blockers
  superseded_by: null
  atualizado_em: "2026-09-23"
  state_basis: 953a3fb
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
| PB9/C3 | **Q-003** | aberta |
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

### C1 — P0 · O Android não consegue sincronizar nada

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

### C3 — P1 · Corrida na `sequenceLocal`

`TripLocationService.kt:247-279` lança **um coroutine por ponto** em
`Dispatchers.IO`; `maxSequence()+1` (`EntregasDatabase.kt:125`) não é atômico.
Um `LocationResult` em lote pode dar a mesma `sequence_local` a dois pontos —
corrompendo exatamente a ordenação que o servidor usa.

### C4 — P1 · GPS do piloto mora na RAM

`tools/entregas_pilot_server.ts:182` — `const pointsByTrip = new Map(...)`.
Reiniciar o servidor apaga toda a rota recebida e zera a deduplicação.

### C5 — P2 · Resíduos conhecidos

- `tools/live/interface/servir_d4a.js:120` e `servir_investigacao_volume.js:57`
  fazem `listen(PORT, "0.0.0.0")` incondicional. **Fora do worktree da
  plataforma** — não foram trazidos pelo port;
- `browser-adapter.js:140` extrai só `external_id` + `raw_status`, então 7 das
  9 dimensões chegam `unknown` em produção. O modelo multidimensional está
  completo e testado; **o extrator que o alimenta é que não extrai**;
- tabela `outbox_event` do Room nunca recebe escrita (código morto);
- `purgeSyncedBefore` nunca é agendada — retenção local não é aplicada;
- sem receipt durável: o `DeviceReceipt` está desenhado
  (`device-envelope.ts:60`) e o Kotlin descarta o corpo da resposta.

---

## D. Próximo comando exato na retomada

```bash
npm run test:platform:bridge && npm run test:platform:skills && npx tsc --noEmit
```

Se os três estiverem verdes, o checkpoint está íntegro e a próxima frente é
ligar a rota de ingestão no `src/platform/bin/critical.ts` — o adapter, a
validação e o recibo já existem e estão testados; falta o `PgDeviceRegistry`
sobre `identity.device` e o wiring HTTP.

---

## Atualização — Unidade 1 concluída (2026-07-27)

**C1 (P0 do Android) está CORRIGIDO.** Ver commits `a5fe45d` e `4456f2e`.
A reprodução revelou que era pior do que o registrado: com 401, `doWork`
retornava `Result.success()` — o WorkManager dava a sincronização por concluída.

### Bloqueador novo, menor

**B3 — token sem cifragem por Keystore.** O token fica em Room, no diretório
privado do app. Isso protege contra outro aplicativo; **não** protege contra
extração de backup nem contra aparelho comprometido.

- **O que falta:** `androidx.security-crypto` com `EncryptedSharedPreferences`,
  ou cifrar a coluna antes de gravar.
- **Por que não foi feito agora:** é dependência nova e só é verificável em
  aparelho — não cabia na Unidade 1 sem inflar o escopo.
- **Mitigação atual:** confirmar `android:allowBackup="false"` no manifesto.

### C2, C3, C4, C5 seguem abertos

Reavaliação do portão durante a viagem · corrida na `sequenceLocal` · GPS do
piloto em RAM · resíduos de bind `0.0.0.0` e extrator de dimensões.

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

### Bloqueio de precondição

`test:platform:m1b-perceptual` exige um servidor M1 na porta `5292` — declarado na linha 17 do
próprio arquivo. Nenhum script deste repositório serve essa porta; a única ocorrência de `5292`
em `tools/` é a de quem consome. Morre em `ECONNREFUSED`, com stack trace cru em vez de se
declarar pulado em voz alta (CLAUDE.md §10). Vermelho por precondição ausente não é perigoso como
um verde silencioso, mas também não é legível.

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
