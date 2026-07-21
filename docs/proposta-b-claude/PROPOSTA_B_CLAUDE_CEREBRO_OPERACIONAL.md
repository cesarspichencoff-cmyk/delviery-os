# Proposta B — Cérebro Operacional do DeliveryOS (Claude)

> **Documento-mestre.** Proposta independente, produzida **sem qualquer leitura da Proposta A do Grok**.
> Worktree isolado `deliveryos-proposta-b-claude`, base `101680a`.
> Nenhum código de produto implementado. Nenhuma fonte original modificada.

## 0. Estado de completude — declaração honesta

Esta proposta foi produzida sob um limite de sessão da API que **interrompeu cinco frentes de
mineração delegadas** antes de qualquer entrega. Elas não escreveram nenhum arquivo.

| Estágio | Estado | Artefatos |
|---|---|---|
| 1 · Inventário de fontes | **Completo** | `INVENTARIO_FONTES_PRIMARIAS.md` |
| 2 · Preparo real dos itens | **NÃO EXECUTADO** | — |
| 3 · Memória humana (WhatsApp) | **NÃO EXECUTADO** | — |
| 4 · Linha do tempo | **Completo** | `DIA_A_DIA_E_GARGALOS.md` · `PADROES_DE_SUCESSO_E_FALHA.md` · `operational-time-windows.json` |
| 5 · Modelo da Conferência | **Completo** | `PROPOSTA_B_MODELO_CONFERENCIA.md` |
| 6 · Prontidão de abertura | **Completo** | `PROPOSTA_B_PRONTIDAO_ABERTURA.md` |
| 7 · Catálogo visual | **NÃO EXECUTADO** | — |
| 8 · Coletor iFood | **NÃO EXECUTADO** | — |
| 9 · Arquitetura e dados | **Completo** | `PROPOSTA_B_DATA_MODEL.md` · `PROPOSTA_B_ARQUITETURA_DO_CEREBRO.md` |
| 10 · Inovações | **Completo** | `PROPOSTA_B_INOVACOES.md` |
| 11 · Crítica cruzada | **Pendente** (só após congelamento) | — |

**Nada foi fabricado para preencher lacuna.** Os quatro estágios não executados estão ausentes,
não simulados. Uma proposta que inventasse conhecimento de preparo ou candidatos de foto sem ter
lido as fontes seria pior que uma proposta incompleta.

## 1. A tese em uma frase

> O cérebro operacional não é um modelo que prevê — é **um aparelho que sabe o que sabe**,
> e cuja utilidade cresce com a fonte sem nunca ter mentido no caminho.

## 2. As três descobertas que sustentam tudo

### 2.1 Existe muito mais tempo do que se supunha, e zero composição

**70.071 pedidos, 9 meses completos** (2025-10 → 2026-06), sem lacunas. Mas, verificado campo a campo:
**não existem itens, unidades, variedade, praça, equipe, volumes, materiais nem prontidão.**

Consequência: qualquer proposta que prometa medir *hoje* "itens, unidades, variedade, complexidade,
volumes" estaria inventando. A Proposta B trata isso como **restrição de projeto**, não como detalhe.

### 2.2 Não é volume — é concentração

| Dia | Pedidos | Pico de simultâneos | Tempo até pronto | % atraso |
|---|---|---|---|---|
| 2026-03-21 | **304** | **28** | 22,0 min | 4% |
| 2025-12-26 | **159** | **58** | 39,1 min | 58% |

O dia com **quase o dobro de pedidos** correu **muito melhor**. Correlação pico × tempo interno:
**r = 0,842**. Volume × sofrimento: fraca.

Existem **40 dias de alto volume fluidos** e **18 de volume moderado problemáticos** — 22% dos dias
seriam classificados errado por um sistema baseado em volume.

**Isto valida empiricamente a intuição do César sobre a Conferência:** a etapa engasga quando chega
tudo junto, não quando chega muito.

### 2.3 "% de atraso" é uma métrica contaminada

Fevereiro/2026: 56,6% de atraso. Março/2026: 20,3%. Volume (265 vs 254), pico (41 vs 37) e tempo
interno (28,7 vs 24,6 min) praticamente iguais. O atraso triplicou sem que a cozinha mudasse.

**Inferência:** o atraso é medido contra um *tempo prometido* configurável na plataforma. Usá-lo
como verdade ensinaria o sistema a reagir a uma configuração do iFood. A Proposta B adota o
**tempo até o botão "pronto"** como sinal interno e trata o atraso como contexto externo.

## 3. O modelo da Conferência (resumo)

Saída em **dois eixos**, nunca um score:

```
EIXO 1 · CARGA         quantos pedidos estão vivos agora
EIXO 2 · CONVERGÊNCIA  quantos ficaram prontos na mesma janela curta   ← contribuição própria
CONTEXTO               prontidão · dias semelhantes · ausências
```

Estados: Calmo · Fluindo · Atenção-carga · Atenção-convergência · Urgência · Leitura parcial ·
Fonte indisponível.

Sobre as faixas 30/50/70 propostas pelo César: **boas como eixo de carga** (91,2% do tempo <30 é
coerente com "silêncio é saúde"), mas **"70+" é raro demais** (207 minutos em 9 meses — 0,1% do
tempo) e **insuficientes sozinhas** (erram 22% dos dias). Precisam do segundo eixo.

Sobre `montagem_outros`: **não pode medir a carga da Conferência** — é sinal de *composição*, não de
*carga da etapa*, e sequer existe nos dados de pedido. Hipótese principal: Montagem/Sacolas.

Detalhe em [PROPOSTA_B_MODELO_CONFERENCIA](PROPOSTA_B_MODELO_CONFERENCIA.md).

## 4. Arquitetura (resumo)

Cinco camadas que nunca se misturam: **L0 bruto · L1 normalizado · L2 derivado · L3 hipótese ·
L4 decisão**. Regra de reconstrução: apagar L1–L3 e reconstruir de L0 + L4 deve devolver o mesmo estado.

Cinco funções: **observar · reconhecer · situar · declarar · lembrar**. O valor está em *situar* e
*lembrar* — é o que separa um painel de um cérebro.

Campo mais importante do modelo: **`fontes_ausentes[]`**, obrigatório em toda leitura. É ele que
permite dizer "leitura parcial" com precisão em vez de fingir completude.

Aprendizado: `observação → evidência → proposta → aprovação humana → regra vigente (datada)`.
Nunca `observação → regra`.

Detalhe em [PROPOSTA_B_ARQUITETURA_DO_CEREBRO](PROPOSTA_B_ARQUITETURA_DO_CEREBRO.md) e
[PROPOSTA_B_DATA_MODEL](PROPOSTA_B_DATA_MODEL.md).

## 5. A escada de três degraus

| Degrau | Fonte nova | O que passa a saber |
|---|---|---|
| **1 · Agora** | nenhuma | carga, concentração, tendência, comparação com dias semelhantes |
| **2 · Barato** | valor do pedido (já existe, foi descartado) + carimbo de "pronto" + prontidão mínima | magnitude do pedido; convergência medida; pressão vs fragilidade prévia |
| **3 · Real** | linhas de item + praça + equipe | carga por praça, complexidade real, volumes, risco por item |

O degrau 2 é o de melhor razão custo/benefício e está **subutilizado hoje**.

## 6. Recomendação de primeira ação

**Recuperar `VALOR DOS ITENS (R$)` do relatório bruto.** Custo quase zero, dado já coletado,
descartado por sanitização. É o único proxy de magnitude de pedido disponível sem coleta nova.
Ver [PROPOSTA_B_INOVACOES](PROPOSTA_B_INOVACOES.md) I9.

## 7. O que esta proposta recusa

Score opaco · previsão sem base declarada · completar dado ausente por estimativa apresentada como
observação · regra automática permanente · avaliação, ranking ou culpa individual · `montagem_outros`
como medidor da etapa · "% de atraso" como verdade · prometer complexidade/volumes sem fonte ·
crescer em sofisticação antes de crescer em fonte.

## 8. Decisões que dependem do César

1. Houve mudança de **tempo prometido** em fevereiro/2026?
2. `montagem_outros` corresponde a Montagem/Sacolas?
3. Janela de convergência: 6–10 min faz sentido na prática?
4. Autorizar recuperação do valor do pedido; autorizar carimbo absoluto de "pronto".
5. Confirmar referências de equipe da Conferência por dia da semana.
6. Enquadramento dos itens de prontidão (bloqueador/crítico/atenção/informativo).
7. **Autorizar a execução dos estágios 2, 3, 7 e 8**, interrompidos por limite de sessão.

## 9. Índice de artefatos

| Documento | Estágio |
|---|---|
| `INVENTARIO_FONTES_PRIMARIAS.md` | 1 |
| `DIA_A_DIA_E_GARGALOS.md` | 4 |
| `PADROES_DE_SUCESSO_E_FALHA.md` | 4 |
| `PROPOSTA_B_MODELO_CONFERENCIA.md` | 5 |
| `PROPOSTA_B_PRONTIDAO_ABERTURA.md` | 6 |
| `PROPOSTA_B_DATA_MODEL.md` | 9 |
| `PROPOSTA_B_ARQUITETURA_DO_CEREBRO.md` | 9 |
| `PROPOSTA_B_INOVACOES.md` | 10 |
| `data/proposta-b-claude/operational-time-windows.json` | 4 |
