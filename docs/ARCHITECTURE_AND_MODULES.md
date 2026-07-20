# Arquitetura e Módulos — Auditoria Geral (2026-07-20)

> Auditoria independente. Anchor: worktree `deliveryos-copiloto-v33-implementation` @ `101680a`.
> Este documento mapeia o que EXISTE de fato, não o que a documentação declara.

## 1. Matriz de worktrees / repositórios

| # | Local | Branch | HEAD | Função | Estado | Autoridade | Integrável agora |
|---|---|---|---|---|---|---|---|
| 1 | `delviery-os` | `main` | `a441bc7` | Repo canônico / núcleo (motor, cardápio, docs fundadores) | Ativo | **Fonte de verdade dos docs** | Base — não é "módulo" de UI |
| 2 | `deliveryos-copiloto-v33-implementation` | `feature/copiloto-v33-implementation` | `101680a` | **Copiloto** (Operação Viva V3.3 + Capacidade Viva sombra) | Ativo, testado | Alta | **SIM** (demo local) |
| 3 | `deliveryos-capacidade-viva-calibration` | `research/capacidade-viva-calibration` | `076a1cb` | Calibração human-v2 (blind-v1/v2, holdouts) | Pesquisa fechada | Config validada | **NÃO** (pesquisa, não runtime) |
| 4 | `deliveryos-entregas-v1` | `feature/entregas-v1` | `5ac221b` | **Entregas** — Gate Zero (docs + protótipo visual) | Pré-código | COR-ENTREGAS-V1 | **NÃO** (aguarda validação César) |
| 5 | `deliveryos-fable` | `feature/d4a-cenarios-volume-visual` | `e299cbc` | Investigação de cenários de volume | Pesquisa | Baixa | NÃO |
| 6 | `deliveryos-grok` | `audit/preloja-grok` | `aa4d554` | Auditoria D4A (Grok) | Pesquisa | Baixa | NÃO |
| 7 | `deliveryos-grok-copiloto-intelligence` | `grok/copiloto-intelligence-pack` | `a8ea130` | Pacote de design de experiência | Pesquisa | Baixa | NÃO |
| 8 | `deliveryos-tata-evolucao` | `research/tata-evolucao-grok` | `6ef9e97` | Cultura/formação (TATÁ Evolução) | Pesquisa | Domínio separado | NÃO |
| — | `tata-house` | `tata-house` | `cd86c80` | App do refeitório (Next.js/Supabase) — **produto separado** | Ativo, próprio deploy | Própria | Não é módulo do DeliveryOS |
| — | `deliveryos-private-sources` | (dados brutos) | — | Originais imutáveis + cópias de trabalho | Dados | Fonte primária | Nunca em runtime |
| — | `deliveryos-review-packets` | (pacotes) | — | Pacotes de revisão por fase | Histórico | Baixa | NÃO |

**Árvores limpas?** Sim, exceto `deliveryos-entregas-v1`, que tem material do Gate Zero solto no working tree (`docs/entregas/gate-zero/` untracked + `_tmp_*` files). Os `_tmp_*` estão protegidos por `.gitignore` (`_tmp_*`), confirmado por `git check-ignore`. Ver [SECURITY_AND_PRIVACY_REVIEW.md](SECURITY_AND_PRIVACY_REVIEW.md).

## 2. Mapa oficial de domínios (do repositório, não do prompt)

Fonte: `deliveryos-entregas-v1/docs/deliveryos/Mapa_Mestre_Dominios_DeliveryOS_V0_1.md`.

```
DeliveryOS (plataforma)
├── Operação Viva (núcleo)   → hoje = o COPILOTO (motor Calmo/Ambiente/Foco)
├── Entregas (próprio + marketplace)
├── Suprimentos do Delivery (futuro)
└── Caixa e Atendimento (futuro — só registrado)
TATÁ Evolução (cultura/formação — separado, não domínio interno)
```

**Achado crítico de nomenclatura.** O prompt da auditoria pede três módulos de entrada: **Seleção, Entregas, Copiloto**. O repositório NÃO contém nenhum módulo, worktree, branch, tela, contrato ou teste chamado **"Seleção"**. A arquitetura oficial documentada tem *Operação Viva (=Copiloto)*, *Entregas*, *Suprimentos (futuro)* e *Caixa/Atendimento (futuro)* — nunca "Seleção". Ver §4.

## 3. Separação e acoplamento

| Regra de fronteira | Estado | Evidência |
|---|---|---|
| Copiloto observa/recomenda, não executa | **OK** | Capacidade Viva human-v2 em modo sombra, `automatic_decisions_allowed:false` |
| Capacidade Viva não entra em Entregas | **OK** (Entregas não tem código) | Entregas é só Gate Zero |
| Entregas não controla `body[data-mode]` | **OK** (não há código de Entregas) | — |
| Código de calibração/holdouts não entra no runtime | **OK** | Só `human-rules.js` + `labels.js` + config portados; nenhum `review/`, `blind-*`, gabarito |
| Config validada = config runtime = config documentada | **OK** | Hash `f248a173…` idêntico em calibração, runtime e docs; validado na inicialização |
| Shell não contém lógica de domínio | **N/A** | Shell não existe (ver §4) |

## 4. O que NÃO existe (e é apresentado como se fosse entrar)

- **Módulo "Seleção"**: inexistente. Nenhum diretório, código, tela ou contrato. Candidato mais próximo semanticamente é `tata-house` (montagem de cardápio do refeitório), mas é um **app separado** (Next.js próprio, deploy próprio, domínio "refeitório dos funcionários" — não delivery). Tratar `tata-house` como "Seleção do DeliveryOS" seria uma afirmação falsa.
- **Shell / tela inicial dos três módulos**: inexistente. Cada frente vive em seu próprio worktree. Não há entrada única que liste Seleção/Entregas/Copiloto, nem registro de módulos, nem navegação entre eles. Ver proposta mínima em [DEMO_READINESS.md](DEMO_READINESS.md).
- **Código do módulo Entregas**: inexistente por decisão (Gate Zero). Só há docs e protótipo visual estático.

## 5. Recomendação de arquitetura

O produto hoje é **um módulo real (Copiloto)** + **um domínio em fundação (Entregas, sem código)** + **um app irmão separado (tata-house)**. A narrativa de "três módulos prontos para entrar" (Seleção/Entregas/Copiloto) **não corresponde ao repositório**. Antes de qualquer shell, é preciso a decisão soberana do César sobre: (a) o que é "Seleção" e onde nasce; (b) se `tata-house` faz parte do DeliveryOS ou permanece produto separado; (c) o gate de início do código de Entregas.
