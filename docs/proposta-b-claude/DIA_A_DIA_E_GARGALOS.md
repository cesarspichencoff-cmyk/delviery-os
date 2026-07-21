# Dia a Dia e Gargalos — 267 dias analisados

> Fonte: **70.071 pedidos**, 2025-10 → 2026-06 (9 meses completos).
> Dados por dia em `data/proposta-b-claude/operational-time-windows.json`.
> Proposta B (Claude), independente.

## 1. Método e limites declarados

**Simultaneidade** ("pedidos ativos"): cada pedido ocupa a operação de `received_at` até
`received_at + ready_wait_duration` (teto de 180 min contra registros implausíveis). Varredura
minuto a minuto, por dia.

**Sofrimento**: medido por **tempo médio até o botão "pronto"** (`ready_wait_duration`), sinal
**interno**. "% de atraso" **não** é usado como verdade — está contaminado por tempo prometido da
plataforma ([PADROES_DE_SUCESSO_E_FALHA](PADROES_DE_SUCESSO_E_FALHA.md) §2).

**Não observável nesta base** (verificado campo a campo): itens · unidades · variedade · praça ·
equipe · volumes · materiais · prontidão · observações · complementos · valor do pedido.
Portanto este documento descreve **quando** e **quanto**, nunca **por causa de qual item ou praça**.

## 2. A descoberta central: concentração, não volume

| Dia | Pedidos | Pico de ativos | Tempo até pronto | % atraso |
|---|---|---|---|---|
| **2026-03-21** | **304** | **28** | **22,0 min** | **4%** |
| **2025-12-26** | **159** | **58** | **39,1 min** | **58%** |

O dia de **304 pedidos** correu melhor que o de **159**. O primeiro teve pico de 28 simultâneos;
o segundo, 58. **Metade do volume, o dobro da concentração, o dobro do tempo interno.**

Não é quanto entra. É **quanto está vivo ao mesmo tempo**.

Isso é exatamente o que o César descreve na Conferência: a etapa engasga quando *chega tudo junto*,
não quando *chega muito*.

## 3. Piores dias (por sinal interno)

| Data | Pedidos | Pico | Ready | Natureza |
|---|---|---|---|---|
| 2026-06-12 | 388 | **94** | 45,3 min | Volume máximo do período — sobrecarga legítima |
| 2026-05-08 | 356 | 74 | 44,6 min | Volume alto + pico alto |
| 2026-06-29 | 247 | 59 | 41,3 min | **Volume médio, pico alto** — concentração |
| 2025-12-26 | **159** | 58 | 39,1 min | **Volume baixo, pico alto** — concentração pura |
| 2025-11-30 | 317 | 65 | 38,8 min | Volume alto + pico alto |

Dois dos cinco piores dias **não** tiveram volume alto. Um sistema disparando por volume não veria
nenhum dos dois.

## 4. Melhores dias de alto volume (≥284 pedidos)

| Data | Pedidos | Pico | Ready | % atraso |
|---|---|---|---|---|
| 2026-03-21 | 304 | **28** | 22,0 min | 4% |
| 2025-12-13 | 308 | 36 | 23,1 min | 14% |
| 2026-01-18 | 345 | 40 | 24,5 min | 16% |
| 2026-04-03 | 338 | 43 | 25,0 min | 7% |

**Padrão:** alto volume + pico baixo = dia excelente. A operação absorve muito bem quando o fluxo
chega **espaçado**. O inimigo é a rajada.

## 5. Perfil por dia da semana

| Dia | Dias | Pedidos/dia | Ready médio | Pico médio |
|---|---|---|---|---|
| Segunda | 39 | 223 | 23,8 min | 31 |
| Terça | 39 | 215 | **22,0 min** | **29** |
| Quarta | 36 | 237 | 26,0 min | 35 |
| Quinta | 36 | 240 | 24,8 min | 35 |
| **Sexta** | 39 | 308 | **31,3 min** | **59** |
| Sábado | 39 | 283 | 27,9 min | 43 |
| **Domingo** | 39 | **327** | 29,8 min | 54 |

**Sexta é o dia mais pesado** — não pelo volume (domingo tem mais), mas pelo **pico** (59 vs 54) e
pelo tempo interno (31,3 vs 29,8 min). Domingo faz **mais pedidos com menos concentração**.

Isso sustenta empiricamente a escala que o César já pratica (6–7 pessoas na Conferência sex/sáb):
sexta realmente exige mais. E sugere uma pergunta: **domingo, com volume maior, está com equipe
menor (4–5) — e ainda assim sofre menos.** Vale confirmar se isso é resiliência real ou se o
domingo tem composição de pedido diferente (hipótese não testável hoje — falta composição).

## 6. Distribuição do esforço

| Faixa de ativos | Minutos | % do tempo |
|---|---|---|
| < 30 | 175.977 | **91,2%** |
| 30–49 | 13.685 | 7,1% |
| 50–69 | 3.148 | 1,6% |
| 70+ | 207 | **0,1%** |

Pico diário: mediana 38 · p90 64 · p99 77 · máximo 94.

## 7. Classificação dos 267 dias

| Classe | Dias | Critério |
|---|---|---|
| Baixo volume | 86 | < 228 pedidos |
| Moderado fluido | 72 | 228–283, tempo interno normal |
| Alto volume **fluido** | **40** | ≥ 284, tempo interno normal |
| Alto volume **problemático** | **51** | ≥ 284, tempo interno > mediana×1,15 |
| Moderado **problemático** | **18** | 228–283, tempo interno alto |

Um dia **não** é bom por ter tido pouco volume — os 86 dias de baixo volume não são elogio, são
apenas dias fracos. O que importa são os **40 dias que absorveram muito sem sofrer** (o padrão a
replicar) e os **18 de volume médio que sofreram** (o alerta que hoje ninguém vê).

## 8. Anatomia dos engasgos — o que os dados permitem e o que não permitem

**Permitem ver:** a hora em que a concentração sobe, quanto tempo permanece, quando cede.
A correlação pico × tempo interno é **0,842** — a concentração explica bem o tempo interno.

**Não permitem ver:** *por que* a concentração aconteceu naquele dia; se faltou material, gente ou
se a composição era pesada. Os **69 dias problemáticos** (51 + 18) são **episódios sem causa
identificável** na base atual.

Isso não é limitação da análise — é o tamanho exato da lacuna de dados, e o argumento mais forte
para a coleta proposta em [PROPOSTA_B_MODELO_CONFERENCIA](PROPOSTA_B_MODELO_CONFERENCIA.md) §7.2.

## 9. Perguntas para o César

1. O que aconteceu em **fevereiro/2026** (atraso 56,6% vs 20,3% em março, com operação equivalente)? Mudou o tempo prometido?
2. **26/12/2025**: 159 pedidos, mas pico 58 e tempo interno alto. Foi rajada pós-feriado, equipe reduzida ou outra causa?
3. **12/06/2026**: 388 pedidos, pico 94 — foi evento previsível (data comemorativa) ou surpresa?
4. Domingo tem mais volume que sexta e sofre menos. Isso bate com a percepção de quem opera?
5. Existe registro de qual era a **equipe** nos dias problemáticos? Sem isso, a causa fica indeterminável.
