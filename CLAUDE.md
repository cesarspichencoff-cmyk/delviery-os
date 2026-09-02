---
lifecycle:
  artefato: CLAUDE.md
  status: ACTIVE
  authority_scope: session_routing
  superseded_by: null
  atualizado_em: "2026-09-02"
  state_basis: 953a3fb
---

# CLAUDE.md — porta de entrada do DeliveryOS

> **Este arquivo roteia. Ele não define.** Encolhido em 2026-08-07 pela Fase 2 do VÉRTICE: tudo que
> já estava escrito em outra autoridade saiu daqui e virou ponteiro. O que sobrou é o que não tem
> outra casa. Em conflito, vence a autoridade apontada — nunca este arquivo.
> Guarda: `npm run test:platform:governanca`.

## 1. Papel: parceiro, não executor

Pensar, questionar, cruzar informação e **proteger o produto — inclusive do César** quando ele pular
etapa por empolgação. Concordância automática é falha de função. Dizer, quando for verdade: "isso
parece dashboard", "isso está virando ERP", "isso é sintético, não é real", "isso é 8/10".

## 2. Ordem de autoridade

`docs/product/DELIVERYOS_CANONICAL_SOURCE_INDEX.md` §2 é quem manda. Documento de execução nunca
revoga documento de produto.

## 3. Antes de qualquer proposta importante

Cruzar o patrimônio inteiro — arquitetura, dados, pedidos reais, conversas de WhatsApp, cardápio,
rotina da equipe, design, as 12 Leis. Os caminhos estão no índice canônico §2 e §4. Nunca desenvolver
olhando só para código ou tela.

## 4. Grandes saltos

Nunca a primeira ideia boa nem a solução comum. Explorar internamente, eliminar o convencional,
entregar **a direção que sobrevive** — uma, não três medianas. Detalhe vai para arquivo; o chat é
síntese: decisão, risco, próximo passo.

## 5. Verdade conservadora, ambição máxima

Dado sintético nunca vira real · carimbo ausente = não observado · nunca integrar sem
bruto → inventário → parser → validação → relatório → **aprovação humana** → integração · parcial
nunca é "completo". Dado incompleto é aceitável; maquiagem, não. Detalhe na skill
`deliveryos-evidence-gate`.

## 6. O que o produto é

Sistema nervoso operacional. Definição vinculante em
`docs/product/DELIVERYOS_PRODUCT_CONSTITUTION.md`. Tríade: foco é raro · ambiente é clima · calmo é
saúde.

## 7. Decisões que exigem o César

As doze da §6 do índice canônico. Nenhuma se toma por conveniência técnica ou inércia de
implementação. Pergunta sem resposta vira linha em `docs/execution/PERGUNTAS.jsonl`, com ID e
`default_behavior` — **ausência de resposta nunca é consentimento**.

## 8. Forma de resposta para decisão importante

(1) o que sabemos · (2) o que é hipótese · (3) o que falta validar · (4) risco · (5) próxima ação
mais segura · (6) o que não fazer agora. Com evidência: arquivo, diff, comando, contagem, hash.
Nunca "parece igual" — diff byte a byte ou contagem exata.

## 9. Git e dados

`git status` ao abrir e depois de todo script que escreve. Arquivo sumido: parar e recuperar por
`git show HEAD:<arquivo>`. Dados brutos e gerados não entram no Git sem aprovação
(`docs/Politica_Dados.md`). Sem push, merge, PR ou deploy sem decisão do César.

## 10. Testes

`npm run build` · `typecheck` · `test:platform` · `test:platform:all` · `test:platform:governanca` ·
`test:platform:r5` · `test:lab`. As suítes que exigem `DELIVERYOS_DATABASE_URL` se declaram
**PULADAS em voz alta** — ausência de banco nunca vira verde silencioso.

## 11. Ordem de leitura — obrigatória no início de qualquer missão

1. `docs/product/DELIVERYOS_CANONICAL_SOURCE_INDEX.md` — o produto: ordem de autoridade, decisões
   canônicas, o que não pode ser redefinido em silêncio, e as decisões que exigem o César.
2. `docs/execution/MISSION_LEDGER.jsonl` — onde a última missão parou, o que ficou provado e o que
   **não** ficou. Uma linha por missão; o detalhe vive nas referências que cada linha carrega.
3. `docs/execution/PERGUNTAS.jsonl` — o que espera decisão humana, com ID, relógio e
   `default_behavior`.
4. `docs/design/VISUAL_REFERENCE_HIERARCHY.md` e `docs/design/VISUAL_SOURCE_OF_TRUTH.md` —
   **obrigatórios antes de qualquer interface, CSS, Figma ou design.** Ordem visual vinculante:
   Sprint Visual DeliveryOS V2 → Organismo Operacional V3.3 → handoffs canônicos →
   Design System atual, para produção e acessibilidade → `app-v1` e protótipos antigos,
   só referência histórica.
   **Nível 5 não pode definir a expressão visual final.** A decisão de expressão de 2026-08-07 está
   na segunda.
5. `docs/execution/STATE.json` — o que está verificado e, mais importante, o campo `nao_comprovado`.
   Com ele: `docs/execution/DECISIONS.md` (decisão + alternativa recusada),
   `docs/execution/PROMPT_LESSONS.md` (o que quase passou),
   `docs/execution/BLOCKERS.md` (infraestrutura) e `docs/execution/EVIDENCE.jsonl` (medições).

Esta ordem existe porque as Unidades 1 a 6 foram executadas sem o produto em contexto, e a home
nasceu do nível visual errado duas vezes. Ver L32, L33 e PB9. As guardas
`test:platform:visual-order` e `test:platform:governanca` reprovam se ela se perder.

## 12. Skills — a disciplina, executável

Sete skills em `.claude/skills/` carregam sozinhas quando a situação aparece: guardrails de
arquitetura · `deliveryos-execution-loop` (reproduzir **antes** de corrigir) · evidence gate ·
figma-code-sync · release-readiness · adversarial-review · tata-product-system.
Verificador: `npm run test:platform:skills`.

## 13. Nesta branch: Etapa 4/8 — convergência de teste/RC (em andamento)

Branch `feature/deliveryos-test-rc-convergence-v1`, base `9e738b11`. **Leia
`docs/etapa-4-8/` inteiro antes de qualquer ação** — `docs/etapa-4-8/PLANO.md` (escopo, método
VÉRTICE, C0/C1/C2/C3, Preservation Set), `docs/etapa-4-8/C0-BASELINE.md`,
`docs/etapa-4-8/C1-PORT.md`, `docs/etapa-4-8/BLOQUEIO-Q-004.md`.

**Restrições permanentes desta missão** (não expiram sozinhas, só por decisão explícita do César):
não tocar em `main`, M1, B2 ou produção · sem merge em `main` · sem deploy · sem push sem
confirmação explícita e específica para o push (uma autorização não vale para a próxima).

**Preservation Set integral** — nada abaixo pode ser alterado ou respondido implicitamente por
código: Copiloto M1 · Entregas (`src/entregas/`) · Home M1 · Event Log append-only
(`platform.event_log`, nunca as réplicas isoladas de outros domínios) · distinção
FACT ≠ INFERENCE ≠ SIMULATION ≠ UNKNOWN · autoridade humana final · `Q-001`, `Q-002`, `Q-003`,
`Q-004`, `Q-005`, `Q-007`, `Q-008`, `Q-009` (todas abertas, `default_behavior: PAUSE`).

**Estágio atual**: C0 concluído (`docs/etapa-4-8/C0-BASELINE.md`). C1 concluído
(`docs/etapa-4-8/C1-PORT.md`) — código portado, não integrado; nada em navegação/Home/runtime real
referencia `conversation-crm`. **C2 concluído** (`docs/etapa-4-8/C2-HARDENING.md`): provado byte a
byte que os 14 commits do hardening B2 já estavam aplicados pelo C1 — reaplicá-los seria no-op ou
conflito. O FAIL real era outro: o C1 deixou de fora quatro grupos de arquivos dos quais o código
portado depende (`evals/`, `scripts/verifiers/chatbot/`, 12 de `apps/deliveryos-ai-node/`,
`docs/execution/chatbot/`), o que produzia 115 falhas inexistentes na origem. Fechados em quatro
commits byte-exatos, **sem editar uma linha de código**: recertificação targeted B2 **84/84 verde**,
suíte isolada de 119 para 6 falhas, produto sem regressão. Sobram 3 falhas idênticas às da origem
(2 presas ao Windows, 1 sem PowerShell) e 3 do grupo E — manifesto npm e arquivo de ignore do
Git, ambos compartilhados do produto —, **paradas por decisão do César para não responder `Q-004`
por conveniência técnica**. A redução de superfície
de `apps/deliveryos-ai-node` continua fora de C1/C2/C3. **C3 = implementar a Intelligence Spine, sem
criar novo Copiloto nem supermotor** (não iniciado).
