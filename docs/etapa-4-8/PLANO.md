# Etapa 4/8 — Convergência de teste/RC — PLANO

> Documento de contexto. Se esta missão for interrompida e retomada por outra sessão, este arquivo
> substitui a necessidade de reconstruir o histórico da conversa.

## 1. Coordenadas do repositório

- Remoto: `cesarspichencoff-cmyk/delviery-os` (grafia com erro preservada de propósito — renomear
  quebraria referências existentes; ver `docs/execution/STATE.json`).
- Base desta etapa: `9e738b11060c4c9863d36162b45d9188adaf8091` — "Corrige reprovações AA do token
  canônico verde-texto-5 (Q-014)".
- Branch candidata: `feature/deliveryos-test-rc-convergence-v1`.
- Worktree: `Desktop/Claude/deliveryos-test-rc-convergence-v1`.
- Nenhum push, merge, PR ou deploy feito nesta etapa. Tudo local.

## 2. Método VÉRTICE

Fundação de governança separada do DeliveryOS funcionalmente, mas usada para disciplinar como este
tipo de missão é conduzida: lifecycle verificável, entrada única de continuidade, fila estruturada
de decisões humanas (`docs/execution/PERGUNTAS.jsonl`) e um governance gate
(`src/platform/run-governance-tests.ts`, missão `VERTICE_FASE_2`, `docs/execution/MISSION_LEDGER.jsonl`).
`VERTICE_FASE_2` não alterou nada funcional no DeliveryOS — só a fundação de governança.

Repositório próprio planejado (fora deste repo): `cesarspichencoff-cmyk/vertice-runtime`, branch
`vertice-active` — versionado, vendor-agnostic, independente do repo DeliveryOS, consumível por
diferentes inteligências. Política de acesso desse repositório é `Q-012`, ainda **aberta**
(`default_behavior: PAUSE`).

## 3. Definição de C0 / C1 / C2 / C3 nesta etapa

- **C0 — Baseline**: rodar a suíte de testes/build/typecheck da branch candidata como está, sem
  nenhuma alteração, e registrar PASS/FAIL/BLOCKED por área. Concluído — ver `C0-BASELINE.md`.
- **C1 — Porte isolado**: trazer os quatro diretórios de `feature/conversation-crm-pilot-v0`
  (na verdade, da branch descendente mais evoluída `fix/b2-human-reality-hotfix` — ver
  `C1-PORT.md`) mais as dependências reais de `apps/deliveryos-ai-node/**`, sem integração, sem
  wiring em navegação/Home, sem merge cego. Código chega ao repositório mas não é ativado.
  Concluído nesta sessão — commits detalhados em `C1-PORT.md`.
- **C2 — (não iniciado)**: qualquer trabalho de redução de superfície (reescrever os root-requires
  de `apps/deliveryos-ai-node` para subpath) e qualquer decisão de integração real do CRM ao
  produto pertence aqui, não ao C1. C2 esbarra de frente em `Q-004` em aberto — ver
  `BLOQUEIO-Q-004.md`.
- **C3 — (não iniciado, não definido nesta sessão)**: fora do escopo desta etapa.

## 4. Preservation Set — nada disso pode ser alterado ou respondido implicitamente pelo código

- **Copiloto M1** — motor de atenção do Copiloto. `Q-003` (qual motor é dono da atenção,
  `decisao.js` ou `shadow.ts`) segue aberta; D43 mantém os dois desligados até I1-I10 verdes.
- **Entregas** — domínio operacional de entregas (`src/entregas/**`), incluindo seu próprio
  Event Log de fundação (`src/entregas/foundation/event-log.ts`).
- **Home M1** — superfície visual da home, sob a ordem de autoridade visual de
  `docs/design/VISUAL_REFERENCE_HIERARCHY.md` e `VISUAL_SOURCE_OF_TRUTH.md`.
- **Event Log append-only** — o log canônico é `platform.event_log`
  (`src/platform/migrations/0001_platform_foundation.sql`), com trigger de banco que rejeita
  `UPDATE`/`DELETE` (`platform.impedir_mutacao_event_log`). Qualquer novo event log introduzido por
  trabalho futuro deve seguir o mesmo padrão append-only, mas nunca escrever nessa tabela sem
  decisão explícita.
- **Distinção FACT ≠ INFERENCE ≠ SIMULATION ≠ UNKNOWN** — expressão vinculante no CLAUDE.md:
  "dado sintético nunca vira real · carimbo ausente = não observado". Nenhum código pode colapsar
  esses estados.
- **Autoridade humana final** — nenhuma automação decide o que CLAUDE.md §7 reserva ao César.
  Pergunta sem resposta vira linha em `PERGUNTAS.jsonl` com `default_behavior` — ausência de
  resposta nunca é consentimento.
- **Q-001** — Ambiente pode carregar orientação de ação? (aberta, PAUSE)
- **Q-002** — Quem é Operação Viva: o núcleo cognitivo ou a projeção de viagens? (aberta, PAUSE)
- **Q-003** — Qual motor é dono da atenção do Copiloto: `decisao.js` ou `shadow.ts`? (aberta, PAUSE)
- **Q-004** — CRM, Evolução, Treinamento, RH e Gestão são módulos do DeliveryOS? (aberta, PAUSE —
  ver `BLOQUEIO-Q-004.md`, diretamente relevante ao C1/C2 deste trabalho)
- **Q-005** — Notificação fora da tela é permitida? (aberta, PAUSE)
- **Q-007** — A cota do plano Figma cortou leitura/escrita no meio da sincronização: como
  prosseguir? (aberta, PAUSE, segura Q-006)
- **Q-008** — Sushi Quentes é ambiente canônico ou subárea? (aberta, PAUSE)
- **Q-009** — Existirá fonte que meça a capacidade da Caixa? (aberta, PAUSE)

(Q-006, Q-010, Q-011, Q-013 e Q-014 têm resposta ou `PROCEED_REVERSIBLY` e não fazem parte do
conjunto travado explicitamente listado para esta etapa.)
