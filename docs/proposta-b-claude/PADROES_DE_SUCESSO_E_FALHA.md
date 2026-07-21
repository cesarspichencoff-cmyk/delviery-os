# Padrões de Sucesso e Falha — o que separa um dia bom de um dia ruim

> Análise de **70.071 pedidos** em **267 dias** (2025-10 → 2026-06).
> Proposta B (Claude), independente. Todos os números foram computados sobre a fonte real.

## 1. O achado que muda a pergunta

A pergunta natural é "quanto volume a operação aguenta?". Os dados dizem que **essa é a pergunta errada**.

| Dia | Pedidos | Pico de ativos | Tempo até "pronto" | % atrasados |
|---|---|---|---|---|
| 2026-06-22 | 268 | **42** | 25,4 min | **8,2%** |
| 2026-02-04 | 264 | **37** | 31,0 min | **70,8%** |

Volume praticamente idêntico. O dia **com pico MAIOR** (42) correu bem; o de pico **menor** (37) foi
o segundo pior do período. **Volume e pico não explicam o resultado.**

Distribuição das classes nos 267 dias:

| Classe | Dias |
|---|---|
| Baixo volume | 86 |
| Moderado fluido | 72 |
| **Alto volume FLUIDO** | **40** |
| **Alto volume PROBLEMÁTICO** | **51** |
| **Moderado PROBLEMÁTICO** | **18** |

Existem **40 dias de alto volume que correram bem** e **18 dias de volume moderado que sofreram**.
Um sistema que dispara por volume erraria nos dois grupos — 58 dias de 267 (22%).

## 2. Descoberta metodológica: "% de atraso" não é medida limpa

Comparação mensal (mesma operação, meses vizinhos):

| Mês | Pedidos/dia | Pico médio | Tempo até "pronto" | **% atrasados** |
|---|---|---|---|---|
| 2026-02 | 265 | 41 | 28,7 min | **56,6%** |
| 2026-03 | 254 | 37 | 24,6 min | **20,3%** |

Volume, pico e tempo interno praticamente iguais — mas o atraso **triplica**. O tempo até o botão
"pronto" piorou 17%; o atraso piorou 179%.

**Interpretação (inferência, não fato):** "atraso" é medido contra um **tempo prometido**
configurado na plataforma. Quando a promessa muda, o indicador muda sem que a cozinha tenha mudado.
Usar "% de atraso" como verdade de sofrimento ensinaria o sistema a reagir a uma **configuração do
iFood**, não à operação.

**Consequência de projeto:** a Proposta B adota **`ready_wait_duration`** (tempo do recebimento até
o botão "pronto") como sinal interno de sofrimento, e trata "% de atraso" como **contexto externo**,
nunca como alvo. Isso precisa de confirmação do César sobre mudanças de tempo prometido em fev/2026.

## 3. O que a simultaneidade realmente prediz

Correlação de Pearson sobre 267 dias:

| Par | r |
|---|---|
| Pico de ativos × **tempo até "pronto"** | **0,842** |
| Volume do dia × tempo até "pronto" | 0,641 |
| Pico de ativos × % atrasados | 0,390 |
| Volume do dia × % atrasados | 0,264 |

**Simultaneidade é um bom preditor do tempo interno (0,842)** — quanto mais pedidos vivos ao mesmo
tempo, mais tempo cada um fica parado. É a variável certa para dimensionar a etapa final.
Mas explica pouco do atraso percebido — coerente com §2.

## 4. Onde a operação realmente vive

Varredura minuto a minuto, todos os dias somados:

| Faixa de pedidos ativos | Minutos | % do tempo |
|---|---|---|
| **< 30** | 175.977 | **91,2%** |
| 30–49 | 13.685 | 7,1% |
| 50–69 | 3.148 | 1,6% |
| **70+** | **207** | **0,1%** |

Pico diário: mediana **38**, p90 **64**, p99 **77**, máximo **94**.
Dias que chegam a ≥70 ativos: **13 de 267 (4,9%)**.

**Leitura:** a operação passa 91% do tempo em estado tranquilo. O estado "70+" existe por
**207 minutos em nove meses** — cerca de 3,5 horas no total. Isso confirma a tese do produto
("foco é raro"), mas também mostra que uma faixa de urgência baseada em 70 ativos quase **nunca**
dispararia — e quando disparasse, seria tarde.

## 5. Avaliação das faixas propostas (30 / 50 / 70)

| Aspecto | Veredito |
|---|---|
| Existem estados distintos? | **Sim** — as faixas separam regimes reais |
| 70+ como "Urgência" | **Raro demais** — 0,1% do tempo; chega tarde |
| <30 como "Calmo" | **Bom** — cobre 91% do tempo, coerente com "silêncio é saúde" |
| Servem para prever sofrimento? | **Parcialmente** — pico prediz tempo interno (0,84), não atraso (0,39) |
| Bastam sozinhas? | **Não** — 58 dias (22%) seriam classificados errado |

**Recomendação:** manter as faixas como **eixo de carga**, mas **não** como o estado da célula.
O estado precisa de um segundo eixo (tendência/aceleração) — ver
[PROPOSTA_B_MODELO_CONFERENCIA](PROPOSTA_B_MODELO_CONFERENCIA.md).

## 6. O que estes dados **não** podem dizer

Foi verificado campo a campo: os 70.071 pedidos **não têm** itens, unidades, variedade, praça,
equipe, volumes, materiais, prontidão, observações nem valor (descartado na sanitização).

Portanto **não é possível**, com a base atual, afirmar que um dia sofreu por:
composição do pedido · pedido grande · falta de material · equipe reduzida · item novo · praça específica.

Essas são exatamente as causas que o César descreve na Conferência — e **nenhuma delas é
observável hoje**. Os 51 dias "alto volume problemático" e os 18 "moderado problemático" são
**episódios sem causa identificável na base atual**. Isso não é falha da análise: é o tamanho
real da lacuna, e é o argumento mais forte para a coleta proposta.

## 7. Hipóteses a testar quando houver fonte

1. Dias problemáticos com volume moderado têm **composição mais pesada** (pedidos grandes/multi-praça).
2. O engasgo da Conferência começa quando **muitos pedidos ficam prontos quase juntos**, não quando muitos entram.
3. Fevereiro/2026 teve mudança de **tempo prometido**, não de operação.
4. Equipe abaixo da referência do dia da semana antecipa dia problemático.

Nenhuma delas é afirmada como fato. Todas são testáveis assim que existirem itens, prontidão e escala.
