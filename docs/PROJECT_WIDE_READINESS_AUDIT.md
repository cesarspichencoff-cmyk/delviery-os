# Auditoria Geral Independente — DeliveryOS

> Data: 2026-07-20 · Anchor: `deliveryos-copiloto-v33-implementation` @ `101680a`
> Revisor: auditoria independente (código executado, dados seguidos, testes rodados).
> Documentos irmãos: [ARCHITECTURE_AND_MODULES](ARCHITECTURE_AND_MODULES.md) · [DATA_COVERAGE_MATRIX](DATA_COVERAGE_MATRIX.md) · [SECURITY_AND_PRIVACY_REVIEW](SECURITY_AND_PRIVACY_REVIEW.md) · [DEMO_READINESS](DEMO_READINESS.md) · [RELEASE_GATES](RELEASE_GATES.md) · [IMPROVEMENT_RECOMMENDATIONS](IMPROVEMENT_RECOMMENDATIONS.md)

## 1. Resumo executivo

O **Copiloto** é real, honesto e testado (317 suítes verdes, baseline visual congelado, Capacidade Viva human-v2 rodando em modo sombra sem tocar a interface). É demonstrável localmente hoje.

Mas a premissa da auditoria — "entrar com três módulos: Seleção, Entregas, Copiloto" — **não corresponde ao repositório**. **Seleção não existe** em lugar nenhum (nem código, nem tela, nem contrato). **Entregas não tem produto executável** — só o Gate Zero (documentos + protótipo visual estático), corretamente travado aguardando validação do César. **Não há shell** que una módulos. Portanto, o que existe de fato é **um módulo pronto para demo (Copiloto)**, **um domínio em fundação (Entregas)** e **um app irmão separado (tata-house)** que não é "Seleção".

O achado que o César levantou — Cozinha e Caixa "sem dados" — foi rastreado ponta a ponta: é **honesto e correto**, não bug. Caixa não tem fonte de dado (domínio futuro); Cozinha não tem praça própria no motor (sua produção já é contada dentro de "Quentes"). Nenhum dado real está sendo escondido.

Nenhum P0. Nenhum P1. Um P2 de segurança (dev server exposto na LAN) foi **corrigido** nesta auditoria com teste. O resto é P3 e decisões de produto pendentes do César.

## 2. Nota por área

| Área | Nota | Justificativa |
|---|---|---|
| Copiloto (funcional) | **9/10** | Roda limpo, testado, sombra isolada; -1 pela dependência de simulador (dado real não ligado) |
| Verdade dos dados | **9/10** | Rotulagem honesta, zumbi excluído, sem dado falso; -1 pela ambiguidade visual Cozinha/Caixa numa demo |
| Arquitetura | **8/10** | Domínios bem separados, calibração fora do runtime; -2 pela lacuna narrativa (Seleção/shell inexistentes vs. prometidos) |
| Segurança | **8/10** | Sem segredos, path traversal bloqueado, P2 corrigido; -2 por falta de headers/CI/HTTPS para além de local |
| Privacidade | **9/10** | Sem PII/ranking/score; sombra limpa; -1 por RLS do tata-house não verificável daqui |
| Testes | **8/10** | 317 verdes, servidor real coberto; -2 por flakiness de porta e ausência de CI |
| Prontidão demo | **7/10** | Copiloto pronto; -3 por Cozinha/Caixa escuras e ausência de shell/Seleção |
| Prontidão piloto | **3/10** | Falta dado real, auth, monitoramento |
| Prontidão produção | **1/10** | Distante |

## 3. Achados por severidade

### P0 (bloqueante) — **nenhum**

### P1 (crítico) — **nenhum**

### P2 (importante)
- **P2-1 — Dev server exposto na LAN servindo o repo inteiro.** `servir_v1.js` bindava `0.0.0.0`, tornando `src/`, `docs/`, `data/` legíveis por qualquer um na mesma rede. **CORRIGIDO** nesta auditoria: default `127.0.0.1`, opt-in `HOST=0.0.0.0` para celular, com teste (`tests/live/servidor-bind-seguro.test.js`).

### P3 (melhoria)
- **P3-1** Log sombra cresce sem rotação (mitigado por dedup + gitignore).
- **P3-2** Testes de servidor flakam por porta fixa (`pid%100`) sob squatting.
- **P3-3** Sem headers de segurança (CSP/X-Frame-Options) no dev server.
- **P3-4** Sem CI — nenhum gate automatizado contra regressão.
- **P3-5** Dados reais (`_tmp_*`) no working tree do Entregas (protegidos por gitignore; recomendável mover para `deliveryos-private-sources/`).

### Decisões de produto pendentes (não são defeitos — exigem César)
- **D-1** O que é "Seleção" e onde nasce. `tata-house` é parte do DeliveryOS ou produto separado?
- **D-2** Tratamento visual de Cozinha/Caixa "sem dados" (sem inventar dado).
- **D-3** Gate de início do código de Entregas.

## 4. Módulos

| Módulo | Existe? | Executável? | Estado |
|---|---|---|---|
| **Copiloto** | Sim | Sim | Pronto para demo local; sombra validada; 317 testes |
| **Entregas** | Docs sim, código não | Não | Gate Zero fechado; COR-ENTREGAS-V1 1.0.3; aguarda validação César |
| **Seleção** | **Não** | Não | Inexistente no repositório |
| Capacidade Viva | Sim (dentro do Copiloto) | Sim (sombra) | human-v2, hash `f248a173…`, 26/26 blind, `automatic_decisions_allowed:false` |
| tata-house | Sim (app separado) | Sim | Refeitório dos funcionários — não é módulo do DeliveryOS |

## 5. Dados

- **Fonte real (A):** timing/estado do pedido (iFood report). **Sintético (B):** composição por praça (rotulado). **Real (C):** cardápio 199 itens/8 praças.
- Demo usa **simulador D4A** rotulado explicitamente na tela.
- Zumbi excluído sem mascarar crítico (provado na Fase 2E.2). Precedência da fonte correta.
- Cozinha/Caixa "sem dados" = ausência honesta de fonte, não bug. Detalhe em [DATA_COVERAGE_MATRIX](DATA_COVERAGE_MATRIX.md).

## 6. Segurança e privacidade
Ver [SECURITY_AND_PRIVACY_REVIEW](SECURITY_AND_PRIVACY_REVIEW.md). Resumo: sem segredos, path traversal bloqueado, P2 corrigido, sombra sem PII/ranking.

## 7. Testes

- **317 verdes** (221 live + 43 capacidade-viva + 53 copiloto), rodados em execução limpa.
- Sombra: bandas de severidade, precedência de fonte, multiplicidade, dedup/heartbeat, falha segura ao vivo, isolamento de interface — todos cobertos por teste.
- **Flakiness conhecida (P3-2):** porta fixa; rodar 2× ou migrar para portas efêmeras.
- **Sem testes pulados injustificados, sem "esperadamente falhando", sem remoção para ficar verde.** (Os 3 testes de blind-v2 marcados "esperadamente falhando" em fase anterior já foram transformados/removidos corretamente na Fase 2D.10.)

## 8. Correções realizadas nesta auditoria

1. **P2-1 bind seguro** — `servir_v1.js` default `127.0.0.1` + opt-in `HOST=0.0.0.0`; teste novo `servidor-bind-seguro.test.js` (3 testes). Baseline visual intocado. Regressão: 317 verdes.

Nenhuma outra alteração de código. Baselines congelados (`6f04177` visual, `266d74d` doc, `101680a` sombra) preservados.

## 9. Correções pendentes (registradas, não aplicadas — exigem decisão)
D-1, D-2, D-3 (§3) + P3-1..P3-5 priorizados em [IMPROVEMENT_RECOMMENDATIONS](IMPROVEMENT_RECOMMENDATIONS.md).

## 10. Riscos
- **Narrativa vs. realidade:** apresentar "3 módulos" quando só 1 existe é o maior risco de credibilidade. Mitigado pelo roteiro honesto em [DEMO_READINESS](DEMO_READINESS.md).
- **Cozinha/Caixa escuras** podem ler como "quebrado" para plateia leiga.
- **Dado sintético** — sempre rotular.

## 11. Prontidão (ver [RELEASE_GATES](RELEASE_GATES.md))
- **Demonstração:** SIM (só Copiloto).
- **Piloto:** NÃO (falta dado real, auth, monitoramento).
- **Produção:** NÃO.

## 12. Veredito final

O Copiloto é um artefato honesto e bem construído — a engenharia respeita o contrato ("dado incompleto é aceitável, dado falso é veneno") de forma consistente, e o modo sombra é um exemplo raro de inteligência integrada sem contaminar a superfície. **Isso é real e defensável.**

O que NÃO é real é a moldura de "três módulos prontos para entrar". Seleção é um vazio; Entregas é uma fundação, não um produto; não há shell. A auditoria não encontrou maquiagem no código — encontrou uma **expectativa à frente da entrega**. O caminho seguro para uma demonstração 1000/10 não é construir depressa o que falta, é **apresentar com precisão o que existe**: um Copiloto pronto, uma inteligência que já observa em silêncio, e uma fundação de Entregas conduzida com disciplina. Prometer menos e provar tudo — em vez de prometer três e provar um.

**Próximo gate:** decisão do César sobre D-1/D-2/D-3, depois shell mínimo (U3) quando houver ≥2 módulos executáveis.
