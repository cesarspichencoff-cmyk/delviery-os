---
lifecycle:
  artefato: docs/execution/DELIVERYOS_CANONICAL_STATE_2026-08-04.md
  status: SUPERSEDED
  authority_scope: mission_continuity
  superseded_by: docs/execution/MISSION_LEDGER.jsonl
  atualizado_em: "2026-08-07"
  state_basis: 5306074
---

> **APOSENTADO EM 2026-08-07 — deixou de ser porta de entrada.** A auditoria abaixo continua válida
> e é a leitura recomendada para entender a linha integrada, as 22 worktrees e o achado que muda o
> planejamento. O que caiu foi a frase "esta é a fonte principal de continuidade": essa função é do
> `docs/execution/MISSION_LEDGER.jsonl`. Nada foi removido.

# DeliveryOS — estado canônico em 2026-08-04

> **Continuação em 2026-08-05 — `REVOLUTION 0-A`.** Nada abaixo foi invalidado. O que mudou:
> a **Constituição do produto** passou a existir e é o nível 4 do índice canônico
> (`docs/product/DELIVERYOS_PRODUCT_CONSTITUTION.md`) — o produto principal é o **Copiloto da
> operação do restaurante**, e a recomendação antiga de tratar Entregas como lançamento principal
> está **revogada**. Nasceu também um laboratório experimental, `/lab/operacao-viva-v4`, em
> `labs/operacao-viva-v4/` — fora de todo caminho protegido, com os sete gates de congelamento ainda
> verdes nos baselines originais. Ele **não é a home** e **aguarda revisão humana do César** (PB16).
> Ler `DELIVERYOS_REVOLUTION_0A_PLAN.md` e `DELIVERYOS_REVOLUTION_0A_PROGRESS.md`.

> **Esta é a fonte principal de continuidade.** Substitui os resumos empilhados em `NEXT_RESUME.md`
> como ponto de partida; o histórico permanece intocado. Auditoria feita no repositório, não em
> documentos. Nenhum código de produção foi alterado nesta missão.
>
> HEAD auditado: `0ec944d` · branch `feature/deliveryos-hybrid-platform-foundation-v1` · working
> tree limpo · **sem push, merge, PR ou deploy**.

---

## 1. O achado que muda o planejamento

**A branch atual já é a linha integrada.** Verificado por ancestralidade, não por data:

```
feature/entregas-android-field-v1      CONTIDA
feature/entregas-operational-gps-v1    CONTIDA
feature/entregas-acabamento-visual-v1  CONTIDA
feature/deliveryos-cloud-readiness-v1  CONTIDA
main                                    CONTIDA
```

Core, Entregas (103 arquivos), Android (2 785 arquivos), Copiloto, Conference Brain, plataforma
híbrida e todo o R5 coexistem **no mesmo commit**. Não existe integração pendente entre eles.

**Não é preciso montar uma release vertical: ela já existe.**

---

## 2. Worktrees — 22, e só uma é autoritativa

| Linha | Worktree/branch | Papel hoje |
|---|---|---|
| **Autoritativa** | `deliveryos-hybrid-platform-foundation-v1` @ `0ec944d` | **tudo o que vai para operação** |
| Base histórica | `delviery-os` @ `a441bc7` (main) | contida na autoritativa |
| Conversa/CRM (12 branches) | `deliveryos-conversation-crm-pilot-v0` e afins | **PROTEGIDO — não tocar** |
| Auditorias (8 branches) | `audit/*` | documentação; nada a integrar |
| Conference Brain (linhas antigas) | `fix/conference-live-*`, `feature/conference-*` | superadas pelo port já aceito |
| Copiloto antigo | `fix/copiloto-secure-dev-server-bind-v1` @ `aec9027` | origem do port; **não integrar** — diverge em 979 arquivos por ser linha anterior à plataforma |
| Capacidade Viva | `research/capacidade-viva-calibration` | pesquisa; fora do piloto |
| iFood oficial | `feature/ifood-official-foundation-v1` | documentação de fundação; sem captura viva |

**Nada de valor operacional está preso fora da linha autoritativa.**

---

## 3. Estado por módulo — medido hoje

| Módulo | Estado | Evidência executada |
|---|---|---|
| **DeliveryOS Core** | `READY_NOW` | contido; `tsc` exit 0 |
| **Entregas (API + GPS + offline + aceitação)** | `READY_FOR_ENVIRONMENT_TEST` | `npm run test:entregas` — **436** (soma dos banners), verde ponta a ponta |
| **Entregas Console** | `READY_FOR_ENVIRONMENT_TEST` | servidor `npm run ui:entregas`; testes de UI e mapa dentro dos 436 |
| **Android / APK** | `READY_FOR_ENVIRONMENT_TEST` | 35 android-project + 29 device-api + 79 native/consent + 36 field-readiness OK; **falta aparelho real** |
| **Plataforma (crítico + assíncrono)** | `READY_FOR_ENVIRONMENT_TEST` | `test:platform` 44 · `:envelope` 23 · `:bridge` 45 · `:skills` 12 |
| **Copiloto Shadow** | `READ_ONLY_READY` | `test:platform:copiloto` — 39 OK |
| **Conference Brain** | `PARTIAL` | 4B1–4B5 portados e verdes aqui; os 309/314 originais **não** foram reexecutados |
| **Persistência PostgreSQL** | `BLOCKED` (ambiente) | `pg`/`repos`/`backup` **PULADOS** — sem `DELIVERYOS_DATABASE_URL` |
| **Docker / cloud** | `BLOCKED` (ambiente) | auditoria de deploy roda e **declara "Docker ausente"**; 30 testes OK, 21 cloud-config OK |
| **Home / Organismo** | `READY_NOW` | home 44 · organismo 27 · Product System 44 · R1 24 · ordem visual 6 |
| **R5-A…R5-D3 (contratos)** | `READY_FOR_INTEGRATION` | 30+30+38+28+12+15+12+31+38+10 OK |
| **`trabalho_praca_observado` em campo** | `BLOCKED` | produtor existe; nunca rodou com operação real |
| **iFood ao vivo** | `SIMULATED_ONLY` | só relatório em lote; sem captura viva |
| **Conversa/CRM** | `PROTECTED_DO_NOT_TOUCH` | fora do piloto por decisão |

**Código pronto ≠ implantado.** Nada acima foi exercitado contra banco real, contêiner ou aparelho.

---

## 4. As dez respostas

1. **Existe branch com Core + Entregas + Copiloto?** **Sim — a atual.** Provado por ancestralidade.
2. **O Copiloto depende de `trabalho_praca_observado`?** **Não.** Suas três políticas
   (`sinal-velho`, `capacidade-saturada`, `ocorrencias-acumuladas`) rodam sobre `Projecao` da
   **Operação Viva**, alimentada por eventos de **viagem** — GPS, ocorrência, ciclo da entrega. A
   cozinha não entra nelas.
3. **O que funciona sem Odhen?** As três políticas acima, com evidência (`input_event_ids` reais do
   event log), procedência, validade e retirada. É recomendação de **fonte e frota**, não de praça.
4. **Entregas pode ir antes do Copiloto?** **Sim** — e deve. O Copiloto entra na mesma release como
   leitura, sem bloquear o resto.
5. **O Android fala com a API autoritativa?** **Sim.** `feature/entregas-android-field-v1` está
   contida, o P0 de autenticação foi corrigido (`a5fe45d`/`4456f2e`) e device-api tem 29 testes OK.
6. **Console funcional ou só compilável?** **Funcional** — servidor próprio e testes de UI/mapa
   verdes. Não exercitado contra banco real.
7. **Docker/cloud é bloqueio?** **É bloqueio de ambiente, não de código.** A auditoria roda e diz
   "Docker ausente"; `compose.platform.yaml`, `Dockerfile.platform` e `Caddyfile` existem.
8. **Existe alternativa de piloto?** **Sim.** `FileUnitOfWork` é caminho local declarado, e
   `entregas_pilot_server` já existe — piloto local sem nuvem é possível.
9. **O que falta para a primeira sessão?** Três coisas de **ambiente**: instância PostgreSQL,
   Docker (ou piloto em arquivo), e um aparelho Android autorizado.
10. **O que foi arquitetural demais?** R5-C, R5-D1, R5-D2 e R5-D3 — o caminho da **cozinha**. São
    corretos e não estão no caminho crítico do primeiro lançamento. Também fora: paridade Figma.

---

## 5. Composição de lançamento — já pronta

**Base:** `feature/deliveryos-hybrid-platform-foundation-v1` @ `0ec944d`. **Nada a integrar.**

**Fica isolado (não entra):** todas as branches `feature/conversation-*` e
`feature/customer-menu-*` (CRM/cardápio) · `aec9027` · `research/*` · `audit/*` ·
`feature/ifood-official-foundation-v1`.

**Conflitos esperados na integração:** nenhum — não há integração a fazer.

**Ordem de implantação:**

1. PostgreSQL + `npm run migrate` + `npm run verificar:banco`
2. `start:critical` → `/health` e `/ready` (200 só quando persiste)
3. Console (`ui:entregas`) contra o mesmo banco
4. APK em aparelho autorizado → `POST /api/gps/batch` com token
5. `start:async` → outbox drena
6. Copiloto **read-only**, lendo a projeção — sem execução, sem escrita

**Rollback:** a plataforma tem 30 testes de auditoria de deploy e 15 de recriação de persistência.
Critério: `/ready` deixando de responder 200, ou outbox em dead-letter — voltar ao commit anterior e
manter `FileUnitOfWork`.

---

## 6. Três cenários

### Favorável — 24 a 72 h
Banco hospedado e aparelho disponíveis no dia 1.
**Entrega:** Entregas em operação com console e APK, Copiloto read-only ligado.
**Prompts:** 4–6 · **Agentes:** 1 · **Modelo:** Opus 5, nível alto (máximo ao ligar o Copiloto).
**Paralelo:** banco/migração ‖ APK no aparelho.

### Provável — até 7 dias
Banco leva 1–2 dias; aparelho e permissões de campo levam 2–3.
**Entrega:** a mesma, mais um turno real observado e ajuste do que a operação apontar.
**Prompts:** 8–12 · **Agentes:** 1, com 1 auxiliar de leitura de log.

### Adverso — o que segura
- **Plano de banco que pausa por inatividade** (armadilha já registrada): a primeira entrega do dia
  esperaria o banco acordar. **Detecta no dia 1** com `npm run verificar:banco` e uma pausa forçada.
- **Aparelho sem autorização de instalação** ou GPS em background bloqueado pelo fabricante.
  **Detecta no dia 1** instalando e deixando o app 30 min em segundo plano.
- **Docker indisponível na máquina da loja.** **Detecta no dia 1** — e o desvio é o piloto em
  arquivo, que já existe.
- **Console dependendo de rota de leitura que não existe** (B5: não há endpoint que devolva estado
  do aparelho). **Detecta no dia 1** abrindo o console com um device real.

---

## 7. Bloqueios reais, no caminho crítico

| # | Bloqueio | Natureza | Fora do caminho? |
|---|---|---|---|
| 1 | Instância PostgreSQL | ambiente | **não — é crítico** |
| 2 | Docker ausente | ambiente | não, mas há desvio (piloto em arquivo) |
| 3 | Aparelho Android autorizado | físico | **não — é crítico** |
| 4 | B5: sem rota de leitura do estado do aparelho | produto | parcial — o console declara ausência |
| 5 | `trabalho_praca_observado` em campo | operação | **sim — fora do primeiro lançamento** |
| 6 | iFood ao vivo | produto | **sim** |
| 7 | PB11/PB13 Figma | documental | **sim** |
| 8 | D43 / I1–I10 para conectar motores | produto | **sim** — Copiloto entra read-only |

---

## 8. Definição de pronto para operação

1. `/ready` responde 200 contra banco real, e para de responder quando o banco cai.
2. Um APK instalado num aparelho autorizado envia GPS e o servidor **registra**.
3. O console mostra a viagem real, e mostra ausência quando não há dado.
4. `start:async` drena a outbox sem dead-letter em um turno.
5. O Copiloto exibe recomendação **com evidência rastreável** e **nada executa**.
6. Existe rollback testado e backup verificado.

**Hoje: 0 de 6 exercitados em ambiente real.** Todos os seis têm código verde.

---

## 9. Riscos que não são de código

- Confiar em suíte verde como prova de operação. **436 testes não provam um turno.**
- Deixar o Copiloto sair de read-only sem I1–I10 verdes em runtime.
- Tratar o caminho da cozinha (R5-D*) como pré-requisito — ele não é.
- Perder o histórico dos 22 worktrees ao consolidar. Nada precisa ser apagado.

---

## 10. Próximos prompts, na ordem

1. **Ambiente de persistência** — Opus 5, alto. Postgres + migrações + `/ready` provado.
2. **Piloto Entregas ponta a ponta** — Opus 5, alto. API + console contra banco real.
3. **APK em campo** — Opus 5, alto. Aparelho, background, revogação.
4. **Copiloto read-only sobre Entregas** — Opus 5, **máximo**. Sem execução, sem escrita.
5. **Auditoria de prontidão** — Opus 5, outro contexto, alto.

Política completa: `docs/execution/DELIVERYOS_MODEL_ROUTING.md`.

---

## 11. Testes válidos hoje — comandos

```bash
npm run test:entregas                    # 436 (soma dos banners)
npm run test:platform                    # 44
npm run test:platform:bridge             # 45
npm run test:platform:copiloto           # 39
npm run test:platform:envelope           # 23
npm run test:platform:deploy             # 30 (declara Docker ausente)
npm run test:platform:r5                 # A..D3 encadeados
npm run test:platform:recuperacao        # home, organismo, R1, ordem visual, Product System
npx tsc --noEmit                         # exit 0
```

**Não executados, com motivo:** `:pg`, `:repos`, `:backup` — sem `DELIVERYOS_DATABASE_URL`, e eles
se declaram **pulados em voz alta**. Os 309/314 originais do Conference Brain seguem sem
reexecução nesta linha.

**Divergência registrada:** a evidência histórica falava em ~481 testes de Entregas; a medição de
hoje soma **436** nos banners. A suíte passa inteira — a diferença é de contagem, não de falha, e
não foi reconciliada suíte a suíte por não estar no caminho crítico.
