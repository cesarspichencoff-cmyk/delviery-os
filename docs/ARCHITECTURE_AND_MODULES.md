# Arquitetura e Módulos — Auditoria Geral (2026-07-20)

> Auditoria independente. Anchor: worktree `deliveryos-copiloto-v33-implementation` @ `101680a`.
> Este documento mapeia o que EXISTE de fato, não o que a documentação declara.

## 1. Matriz de worktrees / repositórios

| # | Local | Branch | HEAD | Função | Estado | Autoridade | Integrável agora |
|---|---|---|---|---|---|---|---|
| 1 | `delviery-os` | `main` | `a441bc7` | Repo canônico / núcleo (motor, cardápio, docs fundadores) | Ativo | **Fonte de verdade dos docs** | Base — não é "módulo" de UI |
| 2 | `deliveryos-copiloto-v33-implementation` | `feature/copiloto-v33-implementation` | `101680a` | **Copiloto** (Operação Viva V3.3 + Capacidade Viva sombra) | Ativo, testado | Alta | **SIM** (demo local) |
| 3 | `deliveryos-capacidade-viva-calibration` | `research/capacidade-viva-calibration` | `076a1cb` | Calibração human-v2 (blind-v1/v2, holdouts) | Pesquisa fechada | Config validada | **NÃO** (pesquisa, não runtime) |
| 4 | `deliveryos-entregas-v1` | `feature/entregas-v1` | auditado @ `bb567a6` (HEAD vivo avança) | **Entregas** — domínio executável (99 testes, 4 superfícies, ApplicationService, outbox, persistência) | **Ativo, executável** (demo) | COR-ENTREGAS-V1 1.0.3 | Demo local; não piloto — ver [ENTREGAS_AUDIT_FROZEN](ENTREGAS_AUDIT_FROZEN.md) |
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

**Achado de nomenclatura (redação corrigida).** O prompt cita três módulos de entrada: **Seleção, Entregas, Copiloto**. **Nenhum domínio, interface ou módulo executável SELECAO foi localizado nos repositórios auditados** — nem worktree, branch, tela, contrato ou teste. Isso é ausência de *implementação*, não necessariamente ausência do *conceito* no planejamento do ecossistema (o conceito pode existir no plano do César). A arquitetura oficial documentada tem *Operação Viva (=Copiloto)*, *Entregas*, *Suprimentos (futuro)* e *Caixa/Atendimento (futuro)*. Ver §4.

## 3. Separação e acoplamento

| Regra de fronteira | Estado | Evidência |
|---|---|---|
| Copiloto observa/recomenda, não executa | **OK** | Capacidade Viva human-v2 em modo sombra, `automatic_decisions_allowed:false` |
| Capacidade Viva não entra em Entregas | **OK** | Teste em `src/entregas` (@`bb567a6`): "nenhum import do Copiloto/Capacidade Viva" passa |
| Entregas não controla `body[data-mode]` | **OK** | Entregas tem UI própria (console/mobile/handoff), separada do Copiloto |
| Código de calibração/holdouts não entra no runtime | **OK** | Só `human-rules.js` + `labels.js` + config portados; nenhum `review/`, `blind-*`, gabarito |
| Config validada = config runtime = config documentada | **OK** | Hash `f248a173…` idêntico em calibração, runtime e docs; validado na inicialização |
| Shell não contém lógica de domínio | **N/A** | Shell não existe (ver §4) |

## 4. O que NÃO foi localizado como implementação

- **Módulo SELECAO**: **nenhum domínio, interface ou módulo executável SELECAO foi localizado nos repositórios auditados** — sem diretório, código, tela, contrato ou teste. Candidato semântico é `tata-house` (montagem de cardápio do refeitório), mas é **app separado** (Next.js próprio, deploy próprio, domínio "refeitório dos funcionários" — não delivery); tratá-lo como "Seleção do DeliveryOS" seria afirmação falsa. Ausência de implementação ≠ ausência do conceito no plano do César.
- **Shell / tela inicial dos módulos**: não localizado. Cada frente vive em seu worktree; não há entrada única, registro de módulos ou navegação entre eles. Ver proposta mínima em [DEMO_READINESS.md](DEMO_READINESS.md).
- **Entregas — correção:** ao contrário da V1 desta auditoria, o Entregas **não** é "só Gate Zero". Na fotografia `bb567a6` é domínio executável com 99 testes e 4 superfícies — ver [ENTREGAS_AUDIT_FROZEN.md](ENTREGAS_AUDIT_FROZEN.md).

## 5. Recomendação de arquitetura

O produto hoje é **dois módulos executáveis** (Copiloto @`101680a` + Entregas @`bb567a6`, ambos demo local) + **um app irmão separado (tata-house)**. **SELECAO não foi localizado** como implementação e **não há shell**. Antes de qualquer shell, é preciso a decisão soberana do César sobre: (a) o que é "Seleção" e onde nasce; (b) se `tata-house` faz parte do DeliveryOS ou permanece produto separado; (c) o momento de integração do Entregas ao ecossistema.
