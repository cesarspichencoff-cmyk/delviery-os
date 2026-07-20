# Auditoria Técnica do DeliveryOS — Relatório Corrigido (V2)

> **Natureza corrigida:** esta **não** é uma auditoria estritamente independente/read-only.
> É uma **auditoria técnica com uma correção de segurança isolada** (o servidor de dev deixou
> de expor o repositório na LAN). Toda alteração de código está separada e **não integrada** ao
> baseline congelado — ver Nível 1 e a separação A/B/C/D abaixo.
>
> Data: 2026-07-20 · Substitui a V1 (que continha uma conclusão desatualizada sobre o Entregas).

## Estado oficial dos worktrees (registro)

- **Copiloto:** baseline oficial V3.3 **congelado em `101680a`**. A branch `audit/copiloto-hardening` permanece **isolada** (correção de bind + docs de auditoria + esta correção). **Não fazer merge; não alterar o baseline congelado.**
- **ENTREGAS:** fotografia técnica auditada no commit **`bb567a6`** — comprovou TypeScript compilando, 99 testes verdes, console/rider-mobile/Expedição-iFood/MapLibre-experimental executáveis, ApplicationService, outbox, FileUnitOfWork, domínio sob COR-ENTREGAS-V1 1.0.3. **O estado mais recente do ENTREGAS avançou depois para `9479a7e`.** Registrar com precisão: *"ENTREGAS @`bb567a6` foi auditado em fotografia fixa. Mudanças posteriores, incluindo o Gate de Prontidão, não fizeram parte integral dessa fotografia."* Não repetir que o ENTREGAS é "só Gate Zero" ou "sem código".
- **SELECAO:** *"Nenhum domínio, interface ou módulo executável SELECAO foi localizado nos repositórios auditados."* (Não afirmar que o conceito não existe no planejamento do ecossistema.)

## Separação obrigatória (A / B / C / D)

- **A. Achados observados ANTES de qualquer alteração** — Níveis 1/2/3 e a seção Cozinha/Caixa. Read-only.
- **B. Correção aplicada** — bind do dev server em `127.0.0.1` por padrão (P2). Uma só. Em branch separada.
- **C. Testes da correção** — `tests/live/servidor-bind-seguro.test.js` (3 testes: localhost responde; LAN não responde sem opt-in; `HOST=0.0.0.0` restaura LAN).
- **D. Mudanças NÃO autorizadas para integração** — os commits `5e22553` (correção bind) e `42a8184` (docs de auditoria) vivem **exclusivamente** na branch `audit/copiloto-hardening`. O baseline oficial `feature/copiloto-v33-implementation` foi **restaurado para `101680a`** e assim permanece até autorização expressa do César. Sem merge, sem push, sem deploy.

---

## Três níveis (cada conclusão atrelada a um commit fixo)

### Nível 1 — COPILOTO, auditado no checkpoint congelado `101680a`

- Abre limpo pela entrada canônica (`/` → `/app-v1/index.html`), Calmo vivo, `body[data-mode]="calmo"`, zero erro de console/rede.
- Motor real produz Calmo → Ambiente → Foco legitimamente.
- Capacidade Viva human-v2 em **modo sombra**: hash `f248a17…` validado na inicialização, `automatic_decisions_allowed:false`, não toca a interface; falha do shadow não derruba o Copiloto.
- Fonte **simulada** (D4A), rotulada explicitamente na tela.
- **Baseline congelado preservado.** A correção de bind e os docs desta auditoria **não** integram `101680a` — estão em `audit/copiloto-hardening` aguardando César.

### Nível 2 — ENTREGAS, auditado no commit fixo `bb567a6` (fotografia congelada)

Relatório completo: [ENTREGAS_AUDIT_FROZEN.md](ENTREGAS_AUDIT_FROZEN.md). Resumo:
- **99 testes verdes** (11 foundation + 14 integration + 12 gate-close + 45 aceitação A01–A39 + 11 UI + 6 mapa); `tsc` exit 0.
- **4 superfícies executáveis** respondendo 200: console, rider-mobile, ifood-handoff (Expedição iFood), map-poc.
- Domínio real: Trip/Delivery/Handoff/Occurrence/RiderState sob COR-ENTREGAS-V1 1.0.3; Commands×Events; ApplicationService; Outbox; persistência `FileUnitOfWork`; contratos públicos congelados.
- Regras soberanas verificadas por teste (handoff não cria trip_id; nenhum import do Copiloto em `src/entregas`; delivery_unconfirmed sem culpa).
- Bind `127.0.0.1` seguro por padrão.
- **Limitações:** ambiente de demonstração, dados de seed (não operação real), persistência de arquivo (não banco), mapa POC (não produção), parte do A01–A39 por equivalência, sem auth/monitoramento.
- **Atenção:** o worktree evolui rápido; o HEAD vivo avançou para `9479a7e` durante a auditoria. Esta conclusão vale **só** para `bb567a6`.

### Nível 3 — ECOSSISTEMA (só o que foi realmente auditado)

| Módulo | Auditado em | Estado |
|---|---|---|
| Copiloto + Capacidade Viva | `101680a` | Demo local pronta; sombra validada |
| Entregas | `bb567a6` (fotografia) | Demo executável honesta; domínio real; não piloto |
| SELECAO | — | **Nenhum domínio, interface ou módulo executável SELECAO foi localizado nos repositórios auditados.** (Ausência de implementação ≠ ausência do conceito no planejamento do ecossistema — o conceito pode existir no plano do César; o código, não.) |
| Shell / tela inicial | — | Não localizado. Nenhuma entrada única que registre/una módulos. |

---

## Escopo dos testes (corrigido — por módulo, não "do ecossistema")

Não existe uma suíte única do ecossistema. Cada módulo tem a sua:

| Módulo | Suíte | Testes | Onde |
|---|---|---|---|
| **Copiloto** (live/simulador) | `node --test tests/live/**` | 221 | `deliveryos-copiloto-v33-implementation` @ `audit/copiloto-hardening` |
| **Copiloto** (golden) | `npm run copiloto:test` | 53 | idem |
| **Capacidade Viva** | `npm run capacidade:test` | 43 | idem |
| — subtotal Copiloto/Capacidade Viva | | **317** | inclui os 3 testes novos de bind (correção B) |
| **Entregas** | `npm run test:entregas` | **99** | `deliveryos-entregas-v1` @ `bb567a6` |
| **SELECAO** | — | **0** (inexistente) | — |
| **Shell** | — | **0** (inexistente) | — |

Os **317** são a suíte **Copiloto/Capacidade Viva** (incluindo os testes de bind da correção) — **não** representam o ecossistema. Somados aos 99 do Entregas: **416 testes verdes nos dois módulos executáveis auditados**, em commits distintos.

---

## Cozinha / Caixa — matriz objetiva (aprofundada)

Motor canônico (8 praças): `combinados · duplas · enrolados · enrolados_quentes · cozinha_quentes · sobremesa · bar_bebidas · montagem_outros`.
Interface atual (6 conceitos): `Sushi · Quentes · Cozinha · Caixa · Conferência · Motoboy`.

Matriz objetiva completa e mapeamento proposto: [PRACAS_MAPPING_PROPOSAL.md](copiloto/PRACAS_MAPPING_PROPOSAL.md). Resumo com os **tipos corrigidos**:

| Conceito visual | Tipo | Fonte canônica | Tem dado real? | Situação |
|---|---|---|---|---|
| **Sushi** | agregação visual de produção | `combinados + duplas + enrolados` | Sim (composição sintética rotulada) | Ativa |
| **Quentes** | praça visual de produção | `enrolados_quentes` (**proposto: sem** `cozinha_quentes`) | Sim | Ativa, mapeamento a corrigir |
| **Cozinha** | praça visual de produção | `cozinha_quentes` | **Não — hardcoded, desligada da praça** | Inerte (a corrigir) |
| **Caixa** | **célula operacional derivada** | prontos + concentração (`p`); `r`/`c` só quando relevantes | **parcial** | **Viva, leitura parcial** |
| **Conferência** | **célula derivada DISTINTA** | **não comprovada** — precisa fonte própria | **não** | Precisa fonte própria |
| **Motoboy / Entregas** | célula derivada futura | eventos do ENTREGAS | **não integrada** | "Aguardando integração" |
| `montagem_outros` | praça canônica | — | hipótese **Montagem/Sacolas** | possível pressão do Caixa |
| `bar_bebidas` / `sobremesa` | praças canônicas | — | — | Sem círculo próprio (opções ao César) |

**Correções finais (instrução do César):**
- **Caixa e Conferência são funções distintas na operação do TATÁ — não unificar.** Caixa: sacolas, comandas, fechamento, organização da saída, atrasos, mensagens, coordenação, motoboys. Conferência: confere o pedido final, verifica itens/integridade, identifica o que falta, **comunica ao Caixa**, sinaliza que pode seguir.
- **`montagem_outros` tende a representar Montagem/Sacolas, não Conferência.** Só servirá à Conferência com evidência de checklist/validação item a item.
- **Caixa tem leitura parcial hoje** (só prontos/concentração). **Conferência ainda precisa de fonte própria.**
- **ENTREGAS não está integrado ao Copiloto** — expedição, saída, retirada, handoffs, viagens, ocorrências e motoboys **não estão conectados**. Não afirmar o contrário.
- **"Sobrecarregado" não é permitido** para o Caixa com base apenas em `p` — ver [CAIXA_OPERATIONAL_MODEL.md §6](copiloto/CAIXA_OPERATIONAL_MODEL.md).
- **Nenhuma carga operacional pode ser inventada.**

---

## Segurança / Privacidade
Ver [SECURITY_AND_PRIVACY_REVIEW.md](SECURITY_AND_PRIVACY_REVIEW.md). Sem P0/P1. Um P2 (dev server na LAN) **corrigido** (correção B, em branch separada). Sombra sem PII/ranking. Entregas bind `127.0.0.1`. Sem segredos.

## Prontidão
Ver [RELEASE_GATES.md](RELEASE_GATES.md). **Demo:** Copiloto (`101680a`) e Entregas-demo (`bb567a6`) — SIM, local, rotulado. **Piloto/Produção:** NÃO (falta dado real, auth, banco, monitoramento).

## Veredito final (corrigido)

Dois módulos executáveis reais e honestos, cada um em seu commit: um **Copiloto** congelado e estável, e um **Entregas** que — corrigindo o erro da V1 — **não é mais só Gate Zero**, mas um domínio executável com 99 testes verdes e 4 superfícies. **SELECAO não foi localizado** como código (o conceito pode existir no plano; a implementação, não). **Não há shell.** A correção de segurança e os documentos desta auditoria estão **fora** do baseline congelado, em `audit/copiloto-hardening`, aguardando decisão do César. Nada foi integrado, empurrado ou mesclado. A única imprecisão da auditoria foi minha (a V1 concluiu sobre o Entregas num HEAD velho) — corrigida aqui com fotografia fixa.

**Aguardando decisão do César:** mapeamento das praças · destino visual de Cozinha/Caixa · commits de hardening do servidor · momento de criação do shell · retomada do módulo SELECAO.
