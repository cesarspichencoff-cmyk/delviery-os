# Bloqueadores e trabalho não integrado

> **LEIA PRIMEIRO — 2026-08-01.** Este arquivo passou a ter DUAS naturezas de bloqueio, separadas de
> propósito. A seção **BLOQUEIOS DE PRODUTO E DECISÕES HUMANAS** foi criada porque o produto do
> DeliveryOS ficou parado de julho a agosto de 2026 por perguntas que só o César responde — e
> nenhuma delas aparecia aqui, porque este arquivo só registrava infraestrutura. Uma pergunta de
> produto sem resposta é um bloqueio tão real quanto um banco que não sobe.
>
> Índice canônico do produto: `docs/product/DELIVERYOS_CANONICAL_SOURCE_INDEX.md`.

---

# BLOQUEIOS DE PRODUTO E DECISÕES HUMANAS

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

## PB10 — Fontes canônicas nunca examinadas

- `docs/design/canonical/deliveryos-visual-v2/*.zip` — **cânone visual soberano**, nunca aberto.
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
