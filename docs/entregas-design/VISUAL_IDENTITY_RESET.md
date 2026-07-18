# Visual Identity Reset — Entregas

| Campo | Valor |
|---|---|
| Tipo | Auditoria visual + plano de reconstrução |
| Worktree | `deliveryos-tata-evolucao` |
| Branch | `research/tata-evolucao-grok` |
| HEAD auditado | `4e5b03f` (protótipo rejeitado visualmente) |
| Referência visual | `deliveryos-fable` · `app-v1/` (somente leitura) |
| Protótipo | **não editado nesta missão** |
| Contratos / jornadas / regras 2A | **preservados** — só a pele muda |

---

## 1. Por que o protótipo atual falhou

O V0.1 de Entregas **acertou o domínio** (Trip, volumes, tentativas, offline, 20 cenários) e **errou a espécie visual**.

### Diagnóstico

| Sintoma | Evidência no protótipo atual |
|---|---|
| **Cards disfarçados** | `.trip-line` + `.panel` brancos com borda, sombra e padding de “cartão de SaaS” empilhados em lista |
| **Dashboard de gestão** | Aside `.queues` com chips de fila = menu lateral de status; layout grid 220px + main |
| **Texto de documentação no produto** | Lede: “Cada viagem é uma trajetória contínua… Não é grade de cards…”; insight “Em poucos segundos…” |
| **Etiquetas de processo, não trajetória** | `.stage-pill` repete 10 rótulos iguais; não é um fio vivo |
| **Excesso de chrome** | Topbar admin, toggle Mesa/Próximo, badges empilhados, painel de detalhe separado |
| **Distante do DeliveryOS** | Tokens próprios (`--deep` `#0c2e24`, panels brancos genéricos) em vez da gramática `app-v1` (papel quente, um estado, respiro, pílula de ação) |
| **Afirma o que não prova** | Diz “não é dashboard” na UI — o olho lê **admin console** |

**Conclusão:** não refinar cards. **Substituir a direção visual.**  
Contratos (Trip, E01–E10, volumes, fechamento real) **permanecem**.

---

## 2. Elementos visuais a remover

| Remover | Motivo |
|---|---|
| Menu lateral de filas (`.queues` / chips clicáveis de status) | Coluna de kanban disfarçada |
| Pilha de `.trip-line` + `.panel` brancos genéricos | Cards / grade |
| Lede e insights didáticos no produto | Documentação, não operação |
| Barra de 10 stage-pills idênticas | Etiquetas, não trajetória |
| Badges em excesso (status + rider + flags) | Ruído admin |
| Bordas pesadas + multi-shadow de card SaaS | Visual de gestão |
| Painel de detalhe como “segunda coluna de formulário” | Parte a superfície única |
| Frases “não é dashboard / não é grade de cards” | Meta-texto |
| Topbar de app de gestão como identidade | Concorrência com DeliveryOS |
| Mapa como possível centro (mesmo “gaveta”) se competir com o fio | Mapa só sob demanda, mínimo |
| Linguagem de botões de fila (“Sync / técnico”, “Pronta / fila loja”) | Microcopy de sistema |

---

## 3. Elementos do DeliveryOS a preservar (extraídos de `deliveryos-fable/app-v1`)

### 3.1 Arquivos consultados (somente leitura)

| Arquivo | O que ensina |
|---|---|
| `app-v1/style.css` | Tokens, Calmo/Ambiente/Foco, palco, anel, pílula, respiro, incomplete (barra vazia tracejada) |
| `app-v1/index.html` | Superfície única `#palco`; um estado por vez; demo no rodapé, **fora** do produto |
| `app-v1/README.md` | Sem dashboard, sem lista, sem KPI, sem segundo foco |
| `app-v1/app.js` | (referência de comportamento) Foco aproxima sem nova “página de app” |
| `prototipos/parados-agora/*` | Ancestral Campo Vivo (consulta de linhagem; V1 é a referência aprovada mais clara) |

### 3.2 Gramática a herdar

| Princípio DeliveryOS | Token / forma em fable | Adaptação Entregas |
|---|---|---|
| **Superfície única** | `.palco` flex, um modo | Um campo operacional de viagens — sem sidebar de status |
| **Calmo / Ambiente / Foco** | `body[data-mode]`; fundo aprofunda | Campo em “fluxo”; viagens periféricas = clima; **uma** viagem em Foco se aproxima |
| **Vazio = saúde** | respiro, pouco chrome | Muitas viagens calmas = traços finos; silêncio visual |
| **Luz = informação** | anel verde, brilho na ação | Progresso confirmado na trajetória “acende”; provisório não |
| **Tipografia editorial** | display forte, `letter-spacing` negativo | Título de ação / situação, não labels de grid |
| **Paleta** | papel `#F5F3ED`, tinta `#191813`, verde `#2E9E4F`, atenção `#9E5220`, neutro `#A8A296` | **Alinhar** tokens Entregas a estes (não o verde-admin `#0c2e24` + panel SaaS) |
| **Âmbar / atenção** | gravidade sem sirene | Bloqueio e exceção locais na trajetória |
| **Incompleto** | barra vazia tracejada / neutro | Segmentos tracejados = não comprovado / sync |
| **Falha técnica** | sussurro, nunca alarme de pessoa | Faixa técnica discreta (dados pendentes), sem culpar rider |
| **Movimento** | `surge`, `respira` 6s, cubic-bezier | Trajetória alonga/aprofunda; Foco scale sutil; reduce-motion |
| **Mobile** | uma coisa; CTA como **comando visual** (pílula) | Próximo Passo = pílula dominante; resto some |
| **Área se aproxima sem mudar de página** | Foco no mesmo palco | Viagem em Foco cresce **no campo**; detalhe não é “outra tela admin” |
| **Demo separada** | footer replay | Seletor demo continua **fora** do produto (demo-rail) |

### 3.3 O que **não** copiar cegamente

- Anel “Em fluxo” de pedidos em produção como metáfora de **viagem**  
- Mapa de 6 praças do Ambiente (é produção, não entrega)  
- Calmo/Ambiente/Foco como **texto na UI** de Entregas se competir com a operação de loja — o **comportamento** sim; o jargão cognitivo pode ficar implícito no desktop de expedição  

---

## 4. Novo conceito de desktop

**Campo de trajetórias** — um plano creme/papel onde **várias viagens coexistem como fios**.

```
┌─────────────────────────────────────────────────────────┐
│  [demo só se necessário — fora da gramática de produto] │
│                                                         │
│     ~~~ fio V-1038 (em rota, fino)                      │
│                                                         │
│     ═══ V-1043 ════╪════  (bloqueio local)  ═══         │
│         ↑                                               │
│      em Foco: profundidade, respiro, ação contextual    │
│                                                         │
│     ··· V-1042 preparando ···                           │
│                                                         │
│     ← V-1035 retorno ··· aberta                         │
└─────────────────────────────────────────────────────────┘
```

| Regra | Implementação conceitual |
|---|---|
| Sem colunas de status | Estado **na forma do fio** (contínuo, interrompido, aberto, fino) |
| Sem kanban | Sem “Pronta / Em rota / …” como colunas |
| Sem cards empilhados | Sem retângulos brancos empilhados com sombra SaaS |
| Sem tabela | Sem grid de atributos |
| Operação inteira perceptível | 3–7 fios periféricos + um em Foco |
| Detalhe na mesma superfície | Foco expande o fio; metadados essenciais **ao longo** da trajetória |
| Ações só no contexto | Pílula(s) junto ao nó que precisa de ato (ex.: handoff, fechamento) |

**Leitura em 5 segundos (prova, não texto na tela):**  
fio interrompido âmbar = bloqueio; fio contínuo vivo = em rota; fio fino calmo = periférico; ponta aberta = sem fechamento; direção alterada = retorno.

---

## 5. Novo conceito mobile

**Preservar “Próximo Passo”** — é o acerto do V0.1.

| Melhorar | Como (sem mini-dashboard) |
|---|---|
| Posição na viagem | **Minifio** horizontal de 3–5 nós (passado · agora · próximo), não 10 pills |
| Próxima parada | Display tipográfico (estilo título DeliveryOS) |
| Volumes | Uma linha: “2 volumes nesta parada” |
| Ação dominante | **Pílula verde** (comando visual; se for botão real no protótipo, mesma forma) |
| Conectividade | Sussurro / ponto técnico — nunca “erro seu” |
| Pendências essenciais | No máx. uma linha secundária (“1 tentativa aberta”) |

Sem lista de KPIs, sem mapa obrigatório, sem ranking, uma mão.

---

## 6. Viagem periférica

| Comportamento | Descrição |
|---|---|
| Espessura | Traço fino, baixa opacidade |
| Interação | Toque/hover aproxima levemente; clique eleva a Foco |
| Informação | Id curto + 1 sinal (ex.: “bloqueada”, “2/3”) — **sem** card de atributos |
| Movimento | Respiração mínima se em rota; quase estática se calma |
| Nunca | Empilhar como feed de notificações |

---

## 7. Viagem em Foco

| Comportamento | Descrição |
|---|---|
| Escala / profundidade | Aumenta no lugar; sombra suave tipo `.cartao` do V1 (um objeto soberano, não painel admin) |
| Conteúdo | Situação (o que importa agora) + progresso no fio + volumes se relevantes + **uma** ação dominante |
| Epistemologia | Segmentos confirmados sólidos; provisórios tracejados; technical neutro |
| Resto do campo | Outras viagens recuam, mas **permanecem** no campo |
| Transição | Mesmo palco — surge/escala, sem “navegar para página de detalhe” |

---

## 8. Bloqueio

| Visual | Significado |
|---|---|
| Interrupção local no fio (quebra, nó âmbar, gap) | Saída bloqueada / volume / conflito |
| Ação contextual no nó | “Conferir volumes” — não menu global |
| Microcopy | “Saída bloqueada” · “São esperados 3 volumes, mas apenas 2 foram conferidos.” |
| Proibido | Chip lateral “Não pode sair” como sistema de filas |

---

## 9. Exceção

| Visual | Significado |
|---|---|
| Nó ou marca na trajetória (parada com tensão) | Tentativa / E0x |
| Foco traz a pergunta e a próxima ação | Sheet rápido no mobile; no desktop, expansão local |
| Microcopy | “O cliente não respondeu. A entrega continua aberta.” |
| Proibido | Status genérico “falhou”; relatório longo |

---

## 10. Retorno

| Visual | Significado |
|---|---|
| Inversão ou curva do fio de volta ao “porto” (loja) | Direção muda |
| Nó de handoff de volta | Recebimento de volumes na loja |
| Periférico em retorno | Fio em sentido distinto, ainda aberto se sem confirmação |

---

## 11. Fechamento

| Estado | Forma do fio |
|---|---|
| **Fechada** | Terminal fechado, traço completo, baixa urgência, pode recuar a periférico |
| **Fechamento pendente** | Ponta aberta + marca de reconciliação |
| **Encerrada com ocorrência aberta** | Terminal fechado no transporte + marca residual de ocorrência (não esconder) |
| **Sincronização pendente** | Traço provisório/tracejado técnico no fim |

**Proibido:** botão “Concluir” que pinte o fio de completo com pendência escondida.

---

## 12. Linguagem de movimento

| Evento | Movimento |
|---|---|
| Entrar em Foco | surge + leve scale (como `surgeFoco` V1) |
| Progresso de parada | preenchimento do segmento (não confete) |
| Bloqueio | freio / gap — sem flash de alarme |
| Offline | estabilidade do traço + sussurro de sync |
| Calmo de campo | `respira` só no fio em rota, lento |
| `prefers-reduced-motion` | cortar animações não essenciais |

Movimento **significa estado**, nunca decora.

---

## 13. Microcopy corrigida

| Evitar (atual / genérico) | Preferir |
|---|---|
| Não pode sair | **Saída bloqueada** |
| Pronta / fila loja | **Pronta para sair** |
| Sync / técnico | **Dados pendentes** |
| Fechamento pendente | (permanece) |
| Volumes não batem | (permanece) ou frase completa dos 3 vs 2 |
| Discrepância de volumes | São esperados 3 volumes, mas apenas 2 foram conferidos. |
| Delivery attempt failed / falhou | O cliente não respondeu. A entrega continua aberta. |
| Trip completed | Viagem encerrada e conferida. |
| GPS unavailable | Localização indisponível. A viagem pode continuar. |
| Offline sync pending | Salvo no aparelho. Será enviado quando a conexão voltar. |
| “Cada viagem é uma trajetória contínua…” | **Remover da UI** |
| “Em poucos segundos…” | **Remover da UI** |
| “Não é grade de cards…” | **Remover da UI** |
| “Linha de confiança da viagem · protótipo…” como marca | Demo fora; produto sem meta-narrativa |

Demo-rail pode manter rótulo explícito de demonstração (como o footer de replay do V1) — **separado** do produto.

---

## 14. Arquivos que serão alterados na execução (próxima missão)

| Arquivo | Ação |
|---|---|
| `prototipos/entregas-v01/index.html` | Reestruturar markup: palco único; remover sidebar de filas e ledes; demo isolada |
| `prototipos/entregas-v01/styles.css` | **Substituir** gramática: tokens alinhados a `app-v1`; fios, não cards; Foco por profundidade |
| `prototipos/entregas-v01/app.js` | Re-render: trajetórias no campo; Foco contextual; manter dados/cenários/contratos; limpar strings de docs |
| `prototipos/entregas-v01/README.md` | Atualizar descrição da direção visual |
| `docs/entregas-design/DESIGN_HANDOFF.md` | Atualizar conceito visual pós-reset (só na execução) |

**Não alterar nesta execução planejada:**

- `docs/entregas-design/PRODUCT_DECISIONS.md`  
- `EXCEPTION_TAXONOMY.md`, `JOURNEY_AND_STATE_MATRIX.md`, `CONTENT_PRINCIPLES.md` (conteúdo de produto; microcopy de produto pode espelhar §13 sem reabrir regras)  
- `docs/deliveryos/*`  
- `app-v1/`, motores, outros worktrees  
- `deliveryos-fable` (somente referência)  

---

## 15. Critérios objetivos anti-dashboard genérico

A reconstrução **falha o gate** se qualquer item for verdadeiro:

1. Existe **menu lateral** ou coluna de filas como navegação principal de status.  
2. Viagens são **retângulos brancos empilhados** com sombra de card SaaS.  
3. Há **kanban**, colunas “A fazer / Em rota / Feito”, ou tabela densa.  
4. A UI contém meta-texto (“não é dashboard”, “trajetória contínua…”) no produto.  
5. Mais de **uma** ação visual competindo no mesmo Foco (lista de botões admin).  
6. Mapa ocupa **>25%** da área principal ou é o primeiro elemento lido.  
7. Aparece ranking, score, produtividade ou heat de pessoa.  
8. Fundo e chrome parecem **console admin** (barra escura + painéis brancos genéricos) em vez de **papel DeliveryOS**.  
9. Em 5 segundos não se distingue **bloqueio / em rota / aberta / fechada** só pela forma dos fios.  
10. Mobile mostra **mais de uma ideia principal** além de próxima ação + minifio.  
11. Detalhe da viagem **remove** as outras viagens do campo (navegação tipo “página 2”).  
12. Tokens principais **não** derivam da família papel/tinta/verde/atenção do `app-v1`.

**Passa o gate** se: campo de fios + um Foco profundo + Próximo Passo em pílula + contratos 2A intactos + demo fora do produto.

---

## 16. Resumo executivo

| | |
|---|---|
| **Falhou** | Pele de gestão (cards, filas, meta-texto) |
| **Vale** | Dados, 20 cenários, regras de volume/tentativa/offline |
| **Fazer** | Reconstruir visual como trajetória viva no organismo DeliveryOS |
| **Não fazer** | Refinar o card; copiar cegamente o anel de Calmo; inventar regras novas |

---

*Auditoria visual · sem alteração de protótipo · sem commit nesta missão.*
