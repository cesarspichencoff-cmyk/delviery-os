# Recomendações de Melhoria — DeliveryOS (Auditoria 2026-07-20)

> Só entra aqui melhoria com benefício concreto. Nada por moda.
> Coluna "Agora?" = precisa antes do próximo gate, ou pode esperar.

## 1. Produto / UX (exigem decisão do César — NÃO implementadas)

| # | Problema | Proposta | Benefício | Custo | Risco | Agora? |
|---|---|---|---|---|---|---|
| U1a | **Cozinha** hardcoded, desligada de `cozinha_quentes` (hoje contada em Quentes) | Ligar Cozinha a `cozinha_quentes`; remover `cozinha_quentes` de Quentes (sem duplicar) — ver [PRACAS_MAPPING_PROPOSAL](copiloto/PRACAS_MAPPING_PROPOSAL.md) | Cozinha passa a reagir a dado real; elimina ambiguidade | Baixo (toca `app.js`) | Decisão de produto | **Decisão César** |
| U1b | **Caixa** é célula operacional derivada, não praça — conclusão anterior ("sem função") corrigida | Leitura parcial explicável em modo sombra — ver [CAIXA_OPERATIONAL_MODEL](copiloto/CAIXA_OPERATIONAL_MODEL.md); **não** remover, **não** hardcodar | Célula viva e honesta; capta pressão da etapa final | Médio (nova leitura) | Decisão de produto | **Decisão César** |
| U1c | **Motoboy** é célula derivada futura (ENTREGAS), não deve mostrar número simulado | Enquanto não integrado: "Entregas — aguardando integração" | Honestidade; sem dado falso | Baixo | Decisão de produto | **Decisão César** |
| U2 | SELECAO citado como módulo, mas nenhuma implementação localizada | Definir o que é Seleção, onde nasce, se `tata-house` faz parte do DeliveryOS | Alinha narrativa com realidade | — | Estratégico | **Decisão César** |
| U3 | Não há shell/tela inicial dos módulos | Shell mínimo com registro de módulos + estado honesto por módulo ("pronto" / "em validação" / "em desenvolvimento") | Entrada única, escalável para módulos futuros | Médio | Baixo | Quando ≥2 módulos executáveis |

### Proposta técnica mínima de shell (U3 — para decisão, não implementação)

- Um registro declarativo de módulos: `[{id:"copiloto", estado:"pronto", entrada:"/app-v1/"}, {id:"entregas", estado:"em_validacao"}, {id:"selecao", estado:"indefinido"}]`.
- Shell = casca sem lógica de domínio: só lista módulos, mostra estado honesto, navega para o que está pronto, e mostra "em desenvolvimento" (não botão morto) para o resto.
- Sem acoplamento: cada módulo continua servível isolado. O shell não importa código de domínio.
- **Não implementar antes da decisão do César sobre U2** (senão o shell nasce com um módulo fantasma).

## 2. Técnicas (baixo risco — algumas aplicáveis já)

| # | Problema | Proposta | Benefício | Agora? |
|---|---|---|---|---|
| T1 | Dev server expunha repo na LAN | ✅ **APLICADO** — bind `127.0.0.1` default, `HOST=0.0.0.0` opt-in + teste | Fecha superfície de rede | Feito |
| T2 | Testes de servidor com porta `pid%100` flakam | Portas efêmeras (`server.listen(0)`) ou checagem de porta livre | Suíte determinística | Antes de CI |
| T3 | Log sombra cresce sem limite | Rotação por tamanho/linhas + retenção configurável | Evita crescimento indefinido em execução longa | Antes de piloto |
| T4 | Sem CI | GitHub Actions rodando as 3 suítes por push | Impede regressão silenciosa | Antes de piloto |
| T5 | Sem headers de segurança no dev server | `X-Content-Type-Options`, `X-Frame-Options`, CSP básica | Defesa em profundidade | Antes de exposição real |
| T6 | Dados reais soltos no working tree do Entregas | Mover `_tmp_*` para `deliveryos-private-sources/` | Higiene; alinha ao CLAUDE.md | Oportuno |

## 3. Tecnologias (avaliar quando houver benefício concreto)

| Tecnologia | Problema que resolve | Custo | Prioridade | Precisa agora? |
|---|---|---|---|---|
| Contratos tipados (zod/schema) no payload D4A | Divergência silenciosa entre adapter e consumidores | Baixo-médio | Média | Antes de dados reais |
| Error tracking (Sentry/similar) | Erros de runtime invisíveis em piloto | Baixo | Média | No piloto |
| Observabilidade/tracing | Seguir um pedido ponta a ponta em produção | Médio | Baixa | Produção |
| Autenticação + RBAC | Nenhum controle de acesso hoje | Médio-alto | Alta | Piloto |
| CI + preview environments | Regressão e revisão | Baixo | Alta | Antes de piloto |
| Testes E2E (Playwright) | Cobertura de DOM real além do smoke atual | Médio | Baixa | Pode esperar |
| Fila/eventos (para Entregas) | Idempotência de eventos de Trip | Médio | Média | Quando Entregas virar código |

**Não recomendado agora:** microserviços, Kubernetes, GraphQL, mapas em tempo real — nenhum tem problema concreto que justifique o custo nesta fase. Modo sombra e motor rodam em Node sem dependência; manter a simplicidade é uma vantagem, não uma dívida.

## 4. Princípio

A base é sólida e honesta. As melhores "melhorias" agora não são tecnologia nova — são **decisões de produto pendentes** (U1, U2, U3) que o César precisa tomar antes de qualquer implementação. Implementar shell ou UX de Cozinha/Caixa sem essa decisão seria construir sobre suposição — exatamente o que o contrato proíbe.
